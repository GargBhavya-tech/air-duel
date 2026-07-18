import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { NaiveAI, StyleEmbeddingAI } from './aiOpponent.js';

const PORT = process.env.PORT || 4000;
const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

/* ------------------------------------------------------------------
   Match state — authoritative on the backend. Frontend only renders
   what the server tells it; this is the shape Phase 4 (real human
   multiplayer) will reuse almost unchanged — swap the AI's move
   source for a second real client's move stream.
------------------------------------------------------------------ */
const MATCH_DURATION_S = 60;
const DMG = { punch: 8, kick: 12 };

function freshMatch() {
  return {
    running: false,
    round: 1,
    timeLeft: MATCH_DURATION_S,
    hp: { player: 100, ai: 100 },
    lastAIMove: null,
    lastPlayerMove: null,
    log: [], // { who, move, t }
  };
}

let match = freshMatch();
let ai = new StyleEmbeddingAI(); // Phase 3 — was `new NaiveAI()` through Phase 1.5/2
let timerInterval = null;
let aiTimeout = null;

const clients = new Set();

function broadcast() {
  const payload = JSON.stringify({
    type: 'state',
    match,
    aiName: ai.name,
    aiEmbedding: ai.getEmbeddingSnapshot ? ai.getEmbeddingSnapshot() : null,
  });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

function pushLog(who, move) {
  match.log.push({ who, move, t: Date.now() });
  if (match.log.length > 20) match.log.shift();
}

function resolveExchange(actor, move) {
  const isAttack = move === 'punch' || move === 'kick';
  if (!isAttack) return { outcome: 'no-attack' };

  if (actor === 'player') {
    const aiDefending = match.lastAIMove === 'block' ||
      match.lastAIMove === 'dodge_left' || match.lastAIMove === 'dodge_right';
    if (aiDefending && Math.random() < 0.6) return { outcome: 'absorbed' };
    match.hp.ai = Math.max(0, match.hp.ai - DMG[move]);
    return { outcome: 'hit', hp: match.hp.ai };
  } else {
    const playerDefending = match.lastPlayerMove === 'block' ||
      match.lastPlayerMove === 'dodge_left' || match.lastPlayerMove === 'dodge_right';
    if (playerDefending && Math.random() < 0.6) return { outcome: 'absorbed' };
    match.hp.player = Math.max(0, match.hp.player - DMG[move]);
    return { outcome: 'hit', hp: match.hp.player };
  }
}

function startMatch() {
  match = freshMatch();
  match.running = true;
  broadcast();

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!match.running) return;
    match.timeLeft -= 1;
    if (match.timeLeft <= 0) endMatch('time');
    else broadcast();
  }, 1000);

  scheduleAIMove();
}

function scheduleAIMove() {
  clearTimeout(aiTimeout);
  aiTimeout = setTimeout(() => {
    if (!match.running) return;
    const move = ai.pickMove(match);
    match.lastAIMove = move;
    pushLog('ai', move);
    const result = resolveExchange('ai', move);
    broadcast();
    if (match.hp.player <= 0) endMatch('ko');
    else scheduleAIMove();
  }, ai.nextDelayMs());
}

function endMatch(reason) {
  match.running = false;
  clearInterval(timerInterval);
  clearTimeout(aiTimeout);
  broadcast();
  const payload = JSON.stringify({ type: 'end', reason, match });
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(payload);
}

/* ------------------------------------------------------------------
   WebSocket: frontend sends { type: 'move', move: 'punch' } whenever
   the pose classifier detects a player action. Backend resolves it
   against current match state and broadcasts the new state.
------------------------------------------------------------------ */
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'state', match, aiName: ai.name }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'start') {
      startMatch();
    }

    if (msg.type === 'move' && match.running) {
      match.lastPlayerMove = msg.move;
      pushLog('player', msg.move);
      if (ai.observePlayerMove) ai.observePlayerMove(msg.move);
      const result = resolveExchange('player', msg.move);
      broadcast();
      if (match.hp.ai <= 0) endMatch('ko');
    }
  });

  ws.on('close', () => clients.delete(ws));
});

app.get('/health', (req, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`Air Duel backend listening on :${PORT}`);
});
