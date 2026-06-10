// tests/simEngine.gem.test.js
// Gem-driven progression: energy buying, mid-session rebuy, intra-session loop.
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimDataLoader = require('../js/sim/simDataLoader');
const SimEngine = require('../js/sim/simEngine');

// Two batches in Scene_01, both fulfilled by raw item 700501 (no cooking),
// spawned by generator 100204. Taps cost 10 energy to force mid-session rebuys.
const mockGameData = {
  rateGenerator: [
    { id: '100204', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '600',
      cost_energy: '10', min_count: '30', max_count: '30', gem_to_min: '' },
  ],
  itemMerge: [
    { id: '700501', name_item: 'Fruit', can_merge: 'FALSE', sell_price: '2', sum_merge: '' },
  ],
  itemExpand: [],
  formuaRecipes: [],
  buildUpGoalData: [
    { theme: 'Scene_01', id: '0', cost: '10',
      rw_build_up_type: '', rw_build_up_number: '', custom_rw_build_up_value: '' },
  ],
  buildUpGoalReward: [],
  orderSystem: [
    { id: '1', theme_type: 'Scene_01', can_receive_reward: 'FALSE',
      order1_idOrder: '1', res_type: '', res_id: '', res_number: '', custom_value: '' },
    { id: '2', theme_type: 'Scene_01', can_receive_reward: 'FALSE',
      order1_idOrder: '2', res_type: '', res_id: '', res_number: '', custom_value: '' },
  ],
  orderDetail: [
    { orderId: '1', item1_id: '700501', item1_amount: '1',
      item2_id: '', item2_amount: '', gold: '15' },
    { orderId: '2', item1_id: '700501', item1_amount: '2',
      item2_id: '', item2_amount: '', gold: '20' },
  ],
  iapEnergyPack: [],
};

function makeCfg(overrides) {
  return {
    name: 'test', sessionMode: 'sessionsPerDay', sessionsPerDay: 1,
    regenPerMin: 0.001, cap: 100, playerType: 'f2p', purchases: [],
    startingEnergy: 0, gemEnergyBuysPerDay: 999, gemGenResetsPerDay: 999,
    gemInstantCooksPerDay: 999, ...overrides
  };
}

