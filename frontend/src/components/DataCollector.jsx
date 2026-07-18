import { useRef, useState, useCallback, useEffect } from 'react';
import { extractFeatures, MOVES, WINDOW_FRAMES } from '../lib/features.js';

/**
 * Phase 2 — Data Collection Tool.
 *
 * Records short windows of normalized pose-landmark sequences, labeled
 * by move class, and exports them as a JSON dataset for training.
 * This is a SEPARATE mode from the game — run it, collect ~60-100 reps
 * per move in your actual demo lighting/webcam setup, export, then feed
 * the JSON into `ml/train.js`.
 *
 * Feature extraction lives in `src/lib/features.js` and is shared with
 * usePoseTracker.js's inference path — do not duplicate that logic here.
 */

const REPS_PER_MOVE = 60;

export default function DataCollector({ videoRef, canvasRef }) {
  const [moveIdx, setMoveIdx] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [dataset, setDataset] = useState([]); // { label, window: [[feat...], ...] }
  const windowBufferRef = useRef([]);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const [status, setStatus] = useState('idle');

  const currentMove = MOVES[moveIdx];

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      setStatus('starting camera...');
      const { Pose } = await import('@mediapipe/pose');
      const { Camera } = await import('@mediapipe/camera_utils');
      const pose = new Pose({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
      });
      pose.setOptions({
        modelComplexity: 1, smoothLandmarks: true,
        minDetectionConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      pose.onResults((results) => {
        if (cancelled || !results.poseLandmarks) return;
        if (canvasRef?.current && videoRef?.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          canvas.width = videoRef.current.videoWidth || 960;
          canvas.height = videoRef.current.videoHeight || 720;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'rgba(0,229,255,0.8)';
          results.poseLandmarks.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        if (recording) {
          windowBufferRef.current.push(extractFeatures(results.poseLandmarks));
          if (windowBufferRef.current.length >= WINDOW_FRAMES) {
            finishRep([...windowBufferRef.current]);
            windowBufferRef.current = [];
          }
        }
      });
      poseRef.current = pose;
      if (videoRef?.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => { if (poseRef.current) await poseRef.current.send({ image: videoRef.current }); },
          width: 960, height: 720,
        });
        cameraRef.current = camera;
        await camera.start();
        setStatus('ready');
      }
    }
    setup();
    return () => { cancelled = true; cameraRef.current?.stop?.(); poseRef.current?.close?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRep = useCallback((window) => {
    setDataset((prev) => [...prev, { label: currentMove, window }]);
    setRepCount((c) => {
      const next = c + 1;
      if (next >= REPS_PER_MOVE) {
        setMoveIdx((m) => Math.min(m + 1, MOVES.length - 1));
        return 0;
      }
      return next;
    });
    setRecording(false);
  }, [currentMove]);

  const recordRep = () => {
    windowBufferRef.current = [];
    setRecording(true);
  };

  const exportDataset = () => {
    const blob = new Blob([JSON.stringify({ moves: MOVES, samples: dataset }, null, 0)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'air-duel-gestures.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: 20, color: '#E8ECF3', fontFamily: 'monospace' }}>
      <h2 style={{ color: '#00E5FF' }}>Phase 2 — Gesture Data Collection</h2>
      <p>Status: {status}</p>
      <p>
        Current move: <b style={{ color: '#FF4D2E' }}>{currentMove.toUpperCase()}</b>
        {' '}— rep {repCount}/{REPS_PER_MOVE} — total samples: {dataset.length}
      </p>
      <p style={{ opacity: 0.7, maxWidth: 480 }}>
        For "idle", just stand naturally / do unrelated small movements — this
        class teaches the model what NOT to fire on. Press record, perform the
        move once, hold until the window fills (~0.5s).
      </p>
      <button onClick={recordRep} disabled={recording || moveIdx >= MOVES.length}>
        {recording ? 'Recording...' : `Record ${currentMove}`}
      </button>
      {' '}
      <button onClick={exportDataset} disabled={dataset.length === 0}>
        Export dataset ({dataset.length} samples)
      </button>
      {moveIdx >= MOVES.length - 1 && repCount >= REPS_PER_MOVE && (
        <p style={{ color: '#00E5FF' }}>All moves collected — export and move to training.</p>
      )}
    </div>
  );
}
