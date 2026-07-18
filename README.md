# AIR DUEL — Phase 1.5 (React frontend + Node backend, 3D fighters)

Webcam-based combat game. Frontend does pose tracking + 3D rendering;
backend holds authoritative match state and the AI opponent logic.

## Run it

**Backend:**
```
cd backend
npm install
npm run dev
```
Runs on `ws://localhost:4000`.

**Frontend:**
```
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173`. Open it, allow camera access, hold
still through calibration, then click "Start Duel".

If your backend isn't on localhost:4000, set `VITE_WS_URL` in a
`.env` file inside `frontend/` before running dev/build.

## Phase 3 (done) — Adaptive AI opponent + live radar chart

`backend/aiOpponent.js::StyleEmbeddingAI` is now the active AI policy
(swapped in `server.js`, was `NaiveAI`):

- **Rolling embedding**: exponentially-decayed punch/kick/block/dodge
  rates, updated every observed player move.
- **Bigram move predictor**: Laplace-smoothed P(next move | last move),
  blended with the overall embedding as a prior when a specific
  transition doesn't have much data yet.
- **Counter policy**: predicted punch/kick → AI blocks; predicted
  block → AI attacks freely; predicted dodge → AI kicks through it.
- **Adaptive reaction delay**: shrinks as confidence/sample count grow,
  so the AI visibly gets faster *and* smarter within one session — this
  is the mechanism behind the Round 1 → Round 2 demo arc.
- **Live radar chart** (`RadarChart.jsx`) renders the embedding in the
  bottom-right corner in real time — point at it during the demo and
  say "watch this axis move" right before landing a hit the AI now
  blocks.

`NaiveAI` is still exported and used automatically for the first 4
player moves of any match (not enough data yet for the model to be
meaningfully better than random) — this transition is intentional, not
a bug, and is itself part of the "cold start → adapted" story.

## Phase 2 — Training your own gesture classifier

1. **Collect data**: run the frontend (`npm run dev`), visit
   `http://localhost:5173/?collect=1`. Follow the on-screen prompts —
   it'll cycle through idle/punch/kick/block/dodge_left/dodge_right,
   asking for ~60 reps each. Do this in your actual demo lighting/
   webcam setup, not just wherever's convenient — session mismatch
   between training and demo conditions is the most common failure
   mode here. Click "Export dataset" when done; saves
   `air-duel-gestures.json`.

2. **Train**:
   ```
   cd ml
   npm install
   node train.js /path/to/air-duel-gestures.json
   ```
   Watch train/val accuracy in the console. If val_acc stays low,
   you likely need more reps, or your movements aren't sufficiently
   distinct from each other — try exaggerating them a bit.

3. **Deploy**: copy `ml/models/gesture-classifier/` into
   `frontend/public/models/gesture-classifier/`. On next page load,
   `usePoseTracker.js` will find it automatically and switch to the
   trained classifier — check the footer text in-app, it shows which
   classifier mode is currently active (`rule-based` or `trained`).

4. **Fallback safety net**: if the trained model misbehaves at demo
   venue lighting, delete/rename the `public/models/gesture-classifier`
   folder and reload — it silently falls back to the rule-based
   classifier with zero code changes needed. Keep this in your back
   pocket for demo day.

## GitHub research → what we adopted (this round)

Searched three related pieces before building further:

1. **Pose → fighting-game input mapping** (`OpenCV-to-play-games`-style
   repos) — validated the core concept, nothing to port since our
   architecture renders its own scene rather than emulating keypresses
   into an external game.
2. **Angle-based pose-classification features** (`Kick-Detection-and-
   pose-estimation`-style repos) — adopted this. `features.js` now
   computes 6 joint angles (elbow/knee/shoulder, both sides) alongside
   the 24 normalized coordinate features, since angles are naturally
   rotation-invariant in a way raw x,y positions aren't. **If you
   already trained a model before this change, retrain — the feature
   vector length changed (24 → 30) and old weights won't match.**
3. **Kalidokit** for MediaPipe-landmark → bone-rotation retargeting —
   adopted this for the player's 3D avatar. The player's limbs now
   track your actual real-time body angles every frame (via
   `Kalidokit.Pose.solve`), not just snapping between 4 preset poses
   when a move is classified. The AI opponent still uses the preset-
   pose system (it has no camera, so it has to) — see `Fighter.jsx` for
   how both paths coexist in one component.

## What's implemented (Phase 1.5)

- Rule-based pose classifier (punch / kick / block / dodge_left /
  dodge_right) — client-side, per-user calibrated torso scale
- Backend-authoritative match state over WebSocket — frontend never
  decides who won, it just renders what the server says
- Procedural 3D fighters (React Three Fiber + drei), no external
  model files, spring-animated limbs per move (@react-spring/three)
- Framer Motion for all 2D HUD animation (health bars, move log,
  hit/win flash callouts) — kept separate from the 3D layer, since
  Framer Motion doesn't animate Three.js meshes directly
- Bloom post-processing that intensifies on hit for a punchier flash

## What's next (per the original scope doc)

- **Phase 2:** swap the rule-based classifier in
  `usePoseTracker.js::classifyMove` for a trained CNN/LSTM model fed
  the same landmark window — the hook's external interface doesn't
  need to change.
- **Phase 3:** swap `NaiveAI` for `StyleEmbeddingAI` in
  `backend/server.js` (already scaffolded in `aiOpponent.js`) — build
  out the real predictor + counter policy, and surface the live radar
  chart on the frontend.
- **Phase 4:** the backend's WebSocket match-state model is already
  shaped for this — replace the AI's move source with a second real
  client's move stream instead of `NaiveAI.pickMove()`.

## Notes / known rough edges to test before a demo

- Pose classification thresholds are calibrated per-session but were
  only tuned against one setup during scaffolding — expect to retune
  `PUNCH_SPEED` and the dodge/kick thresholds in
  `usePoseTracker.js` once you test on your actual webcam/lighting.
- The 3D fighters are procedural primitives, not rigged character
  models — intentional (zero asset pipeline needed), but if you want
  a less "capsule person" look later, swapping in a GLTF model is a
  contained change inside `Fighter.jsx`.
- No reconnect/retry logic on the WebSocket yet — if the backend
  restarts mid-session, refresh the frontend.
