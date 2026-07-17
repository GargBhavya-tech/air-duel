import { useEffect, useRef, useState, useCallback } from 'react';

const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
};

const HISTORY_LEN = 6;
const CALIB_FRAMES = 30;
const MOVE_COOLDOWN_MS = 350;

/**
 * usePoseTracker
 *
 * Handles webcam + MediaPipe Pose + rule-based move classification.
 * This is the Phase 1/2 boundary: classifyMove() below is the rule-based
 * classifier. Phase 2 replaces its body with a call to a trained
 * CNN/LSTM model (fed the same landmark window) — the hook's external
 * interface (onMove callback, calibration state) doesn't need to change.
 */
export function usePoseTracker({ onMove, videoRef, canvasRef, active }) {
  const [status, setStatus] = useState('idle'); // idle | requesting | calibrating | ready | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [calibProgress, setCalibProgress] = useState(0);

  const historyRef = useRef([]);
  const calibSamplesRef = useRef([]);
  const calibDataRef = useRef({ torsoScale: 0.25, hipCenterX: 0.5 });
  const calibratedRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const cameraRef = useRef(null);
  const poseRef = useRef(null);

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

  const classifyMove = useCallback((lm) => {
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

      pose.onResults((results) => {
        if (cancelled || !results.poseLandmarks) return;
        const lm = results.poseLandmarks;
        const t = performance.now();

        // draw skeleton overlay if a canvas is provided
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

        if (!calibratedRef.current) {
          calibSamplesRef.current.push(lm);
          setStatus('calibrating');
          setCalibProgress(calibSamplesRef.current.length);
          if (calibSamplesRef.current.length >= CALIB_FRAMES) finishCalibration();
          return;
        }

        const move = classifyMove(lm);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { status, errorMsg, calibProgress };
}
