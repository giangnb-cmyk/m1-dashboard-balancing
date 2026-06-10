// Repro: user claims 10k gems → reach Scene 3 within ~1 day of real play.
// Current sim: how far does a spender with 10k gems get, and where do gems go?
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {} };
vm.createContext(ctx);
const dataDir = path.join(__dirname, '..', 'js', 'data');
['data-init.js', 'data-items.js', 'data-generators.js', 'data-buildup.js',
 'data-orders.js', 'data-boxes.js', 'data-iap.js'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), ctx);
});
global.window = ctx.window;

const SimDataLoader = require('../js/sim/simDataLoader');
const SimRunner     = require('../js/sim/simRunner');
const SimEngine     = require('../js/sim/simEngine');

const catalogs = SimDataLoader.build(window.GameData);

function run(label, profile, days) {
  const { initialGens, initialTools, initialItems } = SimRunner.getStarterItems(catalogs);
  const state = SimEngine.createState(catalogs, profile, initialGens, initialTools, initialItems);
  let reach3 = null, finish3 = null;
  for (let d = 0; d < days; d++) {
    SimEngine.tickDay(state, catalogs, profile);
    if (reach3 === null && state.progress.sceneIndex >= 2) reach3 = state.day;
    if (finish3 === null && state.progress.sceneIndex >= 3) finish3 = state.day;
  }
  console.log(`\n=== ${label} ===`);
  console.log(`day${days}: sceneIdx=${state.progress.sceneIndex} (${state.progress.scene}) ` +
    `buildSteps=${state.progress.buildStepsDone} gold=${state.progress.goldEarned}`);
  console.log(`reach Scene_03 (idx2): day ${reach3} | finish Scene_03 (idx3): day ${finish3}`);
  console.log(`gems left=${state.gems} | gems spent=${state.economy.gems.spent} received=${state.economy.gems.received}`);
  console.log(`energy spent=${state.economy.energy.spent.toFixed(0)} received=${state.economy.energy.received.toFixed(0)}`);
  // Where gems went
  const gemEvents = {};
  state.eventLog.filter(e => e.type === 'gem_spend').forEach(e => {
    const k = e.detail.split(':')[0];
    gemEvents[k] = (gemEvents[k] || 0) + (-e.amount);
  });
  console.log('gem spend breakdown:', gemEvents);
  return state;
}

const base = { regenPerMin: 1/5, cap: 100, startingEnergy: 100, startingGems: 10000,
  purchases: [], enabled: true,
  gemEnergyBuysPerDay: 999, gemGenResetsPerDay: 999, gemInstantCooksPerDay: 999 };

run('Spender 8 sess/day, 10k gems, 90 days', {
  ...base, name: 'whale', sessionMode: 'sessionsPerDay', sessionsPerDay: 8, playerType: 'spender'
}, 90);

run('Spender 8 sess/day, 10k gems, 1 day', {
  ...base, name: 'whale1d', sessionMode: 'sessionsPerDay', sessionsPerDay: 8, playerType: 'spender'
}, 1);

run('F2P mid-core 4 sess/day, 10k gems (gems unused?), 90 days', {
  ...base, name: 'mid', sessionMode: 'interval', intervalHours: 6, playerType: 'f2p'
}, 90);
