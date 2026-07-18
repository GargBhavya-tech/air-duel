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
  const liveRigRef = useRef(null);
  const [active, setActive] = useState(false);
  const [flash, setFlash] = useState(null);
  const [playerMoveVisual, setPlayerMoveVisual] = useState('idle');
  const [aiMoveVisual, setAiMoveVisual] = useState('idle');
  const [lastPlayerMove, setLastPlayerMove] = useState(null);
  const [lastAiMove, setLastAiMove] = useState(null);

  const { match, aiName, aiEmbedding, endInfo, sendMove, startMatch } = useMatchSocket();

  const handleMove = useCallback((move) => {
    sendMove(move);
    setPlayerMoveVisual(move);
    setLastPlayerMove(MOVE_LABEL[move] || move.toUpperCase());
    setFlash({ id: Date.now(), text: MOVE_LABEL[move] || move.toUpperCase(), hit: false });
    setTimeout(() => setPlayerMoveVisual('idle'), 500);
    setTimeout(() => setLastPlayerMove(null), 800);
  }, [sendMove]);

  const { status, errorMsg, calibProgress, classifierMode } = usePoseTracker({
    onMove: handleMove,
    onRig: (data) => { liveRigRef.current = data; }, // { rig, wlm, lm }
    videoRef,
    canvasRef,
    active,
  });

  useEffect(() => {
    if (match?.lastAIMove) {
      setAiMoveVisual(match.lastAIMove);
      setLastAiMove(MOVE_LABEL[match.lastAIMove] || match.lastAIMove.toUpperCase());
      const t1 = setTimeout(() => setAiMoveVisual('idle'), 500);
      const t2 = setTimeout(() => setLastAiMove(null), 800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [match?.lastAIMove, match?.log?.length]);

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

      {/* ── LEFT: Camera / Skeleton Panel ── */}
      <div className="cam-panel">
        <div className="panel-label">
          <span className="dot cyan" />
          FIGHTER CAM
          <span className="status-badge">
            {status === 'ready' ? '● TRACKING' : status === 'calibrating' ? '◌ CALIBRATING' : '○ STANDBY'}
          </span>
        </div>

        <div className="cam-video-area">
          <video ref={videoRef} className="hidden-video" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="pose-canvas" />

          {/* Corner decorations */}
          <div className="cam-corner tl" />
          <div className="cam-corner tr" />
          <div className="cam-corner bl" />
          <div className="cam-corner br" />
        </div>

        <div className="cam-info-bar">
          <span className="live-tag">● LIVE</span>
          <span>MEDIAPIPE POSE</span>
          <span>33 LANDMARKS</span>
          <span style={{ marginLeft: 'auto', color: 'var(--cyan)' }}>{classifierMode.toUpperCase()}</span>
        </div>
      </div>

      {/* ── RIGHT: Arena / 3D Panel ── */}
      <div className="arena-panel">
        <div className="panel-label">
          <span className="dot violet" />
          ARENA
          {match && <span className="status-badge">ROUND {match.round}</span>}
        </div>

        <div className="arena-layer">
          <Arena3D playerMove={playerMoveVisual} aiMove={aiMoveVisual} hitFlash={flash?.hit} liveRigRef={liveRigRef} />
        </div>

        <div className="scan" />

        {match && (
          <HUD
            match={match}
            aiName={aiName}
            flash={flash}
            lastPlayerMove={lastPlayerMove}
            lastAiMove={lastAiMove}
          />
        )}
        {match && aiEmbedding && <RadarChart embedding={aiEmbedding} aiName={aiName} />}

        <div className="footer mono">
          <span>AIR DUEL</span>
          <span className="sep">|</span>
          <span>TELEMETRY v0.3</span>
          <span className="sep">|</span>
          <span style={{ color: classifierMode === 'trained' ? 'var(--green)' : 'var(--dim2)' }}>
            {classifierMode}
          </span>
        </div>
      </div>

      {/* ── Overlays (fullscreen) ── */}
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
  );
}
