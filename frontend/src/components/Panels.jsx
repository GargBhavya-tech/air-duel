import { motion, AnimatePresence } from 'framer-motion';

export function StatusPanel({ status, errorMsg, onStart, calibProgress }) {
  const isDone = status === 'ready';
  const isCalib = status === 'calibrating';
  const isError = status === 'error';
  const isPending = status === 'requesting';

  const btnLabel = {
    idle: 'Enable Camera',
    requesting: 'Requesting...',
    calibrating: 'Calibrating...',
    ready: 'Start Duel',
    error: 'Retry',
  }[status] || 'Start';

  const disabled = isPending || isCalib;

  return (
    <div className="status-panel">
      <motion.h1
        className="display title-glow"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        AIR <span>DUEL</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Webcam combat powered by pose tracking. Stand back so your full upper body is visible.
      </motion.p>

      {/* Instructions */}
      <motion.ul
        className="instr-list"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <li><span className="move-key">PUNCH</span> Thrust your fist forward fast</li>
        <li><span className="move-key">KICK</span> Raise your knee up sharply</li>
        <li><span className="move-key">BLOCK</span> Cross wrists in front of chest</li>
        <li><span className="move-key">DODGE</span> Lean your hips left or right</li>
      </motion.ul>

      {/* Calibration bar */}
      {isCalib && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--dim2)', marginBottom: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>
            CALIBRATING — STAND STILL {calibProgress}/30
          </div>
          <div className="calib-bar-track">
            <div className="calib-bar-fill" style={{ width: `${(calibProgress / 30) * 100}%` }} />
          </div>
        </motion.div>
      )}

      {isError && <p className="mono error-text">{errorMsg}</p>}

      <motion.button
        onClick={onStart}
        disabled={disabled}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
      >
        <span>{btnLabel}</span>
      </motion.button>
    </div>
  );
}

export function ResultPanel({ endInfo, onRematch }) {
  if (!endInfo) return null;
  const { match, reason } = endInfo;
  const playerWon = reason === 'ko' ? match.hp.ai <= 0 : match.hp.player > match.hp.ai;
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
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.1 }}
        >
          {title}
        </motion.h1>

        <motion.p
          className="mono result-sub"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Final — You: {match.hp.player} HP &nbsp;·&nbsp; AI: {match.hp.ai} HP
          {reason === 'ko' && <><br /><span style={{ color: 'var(--ember)' }}>KO</span></>}
        </motion.p>

        <motion.button
          onClick={onRematch}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <span>Rematch</span>
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
