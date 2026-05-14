// tests/simDataLoader.test.js
const { test, assert, assertEqual, assertDeepEqual, suite, summary } = require('./testRunner');

const mockGameData = {
  rateGenerator: [
    { id: '100204', type: 'FruitGen', item_id: '700501', rate: '75',
      time_cooldown: '7200', cost_energy: '1', min_count: '8', max_count: '24', gem_to_min: '17' },
    { id: '100204', type: 'FruitGen', item_id: '700601', rate: '25',
      time_cooldown: '', cost_energy: '', min_count: '', max_count: '', gem_to_min: '' },
    { id: '100205', type: 'FruitGen', item_id: '700501', rate: '50',
      time_cooldown: '5900', cost_energy: '1', min_count: '10', max_count: '30', gem_to_min: '26' },
    { id: '100201', type: 'FruitGen', item_id: '700501', rate: '100',
      time_cooldown: '9000', cost_energy: '1', min_count: '5', max_count: '15', gem_to_min: '10' },
    { id: '100202', type: 'FruitGen', item_id: '700501', rate: '100',
      time_cooldown: '8500', cost_energy: '1', min_count: '6', max_count: '18', gem_to_min: '12' },
    { id: '100203', type: 'FruitGen', item_id: '700501', rate: '100',
      time_cooldown: '8000', cost_energy: '1', min_count: '7', max_count: '21', gem_to_min: '14' },
  ],
  itemMerge: [
    { id: '100204', name_item: 'Gen', can_merge: 'TRUE', sell_price: '0', sum_merge: '' },
    { id: '400201', name_item: 'Juice', can_merge: 'FALSE', sell_price: '5', sum_merge: '' },
  ],
  itemExpand: [
    { itemID: '700302', spawn_itemID: '700401', spawn_number: '1', time_cooldown: '3', cost_energy: '1' },
    { itemID: '700506', spawn_itemID: '700701', spawn_number: '1', time_cooldown: '3', cost_energy: '1' },
    { itemID: '700506', spawn_itemID: '700801', spawn_number: '1', time_cooldown: '', cost_energy: '' },
  ],
  formuaRecipes: [
    { itemID: '400201', toolId: '2001', TimeToCook_sec: '1',
      Ingredient1Id: '700501', Ingredient2Id: '', Ingredient3Id: '', Ingredient4Id: '' },
    { itemID: '400202', toolId: '2001', TimeToCook_sec: '2',
      Ingredient1Id: '700502', Ingredient2Id: '', Ingredient3Id: '', Ingredient4Id: '' },
    { itemID: '400207', toolId: '2001', TimeToCook_sec: '65',
      Ingredient1Id: '700501', Ingredient2Id: '700507', Ingredient3Id: '', Ingredient4Id: '' },
  ],
  buildUpGoalData: [
    { theme: 'Scene_01', id: '0', cost: '22',
      rw_build_up_type: 'Item', rw_build_up_number: '1', custom_rw_build_up_value: '100103' },
    { theme: '', id: '1', cost: '40',
      rw_build_up_type: '', rw_build_up_number: '', custom_rw_build_up_value: '' },
  ],
  buildUpGoalReward: [],
  orderSystem: [
    { id: '1', theme_type: 'Scene_01', can_receive_reward: 'FALSE',
      id_order: '1', res_type: '', res_id: '', res_number: '', custom_value: '' },
    { id: '', theme_type: '', can_receive_reward: '',
      id_order: '2', res_type: '', res_id: '', res_number: '', custom_value: '' },
    { id: '2', theme_type: 'Scene_01', can_receive_reward: 'TRUE',
      id_order: '3', res_type: 'Item', res_id: '', res_number: '1', custom_value: '100201' },
    { id: '', theme_type: '', can_receive_reward: '',
      id_order: '4', res_type: 'Money', res_id: '3', res_number: '10', custom_value: '' },
  ],
  orderDetail: [
    { orderId: '1', item1_id: '400201', item1_amount: '1', item2_id: '', item2_amount: '', gold: '5' },
    { orderId: '2', item1_id: '400202', item1_amount: '1', item2_id: '', item2_amount: '', gold: '8' },
  ],
  iapEnergyPack: [
    { id: '1', pack_name: 'energy_pack_1', res_type: 'Money', res_id: '3',
      res_number: '100', iap_cost: '2.99', custom_value: '' },
  ],
};

const SimDataLoader = require('../js/sim/simDataLoader');

suite('normalizeTheme', () => {
  const { normalizeTheme } = SimDataLoader;
  test("'Scene_01' passthrough", () => assertEqual(normalizeTheme('Scene_01'), 'Scene_01'));
  test("'1' → 'Scene_01'", () => assertEqual(normalizeTheme('1'), 'Scene_01'));
  test("'10' → 'Scene_10'", () => assertEqual(normalizeTheme('10'), 'Scene_10'));
  test("'0' → 'Tutorial'", () => assertEqual(normalizeTheme('0'), 'Tutorial'));
  test("null → null", () => assert(normalizeTheme(null) === null));
  test("'' → null", () => assert(normalizeTheme('') === null));
});

