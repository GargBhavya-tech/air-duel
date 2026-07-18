import { useEffect, useRef, useState, useCallback } from 'react';
import { extractFeatures, MOVES, WINDOW_FRAMES, NUM_FEATURES } from '../lib/features.js';

const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
};

const HISTORY_LEN = 12;       // wider window = easier to catch peak
const CALIB_FRAMES = 30;
const MOVE_COOLDOWN_MS = 400;
const MODEL_CONFIDENCE_THRESHOLD = 0.75;
const MODEL_URL = '/models/gesture-classifier/model.json';

// ── Tuning knobs — lower = easier to trigger ──────────────────────────────
const PUNCH_SPEED_MULT = 0.8;  // multiplied by scale*4 for final threshold
const EXTEND_MULT      = 0.9;  // wrist must be this far from shoulder
const KICK_KNEE_MULT   = 0.3;  // how far knee must rise above hip
const DODGE_SHIFT_MULT = 0.7;  // hip shift required for dodge
const BLOCK_WRIST_MULT = 1.8;  // max wrist spread for block (wider = easier)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * usePoseTracker
 *
 * Handles webcam + MediaPipe Pose + move classification.
 *
 * Phase 2 behavior: tries to load a trained model from MODEL_URL on
 * mount. If found, live inference runs through the trained CNN over a
 * sliding window of normalized landmarks (via classifyMoveTrained).
 * If the model fails to load (not trained yet, 404, etc.), this falls
 * back to the Phase 1 rule-based classifier (classifyMoveRuleBased)
 * automatically — no code changes needed to run without a trained
 * model yet. This dual-path setup is also your demo-day safety net:
 * if the trained model misbehaves on venue lighting, you can force
 * the rule-based fallback by simply removing/renaming the model files.
 */
