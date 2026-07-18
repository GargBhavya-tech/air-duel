import { useEffect, useRef, useState, useCallback } from 'react';
import { extractFeatures, MOVES, WINDOW_FRAMES, NUM_FEATURES } from '../lib/features.js';

const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
};

const HISTORY_LEN = 6;
const CALIB_FRAMES = 30;
const MOVE_COOLDOWN_MS = 350;
const MODEL_CONFIDENCE_THRESHOLD = 0.75;
const MODEL_URL = '/models/gesture-classifier/model.json';

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

  const getVel = useCallback((idx) => {
    const h = historyRef.current;
    if (h.length < 2) return { speed: 0 };
    const a = h[0], b = h[h.length - 1];
    const dt = Math.max((b.t - a.t) / 1000, 0.001);
    const pa = a.lm[idx], pb = b.lm[idx];
    if (!pa || !pb) return { speed: 0 };
    const vx = (pb.x - pa.x) / dt;
    const vy = (pb.y - pa.y) / dt;
    return { speed: Math.hypot(vx, vy) };
  }, []);

  // ---------- Phase 1: rule-based classifier (fallback path) ----------
  const classifyMoveRuleBased = useCallback((lm) => {
    const now = performance.now();
    if (now < cooldownUntilRef.current) return null;

    const lw = lm[LM.LEFT_WRIST], rw = lm[LM.RIGHT_WRIST];
    const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
    const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
    if (!lw || !rw || !ls || !rs || !lh || !rh) return null;

    const scale = calibDataRef.current.torsoScale || 0.25;
    const velLW = getVel(LM.LEFT_WRIST);
    const velRW = getVel(LM.RIGHT_WRIST);
    const PUNCH_SPEED = 1.6 * scale * 4;

    const wristsCrossed = Math.abs(lw.x - rw.x) < scale * 0.9 &&
      lw.y < lh.y && rw.y < lh.y &&
      lw.y > ls.y - scale * 0.4 && rw.y > rs.y - scale * 0.4;
    if (wristsCrossed) return 'block';

    const leftExtended = Math.hypot(lw.x - ls.x, lw.y - ls.y) > scale * 1.3;
    const rightExtended = Math.hypot(rw.x - rs.x, rw.y - rs.y) > scale * 1.3;
    if (leftExtended && velLW.speed > PUNCH_SPEED) return 'punch';
    if (rightExtended && velRW.speed > PUNCH_SPEED) return 'punch';

    const hipCenterX = (lh.x + rh.x) / 2;
    const hipShift = hipCenterX - calibDataRef.current.hipCenterX;
    if (Math.abs(hipShift) > scale * 1.1) {
      return hipShift < 0 ? 'dodge_left' : 'dodge_right';
    }

    const lk = lm[LM.LEFT_KNEE], rk = lm[LM.RIGHT_KNEE];
    if (lk && lk.y < lh.y - scale * 0.9) return 'kick';
    if (rk && rk.y < rh.y - scale * 0.9) return 'kick';

    return null;
  }, [getVel]);

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
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
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
          ctx.fillStyle = 'rgba(0,229,255,0.8)';
          lm.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
            ctx.fill();
          });
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
            if (rig) onRig(rig);
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
