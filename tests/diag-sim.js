// Diagnostic: run the full sim with real GameData and dump why nobody beats Scene 1
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Build a fake browser global so the data files can attach to window.GameData
const ctx = { window: {} };
vm.createContext(ctx);

const dataDir = path.join(__dirname, '..', 'js', 'data');
const order = ['data-init.js', 'data-items.js', 'data-generators.js', 'data-buildup.js',
               'data-orders.js', 'data-boxes.js', 'data-iap.js'];
order.forEach(f => {
  const code = fs.readFileSync(path.join(dataDir, f), 'utf8');
  vm.runInContext(code, ctx);
});

global.window = ctx.window;

const SimDataLoader = require('../js/sim/simDataLoader');
const SimRunner     = require('../js/sim/simRunner');

const catalogs = SimDataLoader.build(window.GameData);

console.log('=== Catalogs summary ===');
console.log('scenes:', catalogs.sceneCatalog.length);
console.log('Scene 0:', JSON.stringify({
  name: catalogs.sceneCatalog[0].name,
  buildSteps: catalogs.sceneCatalog[0].buildSteps.length,
  batchIds: catalogs.sceneCatalog[0].batchIds
}));
const s0 = catalogs.sceneCatalog[0];
console.log('Build step costs:', s0.buildSteps.map(b => b.goldCost));
console.log('Total build cost:', s0.buildSteps.reduce((s,b)=>s+b.goldCost,0));

// Show gold per batch
let totalGoldFromOrders = 0;
s0.batchIds.forEach(bid => {
  const batch = catalogs.batchMap[bid];
  if (!batch) { console.log('Missing batch', bid); return; }
  const batchGold = batch.orderIds.reduce((sum, oid) => {
    const d = catalogs.orderDetailMap[oid];
    return sum + (d ? d.gold : 0);
  }, 0);
  totalGoldFromOrders += batchGold;
  console.log(`  Batch ${bid}: ${batch.orderIds.length} orders, ${batchGold} gold`);
});
console.log('Total gold from orders:', totalGoldFromOrders);

// Show starter items
const starters = SimRunner.getStarterItems(catalogs);
console.log('Starter generators:', starters.initialGens);
console.log('Starter tools:', starters.initialTools.length);

// Pick mid-core profile
const profile = {
  name: 'midcore', sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
  regenPerMin: 0.2, cap: 100, playerType: 'f2p',
  purchases: [], enabled: true
};

console.log('\n=== Running 30-day sim for mid-core ===');
const log = SimRunner.runFull(catalogs, profile, 30);
const snapshots = [1,5,10,15,20,25,30];
snapshots.forEach(d => {
  const row = log[d-1];
  if (!row) return;
  console.log(`Day ${row.day}: scene=${row.scene} (idx ${row.sceneIndex}) buildSteps=${row.buildStepsDone} goldEarned=${row.goldEarned}`);
});

// Show what items each batch needs (after day 1) — to see what's blocking
console.log('\n=== Batch item requirements ===');
s0.batchIds.forEach(bid => {
  const batch = catalogs.batchMap[bid];
  if (!batch) return;
  const items = new Set();
  batch.orderIds.forEach(oid => {
    const d = catalogs.orderDetailMap[oid];
    if (d) d.items.forEach(({itemId, qty}) => items.add(`${itemId}x${qty}`));
  });
  console.log(`  Batch ${bid}: needs [${[...items].join(', ')}]`);
});

console.log('\n=== Generator spawn outputs ===');
const starterIds = SimRunner.getStarterItems(catalogs).initialGens.map(g => g.genId);
starterIds.forEach(id => {
  const g = catalogs.generatorCatalog[id];
  if (!g) return;
  const spawns = g.spawns.map(s => `${s.itemId}@${s.rate}`).slice(0,3).join(',');
  console.log(`  ${id} type=${g.type} L${g.level} canGen=${g.canGenerate} → ${spawns}`);
});

// Detailed final state - manually iterate to inspect
console.log('\n=== Detailed iterate to day 5 to inspect state ===');
const SimEngine = require('../js/sim/simEngine');
const s2 = SimRunner.getStarterItems(catalogs);
const state = SimEngine.createState(catalogs, profile, s2.initialGens, s2.initialTools, s2.initialItems);

// Hook the expand & merge to log activity
const SimBoardMod = require('../js/sim/simBoard');
const origMerge = SimBoardMod.mergeItems;
let mergeStats = {};
SimBoardMod.mergeItems = function(board, neededQty, familyChain, maxTierByFamily) {
  const result = origMerge.call(this, board, neededQty, familyChain, maxTierByFamily);
  const after = JSON.stringify({b: {...board.boardItems}, i: {...board.inventoryItems}});
  // count appearances of key items
  ['700301','700302','700401','700402','700501','700506','700701'].forEach(id => {
    const cnt = (board.boardItems[id]||0)+(board.inventoryItems[id]||0);
    if (cnt) mergeStats[id] = Math.max(mergeStats[id]||0, cnt);
  });
  return result;
};

const trackIds = ['700301','700302','700401','700402'];
for (let d = 0; d < 30; d++) {
  SimEngine.tickDay(state, catalogs, profile);
  if (d < 10) {
    const snap = trackIds.map(id => `${id}=${(state.board.boardItems[id]||0)+(state.board.inventoryItems[id]||0)}`).join(' ');
    console.log(`  d${state.day} energy=${state.energy.owned.toFixed(0)} stepsDone=${state.progress.buildStepsDone} orders=${state.progress.completedOrderIds.size} | ${snap}`);
  }
  if (d === 4) console.log('mergeStats day 5:', mergeStats);
  if (d === 29) {
    console.log('\n=== Remaining orders at day 30 ===');
    s0.batchIds.forEach(bid => {
      const batch = catalogs.batchMap[bid];
      if (!batch || state.progress.completedBatchIds.has(bid)) return;
      batch.orderIds.forEach(oid => {
        if (state.progress.completedOrderIds.has(oid)) return;
        const d = catalogs.orderDetailMap[oid];
        if (!d) return;
        const needs = d.items.map(it => {
          const have = (state.board.boardItems[it.itemId]||0)+(state.board.inventoryItems[it.itemId]||0);
          return `${it.itemId}x${it.qty}(have ${have})`;
        }).join(' + ');
        console.log(`  Batch ${bid} order ${oid} [${d.gold}g]: ${needs}`);
      });
    });
  }
  if (d < 3 || d === 9 || d === 29) {
    console.log(`\n-- Day ${state.day} --`);
    console.log('Energy:', state.energy.owned.toFixed(1), '/', state.energy.cap);
    console.log('Gold bank:', state.progress.goldBank, '| earned:', state.progress.goldEarned);
    console.log('Build steps done:', state.progress.buildStepsDone, '/', s0.buildSteps.length);
    console.log('Completed orders:', state.progress.completedOrderIds.size);
    console.log('Board items count:', state.board.boardItemCount, '| Inventory:', state.board.inventoryCount);
    const gens = state.board.generators.map(g => `${g.genId}(pool=${g.pool})`);
    console.log('Generators:', gens.slice(0, 10).join(' | '));
    const items = Object.entries(state.board.boardItems).slice(0,10).map(([k,v])=>`${k}=${v}`);
    console.log('Items on board:', items.join(', '));
    const invItems = Object.entries(state.board.inventoryItems).slice(0,10).map(([k,v])=>`${k}=${v}`);
    console.log('Inventory items:', invItems.join(', '));
    console.log('Energy spent total:', state.economy.energy.spent.toFixed(1));
  }
}