suite('SimEngine gem spending', () => {
  const cats = SimDataLoader.build(mockGameData);

  test('energy buy cost plateaus at last BuyCurrency tier beyond 5th purchase', () => {
    assert(SimEngine._test && SimEngine._test.tryBuyEnergy, 'expected _test.tryBuyEnergy export');
    const state = {
      day: 1, energy: { owned: 0, cap: 1000, regenPerMin: 0 }, gems: 10000,
      energyBuyCount: 0, eventLog: [],
      progress: { scene: 'Scene_01' },
      economy: { energy: { received: 0, spent: 0 }, gems: { received: 0, spent: 0 }, gold: { received: 0, spent: 0 } }
    };
    SimEngine._test.tryBuyEnergy(state, { gemEnergyBuysPerDay: 7 });
    assertEqual(state.energyBuyCount, 7);
    assertEqual(state.energy.owned, 700);
    // 10+20+40+80+160 then plateau 160+160 = 630
    assertEqual(state.economy.gems.spent, 630);
  });

  test('f2p profile with gems buys energy at session start', () => {
    const cfg = makeCfg({ playerType: 'f2p' });
    const state = SimEngine.createState(cats, cfg, [{ genId: '100204', qty: 1 }], []);
    state.gems = 1000;
    SimEngine.tickDay(state, cats, cfg);
    assert(state.economy.gems.spent > 0,
      `Expected f2p with gems to spend them (spent=${state.economy.gems.spent})`);
  });

  test('rebuys energy mid-session to drain required generator pool', () => {
    const cfg = makeCfg({});
    const state = SimEngine.createState(cats, cfg, [{ genId: '100204', qty: 1 }], []);
    state.gems = 5000;
    SimEngine.tickDay(state, cats, cfg);
    // Pool of 30 taps × 10⚡ = 300 energy needed; one session-start buy gives 100.
    // Mid-session rebuys must keep tapping until the pool is exhausted.
    const generated = state.stats.generated['700501'] || 0;
    assert(generated >= 30, `Expected full pool drained (generated=${generated}, want >=30)`);
  });

  test('completes consecutive batches within a single session', () => {
    const cfg = makeCfg({ startingEnergy: 400, gemEnergyBuysPerDay: 0 });
    const state = SimEngine.createState(cats, cfg, [{ genId: '100204', qty: 1 }], []);
    SimEngine.tickDay(state, cats, cfg);
    // 400⚡ drains the full pool (30 items) in one session — enough for both
    // batches (1× + 2× of 700501). Intra-session loop must complete batch 2 too.
    assertEqual(state.progress.batchesDone, 2);
  });

  test('short recipes cook and fulfill orders within the same session', () => {
    // Order needs cooked item 400201 (2-min recipe from 700501). A 30-min play
    // session must cook it and complete the order the same day — no gems needed.
    const cookData = {
      ...mockGameData,
      formuaRecipes: [
        { itemID: '400201', toolId: '2001', TimeToCook_sec: '120',
          Ingredient1Id: '700501', Ingredient2Id: '', Ingredient3Id: '', Ingredient4Id: '' },
      ],
      itemMerge: [
        ...mockGameData.itemMerge,
        { id: '400201', name_item: 'Juice', can_merge: 'FALSE', sell_price: '5', sum_merge: '' },
      ],
      orderDetail: [
        { orderId: '1', item1_id: '400201', item1_amount: '1',
          item2_id: '', item2_amount: '', gold: '15' },
        { orderId: '2', item1_id: '700501', item1_amount: '2',
          item2_id: '', item2_amount: '', gold: '20' },
      ],
    };
    const cookCats = SimDataLoader.build(cookData);
    const cfg = makeCfg({ startingEnergy: 400, gemEnergyBuysPerDay: 0 });
    const state = SimEngine.createState(cookCats, cfg,
      [{ genId: '100204', qty: 1 }], [{ toolType: '2001' }]);
    SimEngine.tickDay(state, cookCats, cfg);
    assert(state.progress.completedOrderIds.has('1'),
      `Expected cooked order 1 completed in day 1 (orders done: ${[...state.progress.completedOrderIds]})`);
  });

  test('batch reward boxes open into component items', () => {
    const boxData = {
      ...mockGameData,
      orderSystem: [
        { id: '1', theme_type: 'Scene_01', can_receive_reward: 'TRUE',
          order1_idOrder: '1', reward1_resType: 'Item', reward1_resId: '',
          reward1_resNumber: '1', reward1_customValue: '600801' },
        { id: '2', theme_type: 'Scene_01', can_receive_reward: 'FALSE',
          order1_idOrder: '2', res_type: '', res_id: '', res_number: '', custom_value: '' },
      ],
      boxes: {
        itemGift: [
          { id: '600801', many_generator: '3', time_unlock: '0', item_child_id: '700777', rate: '1' },
        ],
      },
    };
    const boxCats = SimDataLoader.build(boxData);
    const cfg = makeCfg({ startingEnergy: 400, gemEnergyBuysPerDay: 0 });
    const state = SimEngine.createState(boxCats, cfg, [{ genId: '100204', qty: 1 }], []);
    SimEngine.tickDay(state, boxCats, cfg);
    assert(state.progress.completedBatchIds.has('1'), 'Expected batch 1 done');
    const SimBoard = require('../js/sim/simBoard');
    assertEqual(SimBoard.itemCount(state.board, '600801'), 0); // box never sits on board
    assertEqual(SimBoard.itemCount(state.board, '700777'), 3); // contents spawned
  });

  test('mergeItems never merges past maxTierByFamily cap', () => {
    const SimBoard = require('../js/sim/simBoard');
    const board = SimBoard.create();
    SimBoard.addItem(board, 'f1', 8);
    const familyChain = { F: ['f1', 'f2', 'f3', 'f4'] };
    // Cap at tier 2: 8× f1 → 4× f2, never f3/f4
    SimBoard.mergeItems(board, {}, familyChain, { F: 2 });
    assertEqual(SimBoard.itemCount(board, 'f2'), 4);
    assertEqual(SimBoard.itemCount(board, 'f3'), 0);
    assertEqual(SimBoard.itemCount(board, 'f4'), 0);
  });

  test('direct-energy mode buys energy with gems to pay order costs', () => {
    const directData = {
      ...mockGameData,
      itemData: [
        { itemID: '700501', type: 'Item', energy_cost: '150' },
      ],
    };
    const directCats = SimDataLoader.build(directData);
    // Order 1 needs 700501 ×1 → 150⚡. Regen ~0, energy 0: must be gem-funded.
    const cfg = makeCfg({ directEnergyMode: true, startingEnergy: 0 });
    const state = SimEngine.createState(directCats, cfg, [], []);
    state.gems = 1000;
    SimEngine.tickDay(state, directCats, cfg);
    assert(state.progress.completedOrderIds.has('1'),
      `Expected order 1 paid via gem-bought energy (gems left ${state.gems}, energy ${state.energy.owned})`);
    assert(state.economy.gems.spent > 0, 'Expected gems spent on energy');
  });

  test('gem limits set to 0 disable gem energy buying', () => {
    const cfg = makeCfg({ gemEnergyBuysPerDay: 0 });
    const state = SimEngine.createState(cats, cfg, [{ genId: '100204', qty: 1 }], []);
    state.gems = 5000;
    SimEngine.tickDay(state, cats, cfg);
    assertEqual(state.economy.gems.spent, 0);
  });
});

summary();
