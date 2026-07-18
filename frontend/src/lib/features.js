/**
 * Shared landmark feature extraction. Used by BOTH DataCollector.jsx
 * (training data) and usePoseTracker.js (live inference). Keeping this
 * in one place is deliberate — if collection and inference ever
 * normalize landmarks differently, the trained model will silently
 * perform badly on live input in a way that's hard to debug.
 */

export const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

export const FEATURE_LANDMARKS = Object.values(LM);
export const WINDOW_FRAMES = 15;
export const MOVES = ['idle', 'punch', 'kick', 'block', 'dodge_left', 'dodge_right'];
// 12 landmarks * (x,y) + 6 joint angles (elbows, knees, shoulders — see below)
export const NUM_FEATURES = FEATURE_LANDMARKS.length * 2 + 6;

function angleAt(a, b, c) {
  // angle at point b, formed by rays b->a and b->c, in radians
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.hypot(v1x, v1y) || 1e-6;
  const mag2 = Math.hypot(v2x, v2y) || 1e-6;
  const cos = Math.min(1, Math.max(-1, dot / (mag1 * mag2)));
  return Math.acos(cos); // 0..PI
}

/**
 * Joint angles, normalized to roughly [-1, 1] (angle / PI - 0.5 range
 * shifted so a "neutral" ~PI angle sits near 0). These are rotation-
 * invariant in a way raw x,y coordinates aren't — e.g. an elbow bend
 * looks like the same angle whether you're squarely facing the camera
 * or slightly turned, which raw coordinates don't capture as cleanly.
 * This is the same style of feature engineering used in common pose-
 * classification pipelines (angle-based CSVs rather than raw landmark
 * dumps) — see the Kick-Detection-and-pose-estimation reference.
 */
function extractAngleFeatures(lm) {
  const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
  const le = lm[LM.LEFT_ELBOW], re = lm[LM.RIGHT_ELBOW];
  const lw = lm[LM.LEFT_WRIST], rw = lm[LM.RIGHT_WRIST];
  const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
  const lk = lm[LM.LEFT_KNEE], rk = lm[LM.RIGHT_KNEE];
  const la = lm[LM.LEFT_ANKLE], ra = lm[LM.RIGHT_ANKLE];

  const norm = (rad) => rad / Math.PI - 0.5; // roughly centers a relaxed ~180deg joint near 0

  return [
    norm(angleAt(ls, le, lw)),   // left elbow bend
    norm(angleAt(rs, re, rw)),   // right elbow bend
    norm(angleAt(lh, lk, la)),   // left knee bend
    norm(angleAt(rh, rk, ra)),   // right knee bend
    norm(angleAt(lh, ls, le)),   // left shoulder raise
    norm(angleAt(rh, rs, re)),   // right shoulder raise
  ];
}

/**
 * Normalize a single frame of landmarks relative to torso center + scale.
 * This is what makes the model somewhat robust across users standing at
 * different distances from the camera. Combined with the angle features
 * above for rotation-invariance too.
 */
export function extractFeatures(lm) {
  const ls = lm[LM.LEFT_SHOULDER], rs = lm[LM.RIGHT_SHOULDER];
  const lh = lm[LM.LEFT_HIP], rh = lm[LM.RIGHT_HIP];
  const centerX = (ls.x + rs.x + lh.x + rh.x) / 4;
  const centerY = (ls.y + rs.y + lh.y + rh.y) / 4;
  const scale = Math.hypot(
    (ls.x + rs.x) / 2 - (lh.x + rh.x) / 2,
    (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2
  ) || 0.25;

  const feats = [];
  FEATURE_LANDMARKS.forEach((idx) => {
    const p = lm[idx];
    feats.push((p.x - centerX) / scale, (p.y - centerY) / scale);
  });
  feats.push(...extractAngleFeatures(lm));
  return feats;
}
