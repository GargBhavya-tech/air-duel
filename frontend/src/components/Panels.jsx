import { motion, AnimatePresence } from 'framer-motion';

export function StatusPanel({ status, errorMsg, onStart, calibProgress }) {
  const label = {
    idle: 'Enable Camera',
    requesting: 'Requesting camera...',
    calibrating: `Calibrating... ${calibProgress}/30`,
    ready: 'Start Duel',
    error: 'Retry',
  }[status];

  const disabled = status === 'requesting' || status === 'calibrating';

  return (
    <div className="status-panel">
      <h1 className="display">AIR <span>DUEL</span></h1>
      <p>
        Webcam-based combat telemetry. Stand back so your shoulders and hips
        are visible, then calibrate. Punch, kick, block, and dodge are
        tracked live and sent to the match server.
      </p>
      {status === 'error' && <p className="mono error-text">{errorMsg}</p>}
      <button onClick={onStart} disabled={disabled}>{label}</button>
    </div>
  );
}

export function ResultPanel({ endInfo, onRematch }) {
  if (!endInfo) return null;
  const { match, reason } = endInfo;
  const playerWon = reason === 'ko'
    ? match.hp.ai <= 0
    : match.hp.player > match.hp.ai;
  const draw = reason !== 'ko' && match.hp.player === match.hp.ai;
  const title = draw ? 'DRAW' : (playerWon ? 'YOU WIN' : 'AI WINS');

  return (
    <AnimatePresence>
      <motion.div
        className="result-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.h1
          className={`display ${draw ? '' : playerWon ? 'win' : 'lose'}`}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          {title}
        </motion.h1>
        <p className="mono result-sub">
          Final — You: {match.hp.player} HP · AI: {match.hp.ai} HP
        </p>
        <button onClick={onRematch}>Rematch</button>
      </motion.div>
    </AnimatePresence>
  );
}
