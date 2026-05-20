// Verify all scene orders complete — run 2000-day simulation across all profiles
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
const dataDir = path.join(__dirname, '..', 'js', 'data');
['data-init.js','data-items.js','data-generators.js','data-buildup.js',
 'data-orders.js','data-boxes.js','data-iap.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), ctx));
global.window = ctx.window;

const SimDataLoader = require('../js/sim/simDataLoader');
const SimRunner     = require('../js/sim/simRunner');
const cat = SimDataLoader.build(window.GameData);

// Build full scene order list (only scenes with content)
const sceneOrders = {};  // sceneId → Set of orderIds (strings)
let totalOrders = 0;
cat.sceneCatalog.forEach(scene => {
  const ids = new Set();
  scene.batchIds.forEach(bid => {
    const b = cat.batchMap[bid];
    if (b) b.orderIds.forEach(oid => { ids.add(String(oid)); totalOrders++; });
  });
  if (ids.size > 0) sceneOrders[scene.name] = ids;
});
console.log(`Scenes with content: ${Object.keys(sceneOrders).length}  |  Total orders: ${totalOrders}\n`);

const itemName = id => {
  const r = (window.GameData.itemData || []).find(r => r.itemID === String(id));
  return r ? r.name_item : String(id);
};

const profiles = [
  { name: 'f2p-casual',  sessionsPerDay: 2,  regenPerMin: 0.2, cap: 100, playerType: 'f2p',     startingEnergy: 50, startingGems: 0 },
  { name: 'f2p-midcore', sessionsPerDay: 4,  regenPerMin: 0.2, cap: 100, playerType: 'f2p',     startingEnergy: 50, startingGems: 0 },
  { name: 'spender',     sessionsPerDay: 6,  regenPerMin: 0.2, cap: 100, playerType: 'spender', startingEnergy: 50, startingGems: 200 },
];

const TARGET_DAYS = 2000;
let allPassed = true;

profiles.forEach(profile => {
  try {
    const iter = SimRunner.createStepIterator(cat, profile, TARGET_DAYS);
    let lastState = null;
    for (const { state } of iter) { lastState = state; }

    const completed = lastState.progress.completedOrderIds;
    const pending = [];

    Object.entries(sceneOrders).forEach(([sceneName, ids]) => {
      ids.forEach(oid => {
        if (!completed.has(oid)) {
          const detail = cat.orderDetailMap[oid];
          const items = detail ? detail.items.map(i => `${itemName(i.itemId)}×${i.qty}`).join(', ') : '?';
          pending.push(`  Order ${oid} [${sceneName}]: ${items}`);
        }
      });
    });

    console.log(`[${profile.name}] Day ${lastState.day} | Completed ${completed.size}/${totalOrders} orders`);
    if (pending.length === 0) {
      console.log(`  ✓ ALL ${totalOrders} ORDERS COMPLETED`);
    } else {
      allPassed = false;
      console.log(`  ✗ ${pending.length} PENDING:`);
      pending.slice(0, 12).forEach(l => console.log(l));
      if (pending.length > 12) console.log(`  ... and ${pending.length - 12} more`);
    }
  } catch (err) {
    allPassed = false;
    console.log(`[${profile.name}] CRASHED: ${err.message}\n${err.stack}`);
  }
});

console.log(`\n${allPassed ? '✓ ALL PROFILES PASS' : '✗ SOME PROFILES FAILED'}`);
process.exit(allPassed ? 0 : 1);
