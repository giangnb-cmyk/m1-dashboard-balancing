// tests/simBoard.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimBoard = require('../js/sim/simBoard');

const genCat = {
  '100201': { id: '100201', type: 'FruitGen', level: 1, canGenerate: false,
    cooldownSecs: 9000, costEnergy: 1, minPool: 5, maxPool: 15, spawns: [], sellPrice: 0 },
  '100202': { id: '100202', type: 'FruitGen', level: 2, canGenerate: false,
    cooldownSecs: 8500, costEnergy: 1, minPool: 6, maxPool: 18, spawns: [], sellPrice: 0 },
  '100203': { id: '100203', type: 'FruitGen', level: 3, canGenerate: false,
    cooldownSecs: 8000, costEnergy: 1, minPool: 7, maxPool: 21, spawns: [], sellPrice: 0 },
  '100204': { id: '100204', type: 'FruitGen', level: 4, canGenerate: true,
    cooldownSecs: 7200, costEnergy: 1, minPool: 8, maxPool: 24,
    spawns: [{ itemId: '700501', rate: 100 }], sellPrice: 0 },
  '100205': { id: '100205', type: 'FruitGen', level: 5, canGenerate: true,
    cooldownSecs: 5900, costEnergy: 1, minPool: 10, maxPool: 30,
    spawns: [{ itemId: '700501', rate: 100 }], sellPrice: 0 },
};
const sellPrices = { '700501': 2, '700601': 5 };