suite('SimDataLoader.build', () => {
  const cats = SimDataLoader.build(mockGameData);

  suite('generatorCatalog', () => {
    test('contains generator 100204', () => {
      assert(cats.generatorCatalog['100204'] !== undefined);
    });
    test('100204 has 2 spawns', () => {
      assertEqual(cats.generatorCatalog['100204'].spawns.length, 2);
    });
    test('100204 level is 4 (4th in sorted FruitGen)', () => {
      assertEqual(cats.generatorCatalog['100204'].level, 4);
    });
    test('100204 canGenerate is true', () => {
      assert(cats.generatorCatalog['100204'].canGenerate === true);
    });
    test('100201 level is 1, canGenerate false', () => {
      assertEqual(cats.generatorCatalog['100201'].level, 1);
      assert(cats.generatorCatalog['100201'].canGenerate === false);
    });
    test('100204 sellPrice is 0 from itemMerge', () => {
      assertEqual(cats.generatorCatalog['100204'].sellPrice, 0);
    });
  });

  suite('toolCatalog', () => {
    test('tool 2001 exists', () => assert(cats.toolCatalog['2001'] !== undefined));
    test('tool 2001 has 3 recipes', () => assertEqual(cats.toolCatalog['2001'].recipes.length, 3));
    test('recipe 400207 has 2 ingredients', () => {
      const r = cats.toolCatalog['2001'].recipes.find(r => r.resultId === '400207');
      assertEqual(r.ingredients.length, 2);
    });
    test('recipe 400201 timeSecs is 1', () => {
      const r = cats.toolCatalog['2001'].recipes.find(r => r.resultId === '400201');
      assertEqual(r.timeSecs, 1);
    });
  });

  suite('itemExpandCatalog', () => {
    test('700302 expands to [700401]', () => {
      assertDeepEqual(cats.itemExpandCatalog['700302'].resultIds, ['700401']);
    });
    test('700506 expands to [700701, 700801]', () => {
      assertDeepEqual(cats.itemExpandCatalog['700506'].resultIds, ['700701', '700801']);
    });
  });

  suite('sceneCatalog', () => {
    test('Scene_01 exists at index 0', () => {
      assertEqual(cats.sceneCatalog[0].name, 'Scene_01');
      assertEqual(cats.sceneCatalog[0].index, 0);
    });
    test('Scene_01 has 2 buildSteps', () => {
      assertEqual(cats.sceneCatalog[0].buildSteps.length, 2);
    });
    test('Scene_01 step 0 goldCost 22', () => {
      assertEqual(cats.sceneCatalog[0].buildSteps[0].goldCost, 22);
    });
    test('Scene_01 step 0 has reward item 100103', () => {
      assertEqual(cats.sceneCatalog[0].buildSteps[0].reward.itemId, '100103');
    });
    test('Scene_01 step 1 has no reward', () => {
      assert(cats.sceneCatalog[0].buildSteps[1].reward === null);
    });
    test('Scene_01 batchIds contains 1 and 2', () => {
      assert(cats.sceneCatalog[0].batchIds.includes('1'));
      assert(cats.sceneCatalog[0].batchIds.includes('2'));
    });
  });

  suite('rewardSchedule', () => {
    test('buildStep reward for Scene_01 step 0 exists', () => {
      const r = cats.rewardSchedule.find(r =>
        r.trigger === 'buildStep' && r.scene === 'Scene_01' && r.stepId === '0');
      assert(r !== undefined);
      assertEqual(r.itemId, '100103');
    });
    test('order reward for order 3 gives item 100201', () => {
      const r = cats.rewardSchedule.find(r =>
        r.trigger === 'order' && r.orderId === '3');
      assert(r !== undefined);
      assertEqual(r.itemId, '100201');
    });
    test('order reward for order 4 gives energy 10', () => {
      const r = cats.rewardSchedule.find(r =>
        r.trigger === 'order' && r.orderId === '4');
      assert(r !== undefined);
      assertEqual(r.currency, 'energy');
      assertEqual(r.amount, 10);
    });
  });

  suite('iapCatalog', () => {
    test('iapEnergyPack exists', () => assert(cats.iapCatalog['iapEnergyPack'] !== undefined));
    test('iapEnergyPack pack 1 gives energy 100', () => {
      const c = cats.iapCatalog['iapEnergyPack'][0].contents[0];
      assertEqual(c.type, 'energy');
      assertEqual(c.amount, 100);
    });
  });

  suite('itemSellPrices', () => {
    test('400201 sell price is 5', () => assertEqual(cats.itemSellPrices['400201'], 5));
    test('100204 sell price is 0', () => assertEqual(cats.itemSellPrices['100204'], 0));
  });

  suite('orderCatalog', () => {
    test('batch 1 has orderIds [1,2]', () => {
      assertDeepEqual(cats.batchMap['1'].orderIds, ['1', '2']);
    });
    test('order 1 requires item 400201', () => {
      assertEqual(cats.orderDetailMap['1'].items[0].itemId, '400201');
    });
    test('order 1 gives 5 gold', () => assertEqual(cats.orderDetailMap['1'].gold, 5));
  });
});

summary();
