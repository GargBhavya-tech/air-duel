import { motion, AnimatePresence } from 'framer-motion';

const MOVE_LABEL = {
  punch: 'PUNCH', kick: 'KICK', block: 'BLOCK',
  dodge_left: 'DODGE ←', dodge_right: 'DODGE →',
};

export default function HUD({ match, aiName, flash }) {
  if (!match) return null;
  const { hp, timeLeft, round, log } = match;

  return (
    <>
      <div className="hud-top">
        <div className="fighter-block">
          <div className="fighter-label">Fighter 01</div>
          <div className="fighter-name display player">YOU</div>
          <div className="healthbar-track">
            <motion.div
              className="healthbar-fill player"
              animate={{ width: `${hp.player}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
            />
          </div>
          <div className="hp-value mono">{hp.player} / 100</div>
        </div>

        <div className="center-hud">
          <div className="display" id="timer">{timeLeft}</div>
          <div id="roundLabel">Round {round}</div>
        </div>

        <div className="fighter-block right">
          <div className="fighter-label">Fighter 02</div>
          <div className="fighter-name display ai">{aiName}</div>
          <div className="healthbar-track">
            <motion.div
              className="healthbar-fill ai"
              animate={{ width: `${hp.ai}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
            />
          </div>
          <div className="hp-value mono">{hp.ai} / 100</div>
        </div>
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            className={`flash display ${flash.hit ? 'hit' : ''}`}
            initial={{ opacity: 0, scale: 0.85, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: -6 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.18 }}
          >
            {flash.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="movelog">
        <AnimatePresence initial={false}>
          {log.slice(-5).map((entry) => (
            <motion.div
              key={entry.t + entry.who}
              className="log-line mono"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className={`tag ${entry.who === 'ai' ? 'ai-tag' : ''}`}>
                {entry.who === 'ai' ? 'AI' : 'YOU'}
              </span>
              {' — '}
              {MOVE_LABEL[entry.move] || entry.move.toUpperCase()}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