suite('SimBoard', () => {
  suite('create', () => {
    test('starts empty with no generators or tools', () => {
      const b = SimBoard.create();
      assertEqual(b.generators.length, 0);
      assertEqual(b.tools.length, 0);
      assertEqual(SimBoard.boardItemCount(b), 0);
    });
    test('inventoryCapacity defaults to 15', () => {
      assertEqual(SimBoard.create().inventoryCapacity, 15);
    });
    test('custom inventoryCapacity respected', () => {
      assertEqual(SimBoard.create({ inventoryCapacity: 20 }).inventoryCapacity, 20);
    });
  });

  suite('addGenerator', () => {
    test('adds generator to board, pool = maxPool', () => {
      const b = SimBoard.create();
      const ok = SimBoard.addGenerator(b, '100204', genCat);
      assert(ok === true);
      assertEqual(b.generators.length, 1);
      assertEqual(b.generators[0].genId, '100204');
      assertEqual(b.generators[0].pool, 24);
    });
    test('returns false for unknown generator', () => {
      const b = SimBoard.create();
      assert(SimBoard.addGenerator(b, 'UNKNOWN', genCat) === false);
    });
  });

  suite('addTool', () => {
    test('adds tool with cooking=null', () => {
      const b = SimBoard.create();
      SimBoard.addTool(b, '2001');
      assertEqual(b.tools.length, 1);
      assertEqual(b.tools[0].toolType, '2001');
      assert(b.tools[0].cooking === null);
    });
  });

  suite('slotsUsed', () => {
    test('counts generators + tools (not items)', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      SimBoard.addTool(b, '2001');
      assertEqual(SimBoard.slotsUsed(b), 2);
    });
    test('slotsAvailable = 63 - slotsUsed', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      assertEqual(SimBoard.slotsAvailable(b), 62);
    });
  });

  suite('addItem + consumeItem + itemCount', () => {
    test('addItem increases boardItemCount', () => {
      const b = SimBoard.create();
      SimBoard.addItem(b, '700501', 3);
      assertEqual(SimBoard.boardItemCount(b), 3);
      assertEqual(SimBoard.itemCount(b, '700501'), 3);
    });
    test('consumeItem from board decreases count', () => {
      const b = SimBoard.create();
      SimBoard.addItem(b, '700501', 3);
      SimBoard.consumeItem(b, '700501', 2);
      assertEqual(SimBoard.itemCount(b, '700501'), 1);
      assertEqual(SimBoard.boardItemCount(b), 1);
    });
    test('consumeItem returns false if not enough', () => {
      const b = SimBoard.create();
      SimBoard.addItem(b, '700501', 1);
      assert(SimBoard.consumeItem(b, '700501', 5) === false);
      assertEqual(SimBoard.itemCount(b, '700501'), 1);
    });
    test('overflow to inventory when board is full', () => {
      const b = SimBoard.create({ inventoryCapacity: 5 });
      // Fill board minus generators/tools area: add 63 items to fill it
      // Instead, just set boardItemCount manually to simulate full board
      b.boardItemCount = 63;
      const result = SimBoard.addItem(b, '700502', 1);
      // Should go to inventory since board is full
      assert(result === true);
      assertEqual(b.inventoryCount, 1);
      assertEqual(b.inventoryItems['700502'], 1);
    });
  });

  suite('tapGenerator', () => {
    test('returns spawned item and reduces pool', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      const item = SimBoard.tapGenerator(b, '100204', genCat, 0);
      assertEqual(item, '700501');
      assertEqual(b.generators[0].pool, 23);
    });
    test('returns null when pool is 0 and on cooldown', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      b.generators[0].pool = 0;
      b.generators[0].cooldownUntil = 9999;
      assert(SimBoard.tapGenerator(b, '100204', genCat, 0) === null);
    });
    test('returns null when canGenerate=false', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      assert(SimBoard.tapGenerator(b, '100201', genCat, 0) === null);
    });
    test('sets cooldownUntil when pool depleted', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      b.generators[0].pool = 1;
      SimBoard.tapGenerator(b, '100204', genCat, 0);
      assertEqual(b.generators[0].pool, 0);
      assert(b.generators[0].cooldownUntil > 0);
    });
  });

  suite('refillGenerators', () => {
    test('refills when cooldown elapsed', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      b.generators[0].pool = 0;
      b.generators[0].cooldownUntil = 60;
      SimBoard.refillGenerators(b, genCat, 120);
      assertEqual(b.generators[0].pool, 24);
      assertEqual(b.generators[0].cooldownUntil, 0);
    });
    test('does not refill before cooldown', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      b.generators[0].pool = 0;
      b.generators[0].cooldownUntil = 60;
      SimBoard.refillGenerators(b, genCat, 30);
      assertEqual(b.generators[0].pool, 0);
    });
  });

  suite('mergeGenerators (demand-driven)', () => {
    test('merges 2 level-1 gens when level-1 NOT in required set', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.mergeGenerators(b, new Set(['100204']), genCat);
      assertEqual(b.generators.length, 1);
      assertEqual(b.generators[0].genId, '100202');
    });
    test('does NOT merge when genId IS in required set', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.mergeGenerators(b, new Set(['100201']), genCat);
      assertEqual(b.generators.length, 2);
    });
    test('merges upward until required level reached: 4 × lv1 → 1 × lv3', () => {
      const b = SimBoard.create();
      for (let i = 0; i < 4; i++) SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.mergeGenerators(b, new Set(['100203']), genCat);
      assertEqual(b.generators.length, 1);
      assertEqual(b.generators[0].genId, '100203');
    });
    test('does not merge past highest level in required set', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.addGenerator(b, '100201', genCat);
      // required: 100202 (lv2). Should merge to 100202 but not past it.
      SimBoard.mergeGenerators(b, new Set(['100202']), genCat);
      assertEqual(b.generators.length, 1);
      assertEqual(b.generators[0].genId, '100202');
      // a second merge with same required set should not merge further
      SimBoard.addGenerator(b, '100202', genCat);
      SimBoard.mergeGenerators(b, new Set(['100202']), genCat);
      assertEqual(b.generators.length, 2); // still 2, not merged to lv3
    });
  });

  suite('sellCheapestItem', () => {
    test('sells lowest-price item not in required set, returns gold', () => {
      const b = SimBoard.create();
      b.boardItems['700501'] = 3;
      b.boardItemCount = 3;
      b.boardItems['700601'] = 1;
      b.boardItemCount += 1;
      const gold = SimBoard.sellCheapestItem(b, sellPrices, new Set());
      assertEqual(gold, 2);
      assertEqual(b.boardItems['700501'], 2);
      assertEqual(b.boardItemCount, 3);
    });
    test('skips required items', () => {
      const b = SimBoard.create();
      b.boardItems['700501'] = 2;
      b.boardItemCount = 2;
      const gold = SimBoard.sellCheapestItem(b, sellPrices, new Set(['700501']));
      assertEqual(gold, 0);
      assertEqual(b.boardItemCount, 2);
    });
    test('returns 0 when nothing to sell', () => {
      const b = SimBoard.create();
      assertEqual(SimBoard.sellCheapestItem(b, sellPrices, new Set()), 0);
    });
  });

  suite('expandInventory', () => {
    test('increments inventoryCapacity by 1', () => {
      const b = SimBoard.create();
      assertEqual(b.inventoryCapacity, 15);
      SimBoard.expandInventory(b);
      assertEqual(b.inventoryCapacity, 16);
    });
  });
});

summary();
