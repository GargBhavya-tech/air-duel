import { useRef, useState, useCallback, useEffect } from 'react';
import Arena3D from './components/Arena3D.jsx';
import HUD from './components/HUD.jsx';
import RadarChart from './components/RadarChart.jsx';
import { StatusPanel, ResultPanel } from './components/Panels.jsx';
import { usePoseTracker } from './hooks/usePoseTracker.js';
import { useMatchSocket } from './hooks/useMatchSocket.js';

const MOVE_LABEL = {
  punch: 'PUNCH', kick: 'KICK', block: 'BLOCK',
  dodge_left: 'DODGE ←', dodge_right: 'DODGE →',
};

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const liveRigRef = useRef(null); // updated every pose frame, read imperatively by Fighter — avoids a React re-render at 30fps
  const [active, setActive] = useState(false);
  const [flash, setFlash] = useState(null);
  const [playerMoveVisual, setPlayerMoveVisual] = useState('idle');
  const [aiMoveVisual, setAiMoveVisual] = useState('idle');

  const { match, aiName, aiEmbedding, endInfo, sendMove, startMatch } = useMatchSocket();

  const handleMove = useCallback((move) => {
    sendMove(move);
    setPlayerMoveVisual(move);
    setFlash({ id: Date.now(), text: MOVE_LABEL[move] || move.toUpperCase(), hit: false });
    setTimeout(() => setPlayerMoveVisual('idle'), 500);
  }, [sendMove]);

  const { status, errorMsg, calibProgress, classifierMode } = usePoseTracker({
    onMove: handleMove,
    onRig: (rig) => { liveRigRef.current = rig; },
    videoRef,
    canvasRef,
    active,
  });

  // reflect the AI's last move onto the 3D avatar
  useEffect(() => {
    if (match?.lastAIMove) {
      setAiMoveVisual(match.lastAIMove);
      const t = setTimeout(() => setAiMoveVisual('idle'), 500);
      return () => clearTimeout(t);
    }
  }, [match?.lastAIMove, match?.log?.length]);

  // flash "HIT" when either fighter's HP drops
  const prevHp = useRef({ player: 100, ai: 100 });
  useEffect(() => {
    if (!match) return;
    if (match.hp.player < prevHp.current.player || match.hp.ai < prevHp.current.ai) {
      setFlash({ id: Date.now(), text: 'HIT', hit: true });
    }
    prevHp.current = { player: match.hp.player, ai: match.hp.ai };
  }, [match?.hp?.player, match?.hp?.ai]);

  const handleStart = () => {
    if (status === 'idle' || status === 'error') { setActive(true); return; }
    if (status === 'ready') { startMatch(); }
  };

  return (
    <div className="stage">
      <div className="video-wrap">
        <video ref={videoRef} className="hidden-video" autoPlay playsInline muted />
        <canvas ref={canvasRef} className="pose-canvas" />

        <div className="arena-layer">
          <Arena3D playerMove={playerMoveVisual} aiMove={aiMoveVisual} hitFlash={flash?.hit} liveRigRef={liveRigRef} />
        </div>

        <div className="scan" />

        {match && <HUD match={match} aiName={aiName} flash={flash} />}
        {match && aiEmbedding && <RadarChart embedding={aiEmbedding} aiName={aiName} />}

        <div className="footer mono">AIR DUEL // TELEMETRY v0.2 // classifier: {classifierMode}</div>

        {(status !== 'ready' || !match?.running) && !endInfo && (
          <StatusPanel
            status={match?.running ? 'ready' : status}
            errorMsg={errorMsg}
            onStart={handleStart}
            calibProgress={calibProgress}
          />
        )}

        <ResultPanel endInfo={endInfo} onRematch={() => { startMatch(); }} />
      </div>
    </div>
  );
}
