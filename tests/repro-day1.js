// Deep-dive: where does day-1 whale energy go, what blocks orders?
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

const profile = {
  name: 'whale', sessionMode: 'sessionsPerDay', sessionsPerDay: 8,
  regenPerMin: 1/5, cap: 100, startingEnergy: 100, startingGems: 10000,
  playerType: 'spender', purchases: [], enabled: true,
  gemEnergyBuysPerDay: 999, gemGenResetsPerDay: 999, gemInstantCooksPerDay: 999
};

const { initialGens, initialTools, initialItems } = SimRunner.getStarterItems(catalogs);
const state = SimEngine.createState(catalogs, profile, initialGens, initialTools, initialItems);

for (let d = 0; d < 3; d++) {
  SimEngine.tickDay(state, catalogs, profile);
  console.log(`\n######## Day ${state.day}: scene=${state.progress.scene} build=${state.progress.buildStepsDone} ` +
    `orders=${state.progress.completedOrderIds.size} batches=${state.progress.batchesDone} ` +
    `gold=${state.progress.goldEarned} gems=${state.gems}`);
}

// Aggregate day 1-3 event log
const byType = {};
state.eventLog.forEach(e => {
  byType[e.type] = (byType[e.type] || 0) + 1;
});
console.log('\nEvent counts:', byType);

// Energy per generator (tapped events)
const tapEnergy = {};
state.eventLog.filter(e => e.type === 'energy_spend' && e.detail.startsWith('Tapped')).forEach(e => {
  const name = e.detail.match(/Tapped: (.+?) ×/)[1];
  tapEnergy[name] = (tapEnergy[name] || 0) - e.amount;
});
console.log('\nEnergy by generator:', tapEnergy);

// Board-full sells
const sells = state.eventLog.filter(e => e.type === 'board_full').length;
console.log('Board-full sells:', sells);

// Cooks
const cooks = state.eventLog.filter(e => e.type === 'cook').length;
console.log('Cooked items:', cooks);

// Current blocking order
const scene = catalogs.sceneCatalog[state.progress.sceneIndex];
const batchId = scene.batchIds.find(id => !state.progress.completedBatchIds.has(id));
const batch = catalogs.batchMap[batchId];
console.log(`\nBlocking batch ${batchId}:`);
batch.orderIds.forEach(oid => {
  if (state.progress.completedOrderIds.has(oid)) return;
  const det = catalogs.orderDetailMap[oid];
  if (!det) return;
  const needs = det.items.map(it => {
    const have = (state.board.boardItems[it.itemId]||0)+(state.board.inventoryItems[it.itemId]||0);
    const name = (catalogs.itemNames||{})[it.itemId] || it.itemId;
    return `${name}(${it.itemId})x${it.qty} have=${have}`;
  }).join(' + ');
  console.log(`  order ${oid}: ${needs}`);
});

// Cooking states
console.log('\nTools:', state.board.tools.map(t => `${t.toolType}${t.cooking ? '→'+t.cooking.resultId+'@'+t.cooking.doneAt : ' idle'}`).join(' | '));
console.log('Board count:', state.board.boardItemCount, 'inv:', state.board.inventoryCount, '/', state.board.inventoryCapacity);
const inv = Object.entries({...state.board.boardItems});
console.log('Top board items:', inv.sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>`${k}=${v}`).join(' '));
