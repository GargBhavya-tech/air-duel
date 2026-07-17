/**
 * AI Opponent policy module.
 *
 * Phase 1/2 (current): naive — picks a random move on a random interval.
 * Phase 3 (future): replace pickMove() with a style-embedding-driven
 * predictor. The interface (pickMove(matchState) -> move string) stays
 * the same, so server.js never needs to change when you upgrade this.
 */

const MOVES = ['punch', 'kick', 'block', 'dodge_left', 'dodge_right'];

export class NaiveAI {
  constructor() {
    this.name = 'AI — NAIVE';
  }

  // matchState is passed in so a smarter policy can use it later
  // (opponent's recent move history, HP deltas, etc.) — unused for now.
  pickMove(matchState) {
    return MOVES[Math.floor(Math.random() * MOVES.length)];
  }

  nextDelayMs() {
    return 900 + Math.random() * 900;
  }
}

// Placeholder export point for Phase 3. Swap NaiveAI -> StyleEmbeddingAI
// in server.js once that model exists; nothing else needs to change.
export class StyleEmbeddingAI extends NaiveAI {
  constructor() {
    super();
    this.name = 'AI — ADAPTIVE';
    // rolling feature vector: [punchRate, kickRate, blockRate, dodgeRate, avgReactionMs]
    this.embedding = { punch: 0, kick: 0, block: 0, dodge: 0, samples: 0 };
  }

  observePlayerMove(move) {
    const key = move.startsWith('dodge') ? 'dodge' : move;
    if (this.embedding[key] !== undefined) {
      this.embedding.samples += 1;
      const alpha = 0.25; // exponential decay weight toward recent moves
      this.embedding[key] = this.embedding[key] * (1 - alpha) + alpha;
      ['punch', 'kick', 'block', 'dodge'].forEach(k => {
        if (k !== key) this.embedding[k] *= (1 - alpha);
      });
    }
  }

  pickMove(matchState) {
    // TODO Phase 3: predict player's likely next move from embedding +
    // recent sequence, then pick the counter (block beats punch/kick,
    // dodge beats the opposite-side attack) instead of random choice.
    if (this.embedding.samples < 4) return super.pickMove(matchState);
    const favored = Object.entries(this.embedding)
      .filter(([k]) => k !== 'samples')
      .sort((a, b) => b[1] - a[1])[0][0];
    if (favored === 'punch' || favored === 'kick') return 'block';
    if (favored === 'block') return Math.random() < 0.5 ? 'punch' : 'kick';
    return super.pickMove(matchState);
  }
}