export function usePoseTracker({ onMove, onRig, videoRef, canvasRef, active }) {
  const [status, setStatus] = useState('idle'); // idle | requesting | calibrating | ready | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [calibProgress, setCalibProgress] = useState(0);
  const [classifierMode, setClassifierMode] = useState('rule-based'); // 'rule-based' | 'trained'

  const historyRef = useRef([]);
  const windowBufferRef = useRef([]); // rolling feature windows for the trained model
  const calibSamplesRef = useRef([]);
  const calibDataRef = useRef({ torsoScale: 0.25, hipCenterX: 0.5 });
  const calibratedRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const cameraRef = useRef(null);
  const poseRef = useRef(null);
  const modelRef = useRef(null);
  const tfRef = useRef(null);

  // Peak speed: check consecutive frame deltas and take the max.
  // Much better than endpoint average because a punch decelerates
  // near full extension — the average undercounts the actual swing.
  const getPeakSpeed = useCallback((idx) => {
    const h = historyRef.current;
    if (h.length < 2) return 0;
    let peak = 0;
    for (let i = 1; i < h.length; i++) {
      const a = h[i - 1], b = h[i];
      const pa = a.lm[idx], pb = b.lm[idx];
      if (!pa || !pb) continue;
      const dt = Math.max((b.t - a.t) / 1000, 0.001);
      const speed = Math.hypot((pb.x - pa.x) / dt, (pb.y - pa.y) / dt);
      if (speed > peak) peak = speed;
    }
    return peak;
  }, []);

  // Was the wrist extended (far from shoulder) at ANY point in the history?
  // Decouples "how fast" from "how extended" — they rarely peak on the same frame.
  const wasExtendedRecently = useCallback((shoulderIdx, wristIdx, scale) => {
    const h = historyRef.current;
    for (let i = 0; i < h.length; i++) {
      const s = h[i].lm[shoulderIdx], w = h[i].lm[wristIdx];
      if (!s || !w) continue;
      if (Math.hypot(w.x - s.x, w.y - s.y) > scale * EXTEND_MULT) return true;
    }
    return false;
  }, []);

  // ---------- Phase 1: rule-based classifier (fallback path) ----------
  const classifyMoveRuleBased = useCallback((lm) => {
    const now = performance.now();
    if (now < cooldownUntilRef.current) return null;

    const lw = lm[LM.LEFT_WRIST],  rw = lm[LM.RIGHT_WRIST];
    const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
    const lh = lm[LM.LEFT_HIP],    rh = lm[LM.RIGHT_HIP];
    if (!lw || !rw || !ls || !rs || !lh || !rh) return null;

    const scale = calibDataRef.current.torsoScale || 0.25;

    // ── Debug dump (open browser DevTools Console to see) ────────────────────
    const peakLW_d = getPeakSpeed(LM.LEFT_WRIST);
    const peakRW_d = getPeakSpeed(LM.RIGHT_WRIST);
    const lExt_d   = wasExtendedRecently(LM.LEFT_SHOULDER,  LM.LEFT_WRIST,  scale);
    const rExt_d   = wasExtendedRecently(LM.RIGHT_SHOULDER, LM.RIGHT_WRIST, scale);
    const wristDist_d = Math.abs(lw.x - rw.x);
    const lkLm = lm[LM.LEFT_KNEE], rhLm = lh;
    const kneeRise_d = lkLm && rhLm ? (rhLm.y - lkLm.y) / scale : 0;
    console.debug(
      `[pose] scale=${scale.toFixed(3)}` +
      ` | peakL=${peakLW_d.toFixed(2)} peakR=${peakRW_d.toFixed(2)}` +
      ` thresh=${(PUNCH_SPEED_MULT * scale * 4).toFixed(2)}` +
      ` | extL=${lExt_d} extR=${rExt_d}` +
      ` | wristDist=${wristDist_d.toFixed(3)} (block<${(scale * 0.7).toFixed(3)})` +
      ` | kneeRise=${kneeRise_d.toFixed(2)} (kick>${KICK_KNEE_MULT})`
    );

    const PUNCH_SPEED = PUNCH_SPEED_MULT * scale * 4;

    // ── PUNCH: fast wrist that was extended — check FIRST (it's a motion) ──
    const peakLW = getPeakSpeed(LM.LEFT_WRIST);
    const peakRW = getPeakSpeed(LM.RIGHT_WRIST);
    const leftExt  = wasExtendedRecently(LM.LEFT_SHOULDER,  LM.LEFT_WRIST,  scale);
    const rightExt = wasExtendedRecently(LM.RIGHT_SHOULDER, LM.RIGHT_WRIST, scale);
    if (leftExt  && peakLW > PUNCH_SPEED) return 'punch';
    if (rightExt && peakRW > PUNCH_SPEED) return 'punch';

    // ── KICK: knee raised above hip in any recent frame ────────────────────
    const h = historyRef.current;
    const kicked = h.some((f) => {
      const flk = f.lm[LM.LEFT_KNEE],  flh = f.lm[LM.LEFT_HIP];
      const frk = f.lm[LM.RIGHT_KNEE], frh = f.lm[LM.RIGHT_HIP];
      return (flk && flh && flk.y < flh.y - scale * KICK_KNEE_MULT) ||
             (frk && frh && frk.y < frh.y - scale * KICK_KNEE_MULT);
    });
    if (kicked) return 'kick';

    // ── DODGE: hip center shifted from calibrated baseline ─────────────────
    const hipCenterX = (lh.x + rh.x) / 2;
    const hipShift   = hipCenterX - calibDataRef.current.hipCenterX;
    if (Math.abs(hipShift) > scale * DODGE_SHIFT_MULT) {
      return hipShift < 0 ? 'dodge_left' : 'dodge_right';
    }

    // ── BLOCK: wrists deliberately crossed and raised to chest level ────────
    // Requires a TIGHT cross (< 0.7x scale) AND both wrists raised to chest
    // (between shoulder height and hip height). Checked LAST so it can't
    // mask punches.
    const wristDist = Math.abs(lw.x - rw.x);
    const shoulderMidY = (ls.y + rs.y) / 2;
    const hipMidY     = (lh.y + rh.y) / 2;
    const wristsMidY  = (lw.y + rw.y) / 2;
    const wristsAtChest = wristsMidY > shoulderMidY && wristsMidY < hipMidY;
    if (wristDist < scale * 0.70 && wristsAtChest) return 'block';

    return null;
  }, [getPeakSpeed, wasExtendedRecently]);


  // ---------- Phase 2: trained model classifier ----------
  const classifyMoveTrained = useCallback((lm) => {
    const now = performance.now();
    if (now < cooldownUntilRef.current) return null;
    if (!modelRef.current || !tfRef.current) return null;

    windowBufferRef.current.push(extractFeatures(lm));
    if (windowBufferRef.current.length > WINDOW_FRAMES) windowBufferRef.current.shift();
    if (windowBufferRef.current.length < WINDOW_FRAMES) return null;

    const tf = tfRef.current;
    const input = tf.tensor3d([windowBufferRef.current], [1, WINDOW_FRAMES, NUM_FEATURES]);
    const predTensor = modelRef.current.predict(input);
    const probs = predTensor.dataSync();
    input.dispose();
    predTensor.dispose();

    let bestIdx = 0, bestVal = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > bestVal) { bestVal = probs[i]; bestIdx = i; }
    }
    const label = MOVES[bestIdx];
    if (label === 'idle' || bestVal < MODEL_CONFIDENCE_THRESHOLD) return null;
    return label;
  }, []);

  const finishCalibration = useCallback(() => {
    const samples = calibSamplesRef.current;
    let scaleSum = 0, hipXSum = 0;
    samples.forEach((lm) => {
      const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
      const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
      const shoulderCenter = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
      const hipCenter = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
      scaleSum += Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y);
      hipXSum += hipCenter.x;
    });
    calibDataRef.current = {
      torsoScale: scaleSum / samples.length,
      hipCenterX: hipXSum / samples.length,
    };
    calibratedRef.current = true;
    setStatus('ready');
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function setup() {
      setStatus('requesting');

      // Try loading the trained model first. If it's not there (404 —
      // most likely because Phase 2 training hasn't happened yet, or
      // the model folder wasn't copied into frontend/public/models/),
      // silently fall back to the rule-based classifier.
      try {
        const tf = await import('@tensorflow/tfjs');
        tfRef.current = tf;
        const model = await tf.loadLayersModel(MODEL_URL);
        modelRef.current = model;
        setClassifierMode('trained');
        console.log('[usePoseTracker] Trained gesture classifier loaded.');
      } catch (e) {
        setClassifierMode('rule-based');
        console.log('[usePoseTracker] No trained model found, using rule-based classifier.', e.message);
      }

      // Kalidokit — maps MediaPipe landmarks to bone-rotation angles for
      // the player's 3D avatar (purely visual; game logic still runs off
      // the move classifier above, not this).
      const Kalidokit = await import('kalidokit');

      const { Pose } = await import('@mediapipe/pose');
      const { Camera } = await import('@mediapipe/camera_utils');

      const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });
      pose.setOptions({
        modelComplexity: 2,          // max accuracy
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
      // Note: the legacy @mediapipe/pose JS solution always emits
      // results.poseWorldLandmarks alongside results.poseLandmarks —
      // no extra option needed to enable it (unlike the newer Tasks API).

      pose.onResults((results) => {
        if (cancelled || !results.poseLandmarks) return;
        const lm = results.poseLandmarks;
        const t = performance.now();

        if (canvasRef?.current && videoRef?.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          canvas.width = videoRef.current.videoWidth || 960;
          canvas.height = videoRef.current.videoHeight || 720;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          drawSkeleton(ctx, lm, canvas.width, canvas.height);
        }

        historyRef.current.push({ t, lm });
        if (historyRef.current.length > HISTORY_LEN) historyRef.current.shift();

        // Live rig for the player's 3D avatar — runs every frame regardless
        // of calibration/game state, purely cosmetic.
        if (onRig && results.poseWorldLandmarks) {
          try {
            const rig = Kalidokit.Pose.solve(results.poseWorldLandmarks, lm, {
              runtime: 'mediapipe',
              video: videoRef?.current || null,
              enableLegs: true,
            });
            // Pass both Kalidokit rotations AND raw 3D world landmarks so
            // Fighter.jsx can drive every bone with direct geometry.
            if (rig) onRig({ rig, wlm: results.poseWorldLandmarks, lm });
          } catch (e) {
            // solver can occasionally throw on a bad/partial frame — skip it
          }
        }

        if (!calibratedRef.current) {
          calibSamplesRef.current.push(lm);
          setStatus('calibrating');
          setCalibProgress(calibSamplesRef.current.length);
          if (calibSamplesRef.current.length >= CALIB_FRAMES) finishCalibration();
          return;
        }

        const move = modelRef.current
          ? classifyMoveTrained(lm)
          : classifyMoveRuleBased(lm);

        if (move) {
          cooldownUntilRef.current = t + MOVE_COOLDOWN_MS;
          onMove?.(move);
        }
      });

      poseRef.current = pose;

      if (!videoRef?.current) return;
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (poseRef.current) await poseRef.current.send({ image: videoRef.current });
        },
        width: 960,
        height: 720,
      });
      cameraRef.current = camera;
      await camera.start();
    }

    setup().catch((e) => {
      if (!cancelled) {
        setStatus('error');
        setErrorMsg(e.message || String(e));
      }
    });

    return () => {
      cancelled = true;
      cameraRef.current?.stop?.();
      poseRef.current?.close?.();
      modelRef.current?.dispose?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { status, errorMsg, calibProgress, classifierMode };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton rendering — variable-width lines by body region, glowing joints
// ─────────────────────────────────────────────────────────────────────────────

// Each connection: [fromIdx, toIdx, lineWidth, glowColor, strokeColor]
const SKELETON_CONNECTIONS = [
  // ── Torso / core (thickest, cyan)
  [11, 12, 10, '#00E5FF', 'rgba(0,220,255,0.5)'],   // shoulder to shoulder
  [11, 23,  9, '#00E5FF', 'rgba(0,200,255,0.5)'],   // L shoulder to L hip
  [12, 24,  9, '#00E5FF', 'rgba(0,200,255,0.5)'],   // R shoulder to R hip
  [23, 24,  9, '#00E5FF', 'rgba(0,200,255,0.5)'],   // hip to hip

  // ── Left arm (orange tones)
  [11, 13,  7, '#FF9040', 'rgba(255,160,80,0.5)'],  // L shoulder → L elbow
  [13, 15,  5, '#FFB347', 'rgba(255,200,100,0.5)'], // L elbow → L wrist

  // ── Right arm (orange tones)
  [12, 14,  7, '#FF9040', 'rgba(255,160,80,0.5)'],  // R shoulder → R elbow
  [14, 16,  5, '#FFB347', 'rgba(255,200,100,0.5)'], // R elbow → R wrist

  // ── Left leg (green tones)
  [23, 25,  9, '#00D060', 'rgba(0,200,100,0.5)'],   // L hip → L knee
  [25, 27,  7, '#7FFF80', 'rgba(120,255,140,0.5)'], // L knee → L ankle
  [27, 29,  4, '#80FF90', 'rgba(150,255,160,0.4)'], // L ankle → L heel
  [27, 31,  4, '#80FF90', 'rgba(150,255,160,0.4)'], // L ankle → L toe

  // ── Right leg (green tones)
  [24, 26,  9, '#00D060', 'rgba(0,200,100,0.5)'],
  [26, 28,  7, '#7FFF80', 'rgba(120,255,140,0.5)'],
  [28, 30,  4, '#80FF90', 'rgba(150,255,160,0.4)'],
  [28, 32,  4, '#80FF90', 'rgba(150,255,160,0.4)'],

  // ── Neck lines (white)
  [11, 0,   4, '#FFFFFF', 'rgba(255,255,255,0.35)'],
  [12, 0,   4, '#FFFFFF', 'rgba(255,255,255,0.35)'],
];

// Joint radius and color
function jointStyle(idx) {
  // Wrists — bright red, largest
  if (idx === 15 || idx === 16) return { r: 9, color: '#FF4D2E', glow: 22 };
  // Shoulders
  if (idx === 11 || idx === 12) return { r: 8, color: '#00E5FF', glow: 18 };
  // Hips
  if (idx === 23 || idx === 24) return { r: 8, color: '#FFE066', glow: 18 };
  // Elbows
  if (idx === 13 || idx === 14) return { r: 7, color: '#FF9040', glow: 14 };
  // Knees
  if (idx === 25 || idx === 26) return { r: 7, color: '#00D060', glow: 14 };
  // Ankles
  if (idx === 27 || idx === 28) return { r: 6, color: '#7FFF80', glow: 12 };
  // Nose/face
  if (idx === 0) return { r: 5, color: '#FFFFFF', glow: 10 };
  // Feet / hands / minor points
  return { r: 3, color: '#00E5FF', glow: 6 };
}

// Key landmark indices we always draw
const DRAW_LANDMARKS = new Set([
  0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32
]);

function drawSkeleton(ctx, lm, w, h) {
  if (!lm || lm.length < 17) return;
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  // ── Pass 1: connection lines ──────────────────────────────────────────────
  for (const [a, b, lineW, glowCol, strokeCol] of SKELETON_CONNECTIONS) {
    const pa = lm[a], pb = lm[b];
    if (!pa || !pb) continue;
    const vis = Math.min(pa.visibility ?? 1, pb.visibility ?? 1);
    if (vis < 0.18) continue;

    const ax = pa.x * w, ay = pa.y * h;
    const bx = pb.x * w, by = pb.y * h;
    ctx.globalAlpha = Math.min(1, vis) * 0.9;

    // Thick outer glow pass
    ctx.shadowBlur  = 16;
    ctx.shadowColor = glowCol;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth   = lineW;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    // Thin bright inner pass
    ctx.shadowBlur  = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = Math.max(1, lineW * 0.22);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // ── Pass 2: landmark joints ───────────────────────────────────────────────
  for (let i = 0; i < lm.length; i++) {
    if (!DRAW_LANDMARKS.has(i)) continue;
    const p = lm[i];
    if (!p) continue;
    const vis = p.visibility ?? 1;
    if (vis < 0.22) continue;

    const x = p.x * w, y = p.y * h;
    const { r, color, glow } = jointStyle(i);

    ctx.globalAlpha = Math.min(1, vis);

    // Outer glow ring
    ctx.shadowBlur  = glow;
    ctx.shadowColor = color;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Bright white center
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}
