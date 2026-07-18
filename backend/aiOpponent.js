/**
 * AI Opponent policy module.
 *
 * NaiveAI: random move on a random interval. Used until enough player
 * data exists, and as the Phase 1/2 baseline.
 *
 * StyleEmbeddingAI (Phase 3 — now implemented): builds a rolling
 * behavioral profile of the player as the match progresses, predicts
 * their next move from that profile + recent move history (a
 * Laplace-smoothed bigram model over move transitions), and counters
 * the prediction instead of picking randomly. Reaction delay also
 * shrinks as confidence grows, so the AI visibly gets faster AND
 * smarter within one session — this is the Round 1 -> Round 2 arc
 * the whole demo is built around.
 */

const MOVES = ['punch', 'kick', 'block', 'dodge_left', 'dodge_right'];
const CATEGORIES = ['punch', 'kick', 'block', 'dodge']; // dodge_left/right collapsed for modeling

function toCategory(move) {
  return move.startsWith('dodge') ? 'dodge' : move;
}

export class NaiveAI {
  constructor() {
    this.name = 'AI — NAIVE';
  }
  pickMove() {
    return MOVES[Math.floor(Math.random() * MOVES.length)];
  }
  nextDelayMs() {
    return 900 + Math.random() * 900;
  }
  // no-ops so server.js can call these unconditionally regardless of AI type
  observePlayerMove() {}
  getEmbeddingSnapshot() {
    return null;
  }
}

export class StyleEmbeddingAI {
  constructor() {
    this.name = 'AI — ADAPTIVE';

    // Rolling frequency embedding (exponential decay toward recent moves).
    this.embedding = { punch: 0.25, kick: 0.25, block: 0.25, dodge: 0.25 };
    this.decayAlpha = 0.22;

    // Bigram transition counts: transitions[lastCategory][nextCategory] = count.
    // Laplace-smoothed at prediction time so it's well-behaved with few samples.
    this.transitions = {};
    CATEGORIES.forEach((a) => {
      this.transitions[a] = {};
      CATEGORIES.forEach((b) => { this.transitions[a][b] = 0; });
    });

    this.lastPlayerCategory = null;
    this.samples = 0;
    this.lastPredicted = null;
    this.lastPredictedConfidence = 0;
  }

  observePlayerMove(move) {
    const cat = toCategory(move);
    this.samples += 1;

    // update rolling embedding
    const a = this.decayAlpha;
    Object.keys(this.embedding).forEach((k) => {
      this.embedding[k] = this.embedding[k] * (1 - a) + (k === cat ? a : 0);
    });

    // update bigram transition table
    if (this.lastPlayerCategory) {
      this.transitions[this.lastPlayerCategory][cat] += 1;
    }
    this.lastPlayerCategory = cat;
  }

  /** Laplace-smoothed P(next = c | last = lastPlayerCategory), blended
   *  with the overall rolling embedding as a prior for when the bigram
   *  table is still sparse for this particular transition. */
  predictNextCategory() {
    if (!this.lastPlayerCategory) {
      // no history yet — fall back to overall embedding
      const best = Object.entries(this.embedding).sort((x, y) => y[1] - x[1])[0];
      return { category: best[0], confidence: best[1] };
    }

    const row = this.transitions[this.lastPlayerCategory];
    const total = Object.values(row).reduce((s, v) => s + v, 0);
    const k = CATEGORIES.length;
    const bigramProbs = {};
    CATEGORIES.forEach((c) => {
      bigramProbs[c] = (row[c] + 1) / (total + k); // Laplace smoothing
    });

    // blend: more weight to bigram as we accumulate more transitions for
    // this specific lastCategory, otherwise lean on the overall embedding
    const bigramWeight = Math.min(0.8, total / (total + 4));
    const blended = {};
    CATEGORIES.forEach((c) => {
      blended[c] = bigramWeight * bigramProbs[c] + (1 - bigramWeight) * this.embedding[c];
    });

    const best = Object.entries(blended).sort((x, y) => y[1] - x[1])[0];
    return { category: best[0], confidence: best[1] };
  }

  pickMove() {
    if (this.samples < 4) {
      // not enough data yet — behave like NaiveAI so early match doesn't
      // whiff on a near-empty model
      return MOVES[Math.floor(Math.random() * MOVES.length)];
    }

    const { category, confidence } = this.predictNextCategory();
    this.lastPredicted = category;
    this.lastPredictedConfidence = confidence;

    if (category === 'punch' || category === 'kick') {
      return 'block'; // defend against predicted attack
    }
    if (category === 'dodge') {
      // predicted defense — attack through it; kick deals more damage
      // and dodge only absorbs ~60% of the time per resolveExchange
      return 'kick';
    }
    if (category === 'block') {
      // predicted a passive player — attack freely
      return Math.random() < 0.5 ? 'punch' : 'kick';
    }
    return MOVES[Math.floor(Math.random() * MOVES.length)];
  }

  nextDelayMs() {
    // reaction delay shrinks as confidence/samples grow — the AI visibly
    // gets faster within a session, reinforcing the "it's learning" read
    const base = 900;
    const floor = 450;
    const shrink = Math.min(1, this.samples / 20) * 0.5
      + Math.min(1, this.lastPredictedConfidence) * 0.3;
    const delay = base - (base - floor) * shrink;
    return delay + Math.random() * 300;
  }

  getEmbeddingSnapshot() {
    return {
      punch: this.embedding.punch,
      kick: this.embedding.kick,
      block: this.embedding.block,
      dodge: this.embedding.dodge,
      predictability: this.lastPredictedConfidence,
      samples: this.samples,
    };
  }
}
