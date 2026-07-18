import { motion, AnimatePresence } from 'framer-motion';

const MOVE_LABEL = {
  punch: 'PUNCH', kick: 'KICK', block: 'BLOCK',
  dodge_left: 'DODGE ←', dodge_right: 'DODGE →',
};

const MOVE_ICON = {
  punch: '👊', kick: '🦵', block: '🛡', dodge_left: '←', dodge_right: '→',
};

export default function HUD({ match, aiName, flash, lastPlayerMove, lastAiMove }) {
  if (!match) return null;
  const { hp, timeLeft, round, log } = match;

  const playerLow = hp.player <= 25;
  const aiLow = hp.ai <= 25;
  const timeUrgent = timeLeft <= 10;

  return (
    <>
      {/* ── Top HUD ── */}
      <div className="hud-top">
        {/* Player */}
        <div className="fighter-block">
          <div className="fighter-label">Fighter 01</div>
          <div className="fighter-name display player">YOU</div>
          <div className="healthbar-track">
            <motion.div
              className={`healthbar-fill player${playerLow ? ' low' : ''}`}
              animate={{ width: `${hp.player}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
            />
          </div>
          <div className="hp-value">{hp.player} <span style={{ opacity: 0.4 }}>/ 100 HP</span></div>
          <div className={`move-badge${lastPlayerMove ? ' visible' : ''}`}>
            {lastPlayerMove && <span>{lastPlayerMove}</span>}
          </div>
        </div>

        {/* Center: Timer */}
        <div className="center-hud">
          <div className={`display${timeUrgent ? ' urgent' : ''}`} id="timer">{timeLeft}</div>
          <div id="roundLabel">Round {round}</div>
        </div>

        {/* AI */}
        <div className="fighter-block right">
          <div className="fighter-label">Fighter 02</div>
          <div className="fighter-name display ai">{aiName || 'A.I.'}</div>
          <div className="healthbar-track">
            <motion.div
              className={`healthbar-fill ai${aiLow ? ' low' : ''}`}
              animate={{ width: `${hp.ai}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
              style={{ marginLeft: 'auto' }}
            />
          </div>
          <div className="hp-value" style={{ textAlign: 'right' }}>{hp.ai} <span style={{ opacity: 0.4 }}>/ 100 HP</span></div>
          <div className={`move-badge ai-badge${lastAiMove ? ' visible' : ''}`} style={{ float: 'right' }}>
            {lastAiMove && <span>{lastAiMove}</span>}
          </div>
        </div>
      </div>

      {/* ── Flash / Hit callout ── */}
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            className={`flash display ${flash.hit ? 'hit' : ''}`}
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {flash.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Move Log ── */}
      <div className="movelog">
        <AnimatePresence initial={false}>
          {log.slice(-4).map((entry) => (
            <motion.div
              key={entry.t + entry.who}
              className="log-line mono"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 0.7, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className={`tag ${entry.who === 'ai' ? 'ai-tag' : ''}`}>
                {entry.who === 'ai' ? (aiName || 'AI') : 'YOU'}
              </span>
              <span style={{ opacity: 0.4 }}>→</span>
              {MOVE_LABEL[entry.move] || entry.move.toUpperCase()}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
