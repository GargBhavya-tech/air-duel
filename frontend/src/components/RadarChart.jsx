import { motion } from 'framer-motion';

/**
 * Live radar chart of the AI's rolling read on the player: punch/kick/
 * block/dodge tendencies plus prediction confidence. This is the
 * component that actually sells the "it's learning" story to a
 * non-technical audience — point at it during the Round 1 -> Round 2
 * beat and say "watch this axis move."
 */
const AXES = [
  { key: 'punch', label: 'PUNCH' },
  { key: 'kick', label: 'KICK' },
  { key: 'block', label: 'BLOCK' },
  { key: 'dodge', label: 'DODGE' },
  { key: 'predictability', label: 'READ' },
];

const SIZE = 180;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 28;

function axisPoint(index, total, value) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = RADIUS * Math.max(0, Math.min(1, value));
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

function labelPoint(index, total) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = RADIUS + 16;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) };
}

export default function RadarChart({ embedding, aiName }) {
  if (!embedding) return null;

  const values = AXES.map((a) => embedding[a.key] ?? 0);
  const points = values.map((v, i) => axisPoint(i, AXES.length, v));
  const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(' ');

  const gridRings = [0.25, 0.5, 0.75, 1];

  return (
    <motion.div
      className="radar-panel"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="radar-title mono">
        {aiName} — LIVE READ
        {embedding.samples < 4 && <span className="radar-note"> (learning...)</span>}
      </div>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* grid rings */}
        {gridRings.map((r) => (
          <polygon
            key={r}
            points={AXES.map((_, i) => {
              const p = axisPoint(i, AXES.length, r);
              return `${p.x},${p.y}`;
            }).join(' ')}
            fill="none"
            stroke="rgba(91,101,119,0.35)"
            strokeWidth="1"
          />
        ))}
        {/* spokes */}
        {AXES.map((_, i) => {
          const p = axisPoint(i, AXES.length, 1);
          return (
            <line
              key={i}
              x1={CENTER} y1={CENTER} x2={p.x} y2={p.y}
              stroke="rgba(91,101,119,0.35)" strokeWidth="1"
            />
          );
        })}
        {/* live data polygon */}
        <polygon
          points={pointsAttr}
          fill="rgba(139,107,255,0.28)"
          stroke="#8B6BFF"
          strokeWidth="2"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#8B6BFF" />
        ))}
        {/* axis labels */}
        {AXES.map((a, i) => {
          const p = labelPoint(i, AXES.length);
          return (
            <text
              key={a.key}
              x={p.x} y={p.y}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fill="#5B6577" fontFamily="JetBrains Mono, monospace"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </motion.div>
  );
}
