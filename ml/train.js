/**
 * Phase 2 — Gesture Classifier Training Script.
 *
 * Loads a dataset exported from DataCollector.jsx (air-duel-gestures.json),
 * trains a small 1D-CNN over sliding windows of normalized pose landmarks,
 * and exports a model directly loadable in the browser via @tensorflow/tfjs.
 *
 * Run:
 *   cd ml
 *   npm install
 *   node train.js ../frontend-collected-dataset.json
 *
 * Output: ml/models/gesture-classifier/ (model.json + weights.bin)
 * Copy that folder into frontend/public/models/ before running the app
 * with the trained classifier enabled.
 */

import * as tf from '@tensorflow/tfjs-node';
import fs from 'fs';

const MOVES = ['idle', 'punch', 'kick', 'block', 'dodge_left', 'dodge_right'];
const WINDOW_FRAMES = 15;
const NUM_FEATURES = 12 * 2 + 6; // 12 landmarks*(x,y) + 6 joint angles — MUST match frontend/src/lib/features.js NUM_FEATURES exactly

function loadDataset(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
  const { samples } = raw;
  if (!samples || samples.length === 0) {
    throw new Error('Dataset is empty — collect data first with DataCollector.jsx');
  }

  const X = [];
  const y = [];
  samples.forEach((s) => {
    if (s.window.length !== WINDOW_FRAMES) return; // skip malformed windows
    X.push(s.window); // [WINDOW_FRAMES, NUM_FEATURES]
    y.push(MOVES.indexOf(s.label));
  });

  console.log(`Loaded ${X.length} samples across ${MOVES.length} classes.`);
  const counts = {};
  y.forEach((label) => { counts[MOVES[label]] = (counts[MOVES[label]] || 0) + 1; });
  console.log('Class balance:', counts);

  return {
    xs: tf.tensor3d(X, [X.length, WINDOW_FRAMES, NUM_FEATURES]),
    ys: tf.oneHot(tf.tensor1d(y, 'int32'), MOVES.length),
  };
}

function buildModel() {
  const model = tf.sequential();
  model.add(tf.layers.conv1d({
    inputShape: [WINDOW_FRAMES, NUM_FEATURES],
    filters: 32, kernelSize: 3, activation: 'relu', padding: 'same',
  }));
  model.add(tf.layers.batchNormalization());
  model.add(tf.layers.conv1d({ filters: 64, kernelSize: 3, activation: 'relu', padding: 'same' }));
  model.add(tf.layers.globalAveragePooling1d());
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: MOVES.length, activation: 'softmax' }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  });
  return model;
}

async function main() {
  const datasetPath = process.argv[2];
  if (!datasetPath) {
    console.error('Usage: node train.js <path-to-dataset.json>');
    process.exit(1);
  }

  const { xs, ys } = loadDataset(datasetPath);
  const model = buildModel();
  model.summary();

  console.log('\nTraining...');
  await model.fit(xs, ys, {
    epochs: 60,
    batchSize: 16,
    validationSplit: 0.2,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 5 === 0 || epoch === 59) {
          console.log(
            `epoch ${epoch}: loss=${logs.loss.toFixed(3)} acc=${logs.acc.toFixed(3)} ` +
            `val_loss=${logs.val_loss.toFixed(3)} val_acc=${logs.val_acc.toFixed(3)}`
          );
        }
      },
    },
  });

  const outDir = './models/gesture-classifier';
  fs.mkdirSync(outDir, { recursive: true });
  await model.save(`file://${outDir}`);
  console.log(`\nSaved model to ${outDir}/`);
  console.log('Copy this folder into frontend/public/models/ to use it in the app.');

  console.log('\n⚠️  Reminder: this only evaluated on a validation SPLIT of the same');
  console.log('   recording session(s). Test live on your actual webcam before trusting');
  console.log('   this number — session-level overfitting is the most common failure');
  console.log('   mode for this kind of model (see the Known Risks section of the bible doc).');
}

main().catch((e) => { console.error(e); process.exit(1); });
