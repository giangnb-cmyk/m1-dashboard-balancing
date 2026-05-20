// Trace exactly where Ice Cubes (700301) go during batch 7
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
const dataDir = path.join(__dirname, '..', 'js', 'data');
['data-init.js','data-items.js','data-generators.js','data-buildup.js',
 'data-orders.js','data-boxes.js','data-iap.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), ctx));
global.window = ctx.window;

const SimDataLoader = require('../js/sim/simDataLoader');
const SimEngine    = require('../js/sim/simEngine');
const SimRunner    = require('../js/sim/simRunner');
const SimBoard     = require('../js/sim/simBoard');

const catalogs = SimDataLoader.build(window.GameData);

// Patch SimBoard.addItem and consumeItem to track Ice Cube
let tracking = false;
const ICE = '700301', MILK = '700302', YOGURT = '700303';

const origAdd = SimBoard.addItem.bind(SimBoard);
SimBoard.addItem = function(board, itemId, qty) {
  const r = origAdd(board, itemId, qty);
  if (tracking && (itemId === ICE || itemId === MILK || itemId === YOGURT)) {
    const ice = SimBoard.itemCount(board, ICE);
    const milk = SimBoard.itemCount(board, MILK);
    const yogurt = SimBoard.itemCount(board, YOGURT);
    console.log(`  ADD ${itemId}×${qty} ok=${r} → board: Ice=${ice} Milk=${milk} Yogurt=${yogurt}`);
    console.trace('  stack');
  }
  return r;
};

const origConsume = SimBoard.consumeItem.bind(SimBoard);
SimBoard.consumeItem = function(board, itemId, qty) {
  const r = origConsume(board, itemId, qty);
  if (tracking && (itemId === ICE || itemId === MILK || itemId === YOGURT)) {
    const ice = SimBoard.itemCount(board, ICE);
    const milk = SimBoard.itemCount(board, MILK);
    const yogurt = SimBoard.itemCount(board, YOGURT);
    console.log(`  CONSUME ${itemId}×${qty} ok=${r} → board: Ice=${ice} Milk=${milk} Yogurt=${yogurt}`);
    console.trace('  stack');
  }
  return r;
};

const origSell = SimBoard.sellCheapestItem.bind(SimBoard);
SimBoard.sellCheapestItem = function(board, prices, requiredIds) {
  const r = origSell(board, prices, requiredIds);
  if (tracking && (board.boardItems[ICE] !== undefined || board.boardItems[MILK])) {
    // Only log if Ice or Milk is involved
  }
  return r;
};

const profile = { name: 'test', sessionsPerDay: 4, regenPerMin: 0.2, cap: 100,
                  playerType: 'f2p', startingEnergy: 50, startingGems: 0 };
const { initialGens, initialTools, initialItems } = SimRunner.getStarterItems(catalogs);
const state = SimEngine.createState(catalogs, profile, initialGens, initialTools, initialItems);

let dayTracked = 0;
for (let d = 0; d < 500; d++) {
  const in7 = !state.progress.completedBatchIds.has('7') && state.progress.completedBatchIds.size >= 6;

  // Track only first 3 days of batch 7
  if (in7 && dayTracked < 3) {
    dayTracked++;
    tracking = true;
    console.log(`\n=== Day ${d+1} (Batch 7, session ${dayTracked}) ===`);
    console.log(`  Start: Ice=${SimBoard.itemCount(state.board,ICE)} Milk=${SimBoard.itemCount(state.board,MILK)} Yogurt=${SimBoard.itemCount(state.board,YOGURT)}`);
    console.log(`  neededQty will be computed by engine...`);
  } else {
    tracking = false;
  }

  SimEngine.tickDay(state, catalogs, profile);

  if (tracking) {
    console.log(`  End: Ice=${SimBoard.itemCount(state.board,ICE)} Milk=${SimBoard.itemCount(state.board,MILK)} Yogurt=${SimBoard.itemCount(state.board,YOGURT)}`);
  }

  if (state.progress.completedOrderIds.has('20') && state.progress.completedOrderIds.has('24')) {
    console.log(`\n✓ Done on day ${d+1}`); process.exit(0);
  }
}
console.log('\n✗ Still stuck after 500 days');
console.log('Stats merged (Dairy family):',
  Object.fromEntries(Object.entries(state.stats.merged).filter(([k]) => k.startsWith('7003'))));
