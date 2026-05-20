// tests/simEngine.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimDataLoader = require('../js/sim/simDataLoader');
const SimEngine = require('../js/sim/simEngine');

// Minimal 1-scene, 1-batch, 1-order game data
const mockGameData = {
  rateGenerator: [
    { id: '100201', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '9000',
      cost_energy: '1', min_count: '5', max_count: '5', gem_to_min: '' },
    { id: '100202', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '8000',
      cost_energy: '1', min_count: '5', max_count: '5', gem_to_min: '' },
    { id: '100203', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '7000',
      cost_energy: '1', min_count: '5', max_count: '5', gem_to_min: '' },
    { id: '100204', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '600',
      cost_energy: '1', min_count: '30', max_count: '30', gem_to_min: '' },
  ],
  itemMerge: [
    { id: '700501', name_item: 'Fruit', can_merge: 'TRUE', sell_price: '2', sum_merge: '' },
    { id: '400201', name_item: 'Juice', can_merge: 'FALSE', sell_price: '5', sum_merge: '' },
  ],
  itemExpand: [],
  formuaRecipes: [
    { itemID: '400201', toolId: '2001', TimeToCook_sec: '1',
      Ingredient1Id: '700501', Ingredient2Id: '', Ingredient3Id: '', Ingredient4Id: '' },
  ],
  buildUpGoalData: [
    { theme: 'Scene_01', id: '0', cost: '10',
      rw_build_up_type: '', rw_build_up_number: '', custom_rw_build_up_value: '' },
  ],
  buildUpGoalReward: [],
  orderSystem: [
    { id: '1', theme_type: 'Scene_01', can_receive_reward: 'FALSE',
      order1_idOrder: '1', res_type: '', res_id: '', res_number: '', custom_value: '' },
  ],
  orderDetail: [
    { orderId: '1', item1_id: '400201', item1_amount: '1',
      item2_id: '', item2_amount: '', gold: '15' },
  ],
  iapEnergyPack: [
    { id: '1', pack_name: 'energy_pack_1', res_type: 'Money', res_id: '3',
      res_number: '50', iap_cost: '2.99', custom_value: '' },
  ],
};

suite('SimEngine', () => {
  const cats = SimDataLoader.build(mockGameData);

  suite('createState', () => {
    test('initial energy matches default', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], []);
      assertEqual(state.energy.owned, 50); // default startingEnergy = 50
      assertEqual(state.energy.cap, 100);
    });
    test('initial generators placed on board', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [{ genId: '100204', qty: 1 }], []);
      assertEqual(state.board.generators.length, 1);
      assertEqual(state.board.generators[0].genId, '100204');
    });
    test('initial tools placed on board', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], [{ toolType: '2001' }]);
      assertEqual(state.board.tools.length, 1);
    });
    test('scene starts at index 0', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], []);
      assertEqual(state.progress.sceneIndex, 0);
    });
  });

  suite('tickDay', () => {
    test('day increments', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], []);
      SimEngine.tickDay(state, cats, cfg);
      assertEqual(state.day, 1);
    });
    test('dayLog is appended to state.log', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], []);
      const { dayLog } = SimEngine.tickDay(state, cats, cfg);
      assertEqual(state.log.length, 1);
      assertEqual(dayLog.day, 1);
    });
    test('gold earned after completing order (enough energy + tool + gen)', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 10,
        regenPerMin: 2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg,
        [{ genId: '100204', qty: 1 }], [{ toolType: '2001' }]);
      state.energy.owned = 100;
      // Run up to 5 days looking for gold
      let earned = false;
      for (let d = 0; d < 5; d++) {
        SimEngine.tickDay(state, cats, cfg);
        if (state.progress.goldEarned > 0) { earned = true; break; }
      }
      assert(earned, 'Expected gold to be earned within 5 days');
    });
    test('energy received tracked in economy', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 1, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], []);
      state.energy.owned = 0;
      SimEngine.tickDay(state, cats, cfg);
      assert(state.economy.energy.received > 0, 'Expected energy received > 0');
    });
  });

  suite('applyPurchase', () => {
    test('injects energy from IAP package', () => {
      const cfg = { sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [] };
      const state = SimEngine.createState(cats, cfg, [], []);
      const initialOwned = state.energy.owned;
      SimEngine.applyPurchase(state,
        { day: 1, packageKey: 'iapEnergyPack', packageId: '1', quantity: 1 },
        cats.iapCatalog);
      assertEqual(state.energy.owned, initialOwned + 50);
    });
  });
});

summary();
