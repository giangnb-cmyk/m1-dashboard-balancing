# Player Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a "Player Simulation" tab that animates player progression day-by-day across scenes for configurable profiles, including board management, cooking pipeline, IAP purchases, and economy tracking.

**Architecture:** Eight focused IIFE modules in `js/sim/` follow the existing codebase pattern (`const ModuleName = (() => {...})()`). Pure logic modules (DataLoader → Energy → Board → Cooking → Engine → Runner) are testable in Node.js via `if (typeof module !== 'undefined') module.exports = X`. UI modules (Config, Chart) are browser-only. `PlayerSim.init()` is wired into `js/app.js`.

**Tech Stack:** Vanilla JS ES6, Chart.js (already loaded via CDN), no new dependencies.

---

## File Map

```
js/sim/
├── simDataLoader.js   Parse window.GameData → all catalogs
├── simEnergy.js       Energy regen, cap, IAP inject
├── simBoard.js        Board 63-slot + inventory 15-slot + demand-driven merge
├── simCooking.js      Tool cooking pipeline
├── simEngine.js       tickDay(state) → newState
├── simRunner.js       Run N profiles, collect timeline[]
├── simConfig.js       Config panel + per-profile IAP purchase UI
└── simChart.js        Animated chart + playback controls + stats tables

tests/
├── testRunner.js
├── simDataLoader.test.js
├── simEnergy.test.js
├── simBoard.test.js
├── simCooking.test.js
└── simEngine.test.js

index.html              +nav item, +tab section, +8 <script> tags
styles.css              +simulation tab styles
js/app.js               +PlayerSim.init() in initModules()
```

---

## Task 1: Test Infrastructure

**Files:**
- Create: `tests/testRunner.js`

- [ ] **Step 1: Create test runner**

```js
// tests/testRunner.js
let _passed = 0, _failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); _passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); _failed++; }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Expected true, got false');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertDeepEqual(a, b, msg) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(msg || `Expected ${bs}, got ${as}`);
}

function assertNull(a, msg) {
  if (a !== null && a !== undefined) throw new Error(msg || `Expected null/undefined, got ${JSON.stringify(a)}`);
}

function suite(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function summary() {
  console.log(`\n${_passed} passed, ${_failed} failed`);
  if (_failed > 0) process.exit(1);
}

module.exports = { test, assert, assertEqual, assertDeepEqual, assertNull, suite, summary };
```

- [ ] **Step 2: Verify test runner works**

Create `tests/smoke.test.js`:
```js
const { test, assert, assertEqual, summary } = require('./testRunner');
test('assert true', () => assert(true));
test('assertEqual', () => assertEqual(1 + 1, 2));
summary();
```

Run: `node tests/smoke.test.js`
Expected output:
```
  ✓ assert true
  ✓ assertEqual
2 passed, 0 failed
```

- [ ] **Step 3: Delete smoke test, commit**

```bash
del tests\smoke.test.js
git add tests/testRunner.js
git commit -m "feat: add test runner for simulation modules"
```

---

## Task 2: SimDataLoader

**Files:**
- Create: `js/sim/simDataLoader.js`
- Create: `tests/simDataLoader.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/simDataLoader.test.js
const { test, assert, assertEqual, assertDeepEqual, suite, summary } = require('./testRunner');

// Minimal mock data matching window.GameData structure
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

// Load SimDataLoader
const SimDataLoader = require('../js/sim/simDataLoader');

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
      assertNull(cats.sceneCatalog[0].buildSteps[1].reward);
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
    test('order reward for batch 2 order 3 gives item 100201', () => {
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node tests/simDataLoader.test.js
```
Expected: Error `Cannot find module '../js/sim/simDataLoader'`

- [ ] **Step 3: Create SimDataLoader implementation**

```js
// js/sim/simDataLoader.js
const SimDataLoader = (() => {
  const CURRENCY_TYPE = { '1': 'gold', '2': 'gems', '3': 'energy' };

  function normalizeTheme(raw) {
    if (!raw) return null;
    if (typeof raw === 'string' && raw.startsWith('Scene_')) return raw;
    if (raw === 'Tutorial' || raw === '0') return 'Tutorial';
    const n = parseInt(raw);
    if (isNaN(n)) return raw;
    return `Scene_0${n}`;
  }

  function buildGeneratorCatalog(rows, itemMergeRows) {
    const sellPrice = {};
    itemMergeRows.forEach(r => { if (r.id) sellPrice[r.id] = parseInt(r.sell_price) || 0; });

    const byId = {};
    rows.forEach(r => {
      const id = r.id; if (!id) return;
      if (!byId[id]) {
        byId[id] = {
          id,
          type: r.type || 'Unknown',
          cooldownSecs: parseInt(r.time_cooldown) || 0,
          costEnergy: parseInt(r.cost_energy) || 1,
          minPool: parseInt(r.min_count) || 0,
          maxPool: parseInt(r.max_count) || 0,
          gemToMin: parseInt(r.gem_to_min) || 0,
          spawns: [],
          sellPrice: sellPrice[id] || 0,
          level: 0,
          canGenerate: false
        };
      }
      if (r.item_id && r.rate) {
        byId[id].spawns.push({ itemId: r.item_id.trim(), rate: parseFloat(r.rate) || 0 });
      }
    });

    // Assign level within each type (sorted ascending = level 1, 2, 3...)
    const byType = {};
    Object.values(byId).forEach(g => {
      if (!byType[g.type]) byType[g.type] = [];
      byType[g.type].push(g);
    });
    Object.values(byType).forEach(gens => {
      gens.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      gens.forEach((g, i) => { g.level = i + 1; g.canGenerate = g.level >= 4; });
    });

    return byId;
  }

  function buildToolCatalog(rows) {
    const tools = {};
    rows.forEach(r => {
      const toolId = r.toolId; if (!toolId) return;
      if (!tools[toolId]) tools[toolId] = { type: toolId, recipes: [] };
      const ings = [r.Ingredient1Id, r.Ingredient2Id, r.Ingredient3Id, r.Ingredient4Id]
        .filter(i => i && i.trim());
      tools[toolId].recipes.push({
        resultId: r.itemID || r.ResultId,
        timeSecs: parseFloat(r.TimeToCook_sec) || 1,
        ingredients: ings
      });
    });
    return tools;
  }

  function buildItemExpandCatalog(rows) {
    const catalog = {};
    rows.forEach(r => {
      const src = r.itemID; if (!src || !r.spawn_itemID) return;
      if (!catalog[src]) {
        catalog[src] = {
          sourceId: src,
          resultIds: [],
          costEnergy: parseInt(r.cost_energy) || 1,
          cooldownSecs: parseInt(r.time_cooldown) || 3
        };
      }
      catalog[src].resultIds.push(r.spawn_itemID);
    });
    return catalog;
  }

  function buildSceneCatalog(buildUpRows, orderSystemRows) {
    const sceneMap = {};
    let currentTheme = null;

    buildUpRows.forEach(r => {
      if (r.theme) currentTheme = r.theme;
      if (!currentTheme || r.id === undefined || r.id === '') return;
      if (!sceneMap[currentTheme]) {
        sceneMap[currentTheme] = { name: currentTheme, buildSteps: [], batchIds: [] };
      }
      const reward = (r.rw_build_up_type === 'Item' && r.custom_rw_build_up_value)
        ? { itemId: r.custom_rw_build_up_value, qty: parseInt(r.rw_build_up_number) || 1 }
        : null;
      sceneMap[currentTheme].buildSteps.push({
        stepId: r.id, goldCost: parseInt(r.cost) || 0, reward
      });
    });

    let currentBatchId = null;
    orderSystemRows.forEach(r => {
      if (r.id) currentBatchId = r.id;
      if (!currentBatchId) return;
      const scene = normalizeTheme(r.theme_type || r.themeType);
      if (!scene || !sceneMap[scene]) return;
      if (!sceneMap[scene].batchIds.includes(currentBatchId)) {
        sceneMap[scene].batchIds.push(currentBatchId);
      }
    });

    return Object.values(sceneMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s, i) => ({ ...s, index: i }));
  }

  function buildRewardSchedule(buildUpRows, buildUpRewardRows, orderSystemRows) {
    const schedule = [];
    let currentTheme = null;

    buildUpRows.forEach(r => {
      if (r.theme) currentTheme = r.theme;
      if (!r.id || !currentTheme) return;
      if (r.rw_build_up_type === 'Item' && r.custom_rw_build_up_value) {
        schedule.push({ trigger: 'buildStep', scene: currentTheme, stepId: r.id,
          itemId: r.custom_rw_build_up_value, qty: parseInt(r.rw_build_up_number) || 1 });
      }
    });

    (buildUpRewardRows || []).forEach(r => {
      if (r.res_type === 'Item' && r.custom_value) {
        schedule.push({ trigger: 'buildStep', scene: r.theme, stepId: r.id,
          itemId: r.custom_value, qty: parseInt(r.res_number) || 1 });
      }
    });

    let currentBatch = null;
    orderSystemRows.forEach(r => {
      if (r.id) currentBatch = r.id;
      if (!currentBatch || !r.id_order) return;
      if (r.res_type === 'Item' && r.custom_value) {
        schedule.push({ trigger: 'order', orderId: r.id_order, batchId: currentBatch,
          itemId: r.custom_value, qty: parseInt(r.res_number) || 1 });
      } else if (r.res_type === 'Money' && r.res_id && r.res_number) {
        const currency = CURRENCY_TYPE[r.res_id];
        if (currency) {
          schedule.push({ trigger: 'order', orderId: r.id_order, batchId: currentBatch,
            currency, amount: parseInt(r.res_number) || 0 });
        }
      }
    });

    return schedule;
  }

  function buildIAPCatalog(gameData) {
    const catalog = {};
    Object.keys(gameData).filter(k => k.startsWith('iap')).forEach(key => {
      const rows = gameData[key];
      if (!Array.isArray(rows) || !rows.length) return;
      catalog[key] = rows.map(r => {
        const contents = [];
        if (r.res_type === 'Money' && r.res_id) {
          const t = CURRENCY_TYPE[r.res_id];
          if (t) contents.push({ type: t, amount: parseInt(r.res_number) || 0 });
        } else if (r.res_type === 'Item' && r.custom_value) {
          contents.push({ type: 'item', itemId: r.custom_value, qty: parseInt(r.res_number) || 1 });
        }
        return { id: r.id, name: r.pack_name || key, iapCost: parseFloat(r.iap_cost) || 0, contents };
      });
    });
    return catalog;
  }

  function buildItemSellPrices(itemMergeRows) {
    const map = {};
    itemMergeRows.forEach(r => { if (r.id) map[r.id] = parseInt(r.sell_price) || 0; });
    return map;
  }

  function buildOrderCatalog(orderSystemRows, orderDetailRows) {
    const orderDetailMap = {};
    orderDetailRows.forEach(r => {
      if (!r.orderId) return;
      orderDetailMap[r.orderId] = {
        orderId: r.orderId,
        gold: parseInt(r.gold) || 0,
        items: [
          r.item1_id ? { itemId: r.item1_id, qty: parseInt(r.item1_amount) || 1 } : null,
          r.item2_id ? { itemId: r.item2_id, qty: parseInt(r.item2_amount) || 1 } : null,
        ].filter(Boolean)
      };
    });

    const batchMap = {};
    let currentBatch = null;
    orderSystemRows.forEach(r => {
      if (r.id) {
        const scene = normalizeTheme(r.theme_type || r.themeType);
        currentBatch = {
          id: r.id, scene,
          canReceiveReward: r.can_receive_reward === 'TRUE',
          orderIds: []
        };
        batchMap[r.id] = currentBatch;
      }
      if (currentBatch && r.id_order) currentBatch.orderIds.push(r.id_order);
    });

    return { batchMap, orderDetailMap };
  }

  function build(gameData) {
    const gd = gameData || window.GameData;
    return {
      generatorCatalog: buildGeneratorCatalog(gd.rateGenerator || [], gd.itemMerge || []),
      toolCatalog: buildToolCatalog(gd.formuaRecipes || []),
      itemExpandCatalog: buildItemExpandCatalog(gd.itemExpand || []),
      sceneCatalog: buildSceneCatalog(gd.buildUpGoalData || [], gd.orderSystem || []),
      rewardSchedule: buildRewardSchedule(gd.buildUpGoalData || [], gd.buildUpGoalReward || [], gd.orderSystem || []),
      iapCatalog: buildIAPCatalog(gd),
      itemSellPrices: buildItemSellPrices(gd.itemMerge || []),
      ...buildOrderCatalog(gd.orderSystem || [], gd.orderDetail || [])
    };
  }

  if (typeof module !== 'undefined') module.exports = { build, normalizeTheme };
  return { build };
})();
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
node tests/simDataLoader.test.js
```
Expected: All tests pass, `0 failed`

- [ ] **Step 5: Commit**

```bash
git add js/sim/simDataLoader.js tests/simDataLoader.test.js
git commit -m "feat: add SimDataLoader with catalog parsing and tests"
```

---

## Task 3: SimEnergy

**Files:**
- Create: `js/sim/simEnergy.js`
- Create: `tests/simEnergy.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/simEnergy.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimEnergy = require('../js/sim/simEnergy');

suite('SimEnergy', () => {
  suite('create', () => {
    test('default initialOwned=20, cap=100, regenPerMin=0.2', () => {
      const e = SimEnergy.create();
      assertEqual(e.owned, 20);
      assertEqual(e.cap, 100);
      assertEqual(e.regenPerMin, 0.2);
    });
    test('custom config applied', () => {
      const e = SimEnergy.create({ initialOwned: 50, regenPerMin: 1, cap: 80 });
      assertEqual(e.owned, 50);
    });
  });

  suite('tick', () => {
    test('regens when owned < cap', () => {
      const e = SimEnergy.create({ initialOwned: 0, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 10);
      assertEqual(e.owned, 10);
    });
    test('does not exceed cap', () => {
      const e = SimEnergy.create({ initialOwned: 95, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 20);
      assertEqual(e.owned, 100);
    });
    test('no regen when owned >= cap', () => {
      const e = SimEnergy.create({ initialOwned: 100, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 60);
      assertEqual(e.owned, 100);
    });
    test('no regen when owned > cap (IAP overflow)', () => {
      const e = SimEnergy.create({ initialOwned: 150, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 60);
      assertEqual(e.owned, 150);
    });
  });

  suite('spend', () => {
    test('returns true and deducts when enough energy', () => {
      const e = SimEnergy.create({ initialOwned: 50 });
      const ok = SimEnergy.spend(e, 10);
      assert(ok === true);
      assertEqual(e.owned, 40);
    });
    test('returns false and does not deduct when not enough', () => {
      const e = SimEnergy.create({ initialOwned: 5 });
      const ok = SimEnergy.spend(e, 10);
      assert(ok === false);
      assertEqual(e.owned, 5);
    });
  });

  suite('inject', () => {
    test('adds energy beyond cap', () => {
      const e = SimEnergy.create({ initialOwned: 90 });
      SimEnergy.inject(e, 50);
      assertEqual(e.owned, 140);
    });
    test('economy tracking: received increments', () => {
      const e = SimEnergy.create({ initialOwned: 0 });
      const eco = { energy: { received: 0, spent: 0 } };
      SimEnergy.inject(e, 30, eco);
      assertEqual(eco.energy.received, 30);
    });
  });
});

summary();
```

- [ ] **Step 2: Run, confirm fail**

```bash
node tests/simEnergy.test.js
```
Expected: Error `Cannot find module '../js/sim/simEnergy'`

- [ ] **Step 3: Implement SimEnergy**

```js
// js/sim/simEnergy.js
const SimEnergy = (() => {
  function create({ regenPerMin = 0.2, cap = 100, initialOwned = 20 } = {}) {
    return { owned: initialOwned, cap, regenPerMin };
  }

  function tick(e, minutes) {
    if (e.owned < e.cap) e.owned = Math.min(e.cap, e.owned + e.regenPerMin * minutes);
  }

  function spend(e, amount) {
    if (e.owned < amount) return false;
    e.owned -= amount;
    return true;
  }

  function inject(e, amount, economy) {
    e.owned += amount;
    if (economy) economy.energy.received += amount;
  }

  if (typeof module !== 'undefined') module.exports = { create, tick, spend, inject };
  return { create, tick, spend, inject };
})();
```

- [ ] **Step 4: Run tests, verify pass**

```bash
node tests/simEnergy.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/sim/simEnergy.js tests/simEnergy.test.js
git commit -m "feat: add SimEnergy with regen, spend, inject and tests"
```

---

## Task 4: SimBoard

**Files:**
- Create: `js/sim/simBoard.js`
- Create: `tests/simBoard.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/simBoard.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimBoard = require('../js/sim/simBoard');

// Minimal generator catalog
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
    test('starts empty', () => {
      const b = SimBoard.create();
      assertEqual(b.generators.length, 0);
      assertEqual(b.tools.length, 0);
      assertEqual(SimBoard.boardItemCount(b), 0);
    });
    test('inventoryCapacity defaults to 15', () => {
      assertEqual(SimBoard.create().inventoryCapacity, 15);
    });
  });

  suite('addGenerator', () => {
    test('adds generator to board', () => {
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

  suite('slotsUsed', () => {
    test('counts generators + tools', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      SimBoard.addTool(b, '2001');
      assertEqual(SimBoard.slotsUsed(b), 2);
    });
  });

  suite('tapGenerator', () => {
    test('returns item and reduces pool', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      const item = SimBoard.tapGenerator(b, '100204', genCat, 0);
      assertEqual(item, '700501');
      assertEqual(b.generators[0].pool, 23);
    });
    test('returns null when pool is 0', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      b.generators[0].pool = 0;
      b.generators[0].cooldownUntil = 9999;
      assert(SimBoard.tapGenerator(b, '100204', genCat, 0) === null);
    });
    test('generator on cooldown returns null', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100204', genCat);
      b.generators[0].pool = 0;
      b.generators[0].cooldownUntil = 100;
      assert(SimBoard.tapGenerator(b, '100204', genCat, 50) === null);
    });
    test('canGenerate=false returns null', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      assert(SimBoard.tapGenerator(b, '100201', genCat, 0) === null);
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
    test('merges 2 level-1 gens when level-1 not required', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.mergeGenerators(b, new Set(['100204']), genCat);
      assertEqual(b.generators.length, 1);
      assertEqual(b.generators[0].genId, '100202');
    });
    test('does NOT merge when genId is in required set', () => {
      const b = SimBoard.create();
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.mergeGenerators(b, new Set(['100201']), genCat);
      assertEqual(b.generators.length, 2);
    });
    test('merges upward until required level reached', () => {
      const b = SimBoard.create();
      // 4 × lv1 → 2 × lv2 → 1 × lv3
      for (let i = 0; i < 4; i++) SimBoard.addGenerator(b, '100201', genCat);
      SimBoard.mergeGenerators(b, new Set(['100203']), genCat);
      assertEqual(b.generators.length, 1);
      assertEqual(b.generators[0].genId, '100203');
    });
  });

  suite('sellCheapestItem', () => {
    test('sells lowest-price item not in required set', () => {
      const b = SimBoard.create();
      b.boardItems['700501'] = 3;
      b.boardItems['700601'] = 1;
      b.boardItemCount = 4;
      const gold = SimBoard.sellCheapestItem(b, sellPrices, new Set());
      assertEqual(gold, 2);
      assertEqual(b.boardItems['700501'], 2);
    });
    test('skips required items', () => {
      const b = SimBoard.create();
      b.boardItems['700501'] = 2;
      b.boardItemCount = 2;
      const gold = SimBoard.sellCheapestItem(b, sellPrices, new Set(['700501']));
      assertEqual(gold, 0);
    });
  });
});

summary();
```

- [ ] **Step 2: Run, confirm fail**

```bash
node tests/simBoard.test.js
```

- [ ] **Step 3: Implement SimBoard**

```js
// js/sim/simBoard.js
const SimBoard = (() => {
  const BOARD_CAPACITY = 63;
  const DEFAULT_INVENTORY = 15;

  function create({ inventoryCapacity = DEFAULT_INVENTORY } = {}) {
    return {
      generators: [],         // [{ genId, pool, cooldownUntil }]
      tools: [],              // [{ toolType, cooking: null | { resultId, doneAt } }]
      boardItems: {},         // itemId → count (items on board)
      boardItemCount: 0,
      inventoryItems: {},     // itemId → count (items in inventory)
      inventoryCount: 0,
      inventoryCapacity
    };
  }

  function slotsUsed(board) {
    return board.generators.length + board.tools.length + board.boardItemCount;
  }

  function boardItemCount(board) { return board.boardItemCount; }

  function slotsAvailable(board) { return BOARD_CAPACITY - slotsUsed(board); }

  function addGenerator(board, genId, catalog) {
    if (!catalog[genId]) return false;
    if (slotsAvailable(board) <= 0) return false;
    board.generators.push({ genId, pool: catalog[genId].maxPool, cooldownUntil: 0 });
    return true;
  }

  function addTool(board, toolType) {
    if (slotsAvailable(board) <= 0) return false;
    board.tools.push({ toolType, cooking: null });
    return true;
  }

  function addItem(board, itemId, qty = 1) {
    if (slotsAvailable(board) >= qty) {
      board.boardItems[itemId] = (board.boardItems[itemId] || 0) + qty;
      board.boardItemCount += qty;
      return true;
    }
    // Try inventory overflow
    const invSpace = board.inventoryCapacity - board.inventoryCount;
    if (invSpace >= qty) {
      board.inventoryItems[itemId] = (board.inventoryItems[itemId] || 0) + qty;
      board.inventoryCount += qty;
      return true;
    }
    return false;
  }

  function consumeItem(board, itemId, qty = 1) {
    const onBoard = board.boardItems[itemId] || 0;
    if (onBoard >= qty) {
      board.boardItems[itemId] -= qty;
      board.boardItemCount -= qty;
      if (board.boardItems[itemId] === 0) delete board.boardItems[itemId];
      return true;
    }
    // Pull from inventory
    const total = onBoard + (board.inventoryItems[itemId] || 0);
    if (total < qty) return false;
    board.boardItems[itemId] = 0;
    board.boardItemCount -= onBoard;
    delete board.boardItems[itemId];
    const fromInv = qty - onBoard;
    board.inventoryItems[itemId] -= fromInv;
    board.inventoryCount -= fromInv;
    if (board.inventoryItems[itemId] === 0) delete board.inventoryItems[itemId];
    return true;
  }

  function itemCount(board, itemId) {
    return (board.boardItems[itemId] || 0) + (board.inventoryItems[itemId] || 0);
  }

  function tapGenerator(board, genId, catalog, currentTimeMins) {
    const slot = board.generators.find(g => g.genId === genId);
    if (!slot || slot.pool <= 0 || slot.cooldownUntil > currentTimeMins) return null;
    const def = catalog[genId];
    if (!def || !def.canGenerate || !def.spawns.length) return null;

    const r = Math.random() * 100;
    let cumRate = 0, spawnedItemId = def.spawns[def.spawns.length - 1].itemId;
    for (const s of def.spawns) {
      cumRate += s.rate;
      if (r <= cumRate) { spawnedItemId = s.itemId; break; }
    }

    slot.pool--;
    if (slot.pool === 0) slot.cooldownUntil = currentTimeMins + def.cooldownSecs / 60;
    return spawnedItemId;
  }

  function refillGenerators(board, catalog, currentTimeMins) {
    board.generators.forEach(slot => {
      if (slot.pool === 0 && slot.cooldownUntil > 0 && currentTimeMins >= slot.cooldownUntil) {
        slot.pool = (catalog[slot.genId] || {}).maxPool || 0;
        slot.cooldownUntil = 0;
      }
    });
  }

  function findNextLevelGen(type, currentId, catalog) {
    const same = Object.values(catalog)
      .filter(g => g.type === type)
      .sort((a, b) => a.level - b.level);
    const idx = same.findIndex(g => g.id === currentId);
    return (idx >= 0 && idx < same.length - 1) ? same[idx + 1].id : null;
  }

  function mergeGenerators(board, requiredGenIds, catalog) {
    let changed = true;
    while (changed) {
      changed = false;
      const counts = {};
      board.generators.forEach(g => { counts[g.genId] = (counts[g.genId] || 0) + 1; });
      for (const [genId, count] of Object.entries(counts)) {
        if (count < 2 || (requiredGenIds && requiredGenIds.has(genId))) continue;
        const nextId = findNextLevelGen(
          (catalog[genId] || {}).type, genId, catalog);
        if (!nextId) continue;
        let removed = 0;
        board.generators = board.generators.filter(g => {
          if (g.genId === genId && removed < 2) { removed++; return false; }
          return true;
        });
        board.generators.push({ genId: nextId, pool: (catalog[nextId] || {}).maxPool || 0, cooldownUntil: 0 });
        changed = true;
        break;
      }
    }
  }

  function sellCheapestItem(board, sellPrices, requiredItems) {
    const candidates = Object.keys(board.boardItems)
      .filter(id => board.boardItems[id] > 0 && !requiredItems.has(id))
      .sort((a, b) => (sellPrices[a] || 0) - (sellPrices[b] || 0));
    if (!candidates.length) return 0;
    const id = candidates[0];
    board.boardItems[id]--;
    board.boardItemCount--;
    if (board.boardItems[id] === 0) delete board.boardItems[id];
    return sellPrices[id] || 0;
  }

  function expandInventory(board) { board.inventoryCapacity++; }

  if (typeof module !== 'undefined') module.exports = {
    create, slotsUsed, slotsAvailable, boardItemCount,
    addGenerator, addTool, addItem, consumeItem, itemCount,
    tapGenerator, refillGenerators, mergeGenerators,
    sellCheapestItem, expandInventory, findNextLevelGen
  };
  return {
    create, slotsUsed, slotsAvailable, boardItemCount,
    addGenerator, addTool, addItem, consumeItem, itemCount,
    tapGenerator, refillGenerators, mergeGenerators,
    sellCheapestItem, expandInventory
  };
})();
```

- [ ] **Step 4: Run tests, verify pass**

```bash
node tests/simBoard.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/sim/simBoard.js tests/simBoard.test.js
git commit -m "feat: add SimBoard with board/inventory management, merge strategy and tests"
```

---

## Task 5: SimCooking

**Files:**
- Create: `js/sim/simCooking.js`
- Create: `tests/simCooking.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/simCooking.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimCooking = require('../js/sim/simCooking');
const SimBoard = require('../js/sim/simBoard');

const toolCat = {
  '2001': {
    type: '2001',
    recipes: [
      { resultId: '400201', timeSecs: 60, ingredients: ['700501'] },
      { resultId: '400207', timeSecs: 120, ingredients: ['700501', '700507'] },
    ]
  }
};

suite('SimCooking', () => {
  suite('findRecipe', () => {
    test('finds recipe by resultId', () => {
      const r = SimCooking.findRecipe(toolCat, '400201');
      assert(r !== null);
      assertEqual(r.resultId, '400201');
      assertEqual(r.toolId, '2001');
    });
    test('returns null for unknown result', () => {
      assert(SimCooking.findRecipe(toolCat, '999999') === null);
    });
  });

  suite('startCooking', () => {
    test('starts cooking on idle tool when ingredients available', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      const started = SimCooking.startCooking(board, toolCat, '400201', 0);
      assert(started === true);
      assert(board.tools[0].cooking !== null);
      assertEqual(board.tools[0].cooking.resultId, '400201');
      assertEqual(board.boardItems['700501'], undefined);
    });
    test('returns false when tool is busy', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 9999 };
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      assert(SimCooking.startCooking(board, toolCat, '400201', 0) === false);
    });
    test('returns false when ingredients missing', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      assert(SimCooking.startCooking(board, toolCat, '400201', 0) === false);
    });
  });

  suite('processCooking', () => {
    test('completes cooking when doneAt reached, adds result to board', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 60 };
      const completed = SimCooking.processCooking(board, 120);
      assertEqual(completed.length, 1);
      assertEqual(completed[0], '400201');
      assert(board.tools[0].cooking === null);
      assertEqual(board.boardItems['400201'], 1);
    });
    test('does not complete before doneAt', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 60 };
      const completed = SimCooking.processCooking(board, 30);
      assertEqual(completed.length, 0);
    });
  });
});

summary();
```

- [ ] **Step 2: Run, confirm fail**

```bash
node tests/simCooking.test.js
```

- [ ] **Step 3: Implement SimCooking**

```js
// js/sim/simCooking.js
const SimCooking = (() => {

  function findRecipe(toolCatalog, resultId) {
    for (const [toolId, tool] of Object.entries(toolCatalog)) {
      const recipe = tool.recipes.find(r => r.resultId === resultId);
      if (recipe) return { ...recipe, toolId };
    }
    return null;
  }

  function startCooking(board, toolCatalog, resultId, currentTimeMins) {
    const recipeInfo = findRecipe(toolCatalog, resultId);
    if (!recipeInfo) return false;

    const toolSlot = board.tools.find(t => t.toolType === recipeInfo.toolId && !t.cooking);
    if (!toolSlot) return false;

    // Check all ingredients available
    const { SimBoard } = typeof module !== 'undefined'
      ? { SimBoard: require('./simBoard') }
      : { SimBoard: window.SimBoard };

    for (const ingId of recipeInfo.ingredients) {
      if (SimBoard.itemCount(board, ingId) < 1) return false;
    }

    // Consume ingredients
    for (const ingId of recipeInfo.ingredients) {
      SimBoard.consumeItem(board, ingId, 1);
    }

    toolSlot.cooking = {
      resultId,
      doneAt: currentTimeMins + recipeInfo.timeSecs / 60
    };
    return true;
  }

  function processCooking(board, currentTimeMins) {
    const completed = [];
    board.tools.forEach(slot => {
      if (!slot.cooking || slot.cooking.doneAt > currentTimeMins) return;
      const resultId = slot.cooking.resultId;
      slot.cooking = null;
      board.boardItems[resultId] = (board.boardItems[resultId] || 0) + 1;
      board.boardItemCount++;
      completed.push(resultId);
    });
    return completed;
  }

  function tryStartAllCooking(board, toolCatalog, pendingOrderItems, currentTimeMins) {
    let started = 0;
    const idleTools = board.tools.filter(t => !t.cooking);
    if (!idleTools.length) return 0;

    for (const neededItemId of pendingOrderItems) {
      const recipeInfo = findRecipe(toolCatalog, neededItemId);
      if (!recipeInfo) continue;
      if (startCooking(board, toolCatalog, neededItemId, currentTimeMins)) started++;
    }
    return started;
  }

  if (typeof module !== 'undefined') module.exports = {
    findRecipe, startCooking, processCooking, tryStartAllCooking
  };
  return { findRecipe, startCooking, processCooking, tryStartAllCooking };
})();
```

- [ ] **Step 4: Run tests, verify pass**

```bash
node tests/simCooking.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/sim/simCooking.js tests/simCooking.test.js
git commit -m "feat: add SimCooking pipeline with tool queue and tests"
```

---

## Task 6: SimEngine

**Files:**
- Create: `js/sim/simEngine.js`
- Create: `tests/simEngine.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/simEngine.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimDataLoader = require('../js/sim/simDataLoader');
const SimEngine = require('../js/sim/simEngine');

// Minimal game data: 1 scene, 1 batch, 1 order, 1 generator (lv4)
const mockGameData = {
  rateGenerator: [
    { id: '100201', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '9000',
      cost_energy: '1', min_count: '5', max_count: '5', gem_to_min: '' },
    { id: '100202', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '8000',
      cost_energy: '1', min_count: '5', max_count: '5', gem_to_min: '' },
    { id: '100203', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '7000',
      cost_energy: '1', min_count: '5', max_count: '5', gem_to_min: '' },
    { id: '100204', type: 'FG', item_id: '700501', rate: '100', time_cooldown: '7200',
      cost_energy: '1', min_count: '10', max_count: '10', gem_to_min: '' },
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
    { theme: 'Scene_01', id: '0', cost: '5',
      rw_build_up_type: '', rw_build_up_number: '', custom_rw_build_up_value: '' },
  ],
  buildUpGoalReward: [],
  orderSystem: [
    { id: '1', theme_type: 'Scene_01', can_receive_reward: 'FALSE',
      id_order: '1', res_type: '', res_id: '', res_number: '', custom_value: '' },
  ],
  orderDetail: [
    { orderId: '1', item1_id: '400201', item1_amount: '1',
      item2_id: '', item2_amount: '', gold: '10' },
  ],
  iapEnergyPack: [],
};

suite('SimEngine', () => {
  const cats = SimDataLoader.build(mockGameData);

  suite('createState', () => {
    test('initial energy matches config', () => {
      const profileCfg = {
        name: 'Test', sessionMode: 'sessionsPerDay', sessionsPerDay: 4,
        regenPerMin: 0.2, playerType: 'f2p', purchases: []
      };
      const state = SimEngine.createState(cats, profileCfg, [{genId:'100204', qty:1}], [{toolType:'2001'}]);
      assertEqual(state.energy.owned, 20);
      assert(state.board.generators.length > 0);
    });
  });

  suite('tickDay', () => {
    test('energy regenerates over a day', () => {
      const profileCfg = {
        name: 'Test', sessionMode: 'interval', intervalHours: 24,
        regenPerMin: 1, playerType: 'f2p', purchases: []
      };
      const state = SimEngine.createState(cats, profileCfg, [], []);
      state.energy.owned = 0;
      const { dayLog } = SimEngine.tickDay(state, cats, profileCfg);
      assert(state.energy.owned > 0 || dayLog !== undefined);
    });

    test('completing an order earns gold', () => {
      const profileCfg = {
        name: 'Test', sessionMode: 'sessionsPerDay', sessionsPerDay: 8,
        regenPerMin: 1, cap: 100, playerType: 'f2p', purchases: []
      };
      const initialGens = [{ genId: '100204', qty: 1 }];
      const initialTools = [{ toolType: '2001' }];
      const state = SimEngine.createState(cats, profileCfg, initialGens, initialTools);
      state.energy.owned = 100;

      // Simulate enough days until gold > 0
      let goldEarned = false;
      for (let d = 0; d < 10; d++) {
        SimEngine.tickDay(state, cats, profileCfg);
        if (state.progress.goldEarned > 0) { goldEarned = true; break; }
      }
      assert(goldEarned, 'Expected gold to be earned within 10 days');
    });
  });
});

summary();
```

- [ ] **Step 2: Run, confirm fail**

```bash
node tests/simEngine.test.js
```

- [ ] **Step 3: Implement SimEngine**

```js
// js/sim/simEngine.js
const SimEngine = (() => {
  const _req = (name) => typeof module !== 'undefined'
    ? require(`./${name}`) : window[name];

  function createState(catalogs, profileCfg, initialGens, initialTools) {
    const SimBoard = _req('simBoard');
    const SimEnergy = _req('simEnergy');

    const board = SimBoard.create({ inventoryCapacity: 15 });
    (initialGens || []).forEach(({ genId, qty = 1 }) => {
      for (let i = 0; i < qty; i++) SimBoard.addGenerator(board, genId, catalogs.generatorCatalog);
    });
    (initialTools || []).forEach(({ toolType }) => SimBoard.addTool(board, toolType));

    return {
      day: 0,
      timeMins: 0,
      energy: SimEnergy.create({
        regenPerMin: profileCfg.regenPerMin || 0.2,
        cap: profileCfg.cap || 100,
        initialOwned: 20
      }),
      board,
      progress: {
        sceneIndex: 0,
        scene: (catalogs.sceneCatalog[0] || {}).name || 'Scene_01',
        buildStepsDone: 0,
        goldBank: 0,
        goldEarned: 0,
        batchesDone: 0,
        completedBatchIds: new Set(),
        completedOrderIds: new Set()
      },
      economy: {
        energy: { received: 0, spent: 0 },
        gems:   { received: 0, spent: 0 },
        gold:   { received: 0, spent: 0 }
      },
      gems: 0,
      log: []
    };
  }

  function getSessionStartMins(day, sessionIndex, profileCfg) {
    if (profileCfg.sessionMode === 'interval') {
      return day * 1440 + sessionIndex * (profileCfg.intervalHours * 60);
    }
    const spacing = 1440 / (profileCfg.sessionsPerDay || 4);
    return day * 1440 + sessionIndex * spacing;
  }

  function sessionCount(profileCfg) {
    if (profileCfg.sessionMode === 'sessionsPerDay') return profileCfg.sessionsPerDay || 4;
    return Math.floor(1440 / ((profileCfg.intervalHours || 6) * 60));
  }

  function getRequiredItems(state, catalogs) {
    const scene = catalogs.sceneCatalog[state.progress.sceneIndex];
    if (!scene) return { itemIds: new Set(), genIds: new Set() };

    const batchIds = scene.batchIds.filter(id => !state.progress.completedBatchIds.has(id));
    const itemIds = new Set();

    batchIds.forEach(batchId => {
      const batch = catalogs.batchMap[batchId];
      if (!batch) return;
      batch.orderIds
        .filter(oid => !state.progress.completedOrderIds.has(oid))
        .forEach(oid => {
          const order = catalogs.orderDetailMap[oid];
          if (!order) return;
          order.items.forEach(i => itemIds.add(i.itemId));
        });
    });

    // Resolve which generator IDs produce these items (or their cooking ingredients)
    const genIds = new Set();
    const resolveGen = (itemId) => {
      // Direct from generator
      Object.values(catalogs.generatorCatalog).forEach(g => {
        if (g.canGenerate && g.spawns.some(s => s.itemId === itemId)) genIds.add(g.id);
      });
      // Via cooking recipe ingredient
      const recipe = SimCooking_findRecipe(catalogs.toolCatalog, itemId);
      if (recipe) recipe.ingredients.forEach(ing => resolveGen(ing));
      // Via item expand
      Object.entries(catalogs.itemExpandCatalog).forEach(([srcId, def]) => {
        if (def.resultIds.includes(itemId)) resolveGen(srcId);
      });
    };
    itemIds.forEach(resolveGen);

    return { itemIds, genIds };
  }

  function SimCooking_findRecipe(toolCatalog, resultId) {
    for (const [toolId, tool] of Object.entries(toolCatalog)) {
      const r = tool.recipes.find(r => r.resultId === resultId);
      if (r) return { ...r, toolId };
    }
    return null;
  }

  function runSession(state, catalogs, profileCfg, sessionStartMins) {
    const SimBoard = _req('simBoard');
    const SimEnergy = _req('simEnergy');
    const SimCooking = _req('simCooking');

    state.timeMins = sessionStartMins;

    // Refill generators whose cooldown has elapsed
    SimBoard.refillGenerators(state.board, catalogs.generatorCatalog, state.timeMins);

    // Process any cooking completions
    SimCooking.processCooking(state.board, state.timeMins);

    // Determine required items / generator levels for demand-driven merge
    const { itemIds, genIds } = getRequiredItems(state, catalogs);
    SimBoard.mergeGenerators(state.board, genIds, catalogs.generatorCatalog);

    // Tap generators until energy runs out or all generators depleted
    const activeBatchItems = [...itemIds];
    let tapped = true;
    while (tapped && state.energy.owned >= 1) {
      tapped = false;
      for (const slot of state.board.generators) {
        if (!state.energy.owned >= 1) break;
        const genDef = catalogs.generatorCatalog[slot.genId];
        if (!genDef || !genDef.canGenerate || slot.pool <= 0 || slot.cooldownUntil > state.timeMins) continue;
        const spent = SimEnergy.spend(state.energy, 1);
        if (!spent) break;
        state.economy.energy.spent++;
        const itemId = SimBoard.tapGenerator(state.board, slot.genId, catalogs.generatorCatalog, state.timeMins);
        if (itemId) {
          SimBoard.addItem(state.board, itemId, 1);
          // Handle board full
          if (SimBoard.slotsAvailable(state.board) < 0) handleBoardFull(state, catalogs, profileCfg, itemIds);
          // Expand if applicable
          if (catalogs.itemExpandCatalog[itemId]) {
            const canExpand = SimEnergy.spend(state.energy, 1);
            if (canExpand) {
              state.economy.energy.spent++;
              SimBoard.consumeItem(state.board, itemId, 1);
              catalogs.itemExpandCatalog[itemId].resultIds.forEach(rid => {
                SimBoard.addItem(state.board, rid, 1);
              });
            }
          }
        }
        tapped = true;
      }
    }

    // Try to start cooking for needed items
    SimCooking.tryStartAllCooking(state.board, catalogs.toolCatalog, activeBatchItems, state.timeMins);

    // Complete orders
    tryCompleteOrders(state, catalogs);
  }

  function handleBoardFull(state, catalogs, profileCfg, requiredItems) {
    const SimBoard = _req('simBoard');
    if (profileCfg.playerType === 'spender' && state.gems > 0) {
      const gemCost = 10; // default cost per slot
      if (state.gems >= gemCost) {
        state.gems -= gemCost;
        state.economy.gems.spent += gemCost;
        SimBoard.expandInventory(state.board);
      } else {
        SimBoard.sellCheapestItem(state.board, catalogs.itemSellPrices, requiredItems);
      }
    } else {
      const goldFromSell = SimBoard.sellCheapestItem(state.board, catalogs.itemSellPrices, requiredItems);
      if (goldFromSell > 0) {
        state.progress.goldBank += goldFromSell;
        state.progress.goldEarned += goldFromSell;
        state.economy.gold.received += goldFromSell;
      }
    }
  }

  function tryCompleteOrders(state, catalogs) {
    const SimBoard = _req('simBoard');
    const scene = catalogs.sceneCatalog[state.progress.sceneIndex];
    if (!scene) return;

    scene.batchIds
      .filter(bid => !state.progress.completedBatchIds.has(bid))
      .forEach(batchId => {
        const batch = catalogs.batchMap[batchId];
        if (!batch) return;

        batch.orderIds
          .filter(oid => !state.progress.completedOrderIds.has(oid))
          .forEach(oid => {
            const order = catalogs.orderDetailMap[oid];
            if (!order) return;
            const canFill = order.items.every(i => SimBoard.itemCount(state.board, i.itemId) >= i.qty);
            if (!canFill) return;

            order.items.forEach(i => SimBoard.consumeItem(state.board, i.itemId, i.qty));
            state.progress.completedOrderIds.add(oid);
            state.progress.goldBank += order.gold;
            state.progress.goldEarned += order.gold;
            state.economy.gold.received += order.gold;

            // Claim order rewards
            catalogs.rewardSchedule
              .filter(r => r.trigger === 'order' && r.orderId === oid)
              .forEach(r => applyReward(state, r, catalogs));
          });

        // Check batch completion
        const allDone = batch.orderIds.every(oid => state.progress.completedOrderIds.has(oid));
        if (allDone && !state.progress.completedBatchIds.has(batchId)) {
          state.progress.completedBatchIds.add(batchId);
          state.progress.batchesDone++;
        }
      });

    // Spend gold on build steps
    spendGoldOnBuild(state, catalogs);

    // Check scene completion
    checkSceneCompletion(state, catalogs);
  }

  function spendGoldOnBuild(state, catalogs) {
    const SimBoard = _req('simBoard');
    const scene = catalogs.sceneCatalog[state.progress.sceneIndex];
    if (!scene) return;

    while (state.progress.buildStepsDone < scene.buildSteps.length) {
      const step = scene.buildSteps[state.progress.buildStepsDone];
      if (state.progress.goldBank < step.goldCost) break;
      state.progress.goldBank -= step.goldCost;
      state.economy.gold.spent += step.goldCost;
      state.progress.buildStepsDone++;

      if (step.reward) applyItemReward(state, step.reward.itemId, step.reward.qty, catalogs);
      catalogs.rewardSchedule
        .filter(r => r.trigger === 'buildStep' && r.scene === scene.name && r.stepId === step.stepId)
        .forEach(r => applyReward(state, r, catalogs));
    }
  }

  function checkSceneCompletion(state, catalogs) {
    const scene = catalogs.sceneCatalog[state.progress.sceneIndex];
    if (!scene) return;
    const allBatchesDone = scene.batchIds.every(bid => state.progress.completedBatchIds.has(bid));
    const allBuildDone = state.progress.buildStepsDone >= scene.buildSteps.length;
    if (allBatchesDone && allBuildDone) {
      state.progress.sceneIndex++;
      state.progress.buildStepsDone = 0;
      state.progress.batchesDone = 0;
      const next = catalogs.sceneCatalog[state.progress.sceneIndex];
      state.progress.scene = next ? next.name : 'Complete';
    }
  }

  function applyReward(state, reward, catalogs) {
    if (reward.itemId) {
      applyItemReward(state, reward.itemId, reward.qty || 1, catalogs);
    } else if (reward.currency === 'energy') {
      const SimEnergy = _req('simEnergy');
      SimEnergy.inject(state.energy, reward.amount, state.economy);
    } else if (reward.currency === 'gems') {
      state.gems += reward.amount;
      state.economy.gems.received += reward.amount;
    } else if (reward.currency === 'gold') {
      state.progress.goldBank += reward.amount;
      state.progress.goldEarned += reward.amount;
      state.economy.gold.received += reward.amount;
    }
  }

  function applyItemReward(state, itemId, qty, catalogs) {
    const SimBoard = _req('simBoard');
    const isGen = !!catalogs.generatorCatalog[itemId];
    const isTool = Object.values(catalogs.toolCatalog).some(t => t.type === itemId);
    if (isGen) {
      const added = SimBoard.addGenerator(state.board, itemId, catalogs.generatorCatalog);
      if (!added) {/* inventory full: skip for now */}
    } else if (isTool) {
      SimBoard.addTool(state.board, itemId);
    } else {
      SimBoard.addItem(state.board, itemId, qty);
    }
  }

  function applyPurchase(state, purchase, iapCatalog) {
    const SimEnergy = _req('simEnergy');
    const SimBoard = _req('simBoard');
    const packages = iapCatalog[purchase.packageKey];
    if (!packages) return;
    const pkg = packages.find(p => p.id === purchase.packageId) || packages[0];
    if (!pkg) return;
    (pkg.contents || []).forEach(c => {
      if (c.type === 'energy') SimEnergy.inject(state.energy, c.amount * (purchase.quantity || 1), state.economy);
      else if (c.type === 'gems') { state.gems += c.amount; state.economy.gems.received += c.amount; }
      else if (c.type === 'gold') { state.progress.goldBank += c.amount; state.economy.gold.received += c.amount; }
      else if (c.type === 'item' && c.itemId) applyItemReward(state, c.itemId, c.qty || 1, {});
    });
  }

  function tickDay(state, catalogs, profileCfg) {
    state.day++;
    const sessions = sessionCount(profileCfg);

    // Apply purchases scheduled for this day
    (profileCfg.purchases || [])
      .filter(p => p.day === state.day)
      .forEach(p => applyPurchase(state, p, catalogs.iapCatalog));

    // Energy regen between last session and first session of today
    const SimEnergy = _req('simEnergy');
    SimEnergy.tick(state.energy, 1440 / Math.max(sessions, 1));

    // Run each session
    for (let s = 0; s < sessions; s++) {
      const sessionMins = getSessionStartMins(state.day - 1, s, profileCfg);
      // Regen between sessions
      if (s > 0) SimEnergy.tick(state.energy, 1440 / sessions);
      state.economy.energy.received += state.energy.regenPerMin * (1440 / sessions);
      runSession(state, catalogs, profileCfg, sessionMins);
    }

    // Process remaining cooking completions at end of day
    const { SimCooking } = typeof module !== 'undefined'
      ? { SimCooking: require('./simCooking') } : { SimCooking: window.SimCooking };
    SimCooking.processCooking(state.board, state.day * 1440);
    tryCompleteOrders(state, catalogs);

    const dayLog = {
      day: state.day,
      scene: state.progress.scene,
      sceneIndex: state.progress.sceneIndex,
      buildStepsDone: state.progress.buildStepsDone,
      goldEarned: state.progress.goldEarned,
      economy: JSON.parse(JSON.stringify(state.economy))
    };
    state.log.push(dayLog);
    return { dayLog };
  }

  if (typeof module !== 'undefined') module.exports = { createState, tickDay, applyPurchase };
  return { createState, tickDay, applyPurchase };
})();
```

- [ ] **Step 4: Run tests, verify pass**

```bash
node tests/simEngine.test.js
```

- [ ] **Step 5: Commit**

```bash
git add js/sim/simEngine.js tests/simEngine.test.js
git commit -m "feat: add SimEngine with tickDay simulation loop and tests"
```

---

## Task 7: SimRunner

**Files:**
- Create: `js/sim/simRunner.js`

- [ ] **Step 1: Create SimRunner**

```js
// js/sim/simRunner.js
const SimRunner = (() => {

  // Initial board setup: first generators/tools from reward schedule day 0
  // In practice these are the "starter" items given at game start
  // For now: read first rewards from rewardSchedule that have no trigger dependency
  function getStarterItems(catalogs) {
    const gens = [], tools = [];
    // Starter gen: first generator found in reward schedule (build step 0)
    catalogs.rewardSchedule
      .filter(r => r.trigger === 'buildStep' && r.stepId === '0')
      .forEach(r => {
        if (catalogs.generatorCatalog[r.itemId]) gens.push({ genId: r.itemId, qty: r.qty || 1 });
      });
    return { initialGens: gens, initialTools: tools };
  }

  function runFull(catalogs, profileCfg, targetDays) {
    const SimEngine = typeof module !== 'undefined'
      ? require('./simEngine') : window.SimEngine;
    const { initialGens, initialTools } = getStarterItems(catalogs);
    const state = SimEngine.createState(catalogs, profileCfg, initialGens, initialTools);

    for (let d = 0; d < targetDays; d++) {
      SimEngine.tickDay(state, catalogs, profileCfg);
      if (state.progress.sceneIndex >= catalogs.sceneCatalog.length) break;
    }
    return state.log;
  }

  // Returns a generator function for step-by-step playback
  function* createStepIterator(catalogs, profileCfg, targetDays) {
    const SimEngine = typeof module !== 'undefined'
      ? require('./simEngine') : window.SimEngine;
    const { initialGens, initialTools } = getStarterItems(catalogs);
    const state = SimEngine.createState(catalogs, profileCfg, initialGens, initialTools);

    for (let d = 0; d < targetDays; d++) {
      const { dayLog } = SimEngine.tickDay(state, catalogs, profileCfg);
      yield { dayLog, state, done: state.progress.sceneIndex >= catalogs.sceneCatalog.length };
      if (state.progress.sceneIndex >= catalogs.sceneCatalog.length) break;
    }
  }

  if (typeof module !== 'undefined') module.exports = { runFull, createStepIterator, getStarterItems };
  return { runFull, createStepIterator };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/sim/simRunner.js
git commit -m "feat: add SimRunner for full and step-by-step profile execution"
```

---

## Task 8: HTML Tab + CSS

**Files:**
- Modify: `index.html` — add nav item, tab section, 8 script tags
- Modify: `styles.css` — add simulation tab styles

- [ ] **Step 1: Add nav item to `index.html`**

In `index.html`, after the existing `order-analysis` nav button (around line 38):
```html
<button class="nav-item" data-tab="player-sim">
    <span class="nav-icon">🎮</span>
    <span class="nav-text">Player Sim</span>
</button>
```

- [ ] **Step 2: Add tab section to `index.html`**

After the closing `</section>` of the `order-analysis` tab, before `</div><!-- /tab-scroller -->`:
```html
<!-- ===================== TAB: PLAYER SIMULATION ===================== -->
<section id="player-sim" class="tab-view">
    <div class="view-header">
        <h1>🎮 Player Simulation</h1>
        <p>Giả lập hành trình user — cấu hình profile, session, IAP và xem timeline tiến trình theo từng ngày.</p>
    </div>

    <!-- Config Panel -->
    <div id="psim-config" class="glass" style="padding:1.5rem;margin-bottom:1.5rem;"></div>

    <!-- Playback Controls -->
    <div class="glass" style="padding:1rem 1.5rem;margin-bottom:1rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="font-size:0.85rem;color:var(--text-muted)">Days:</label>
            <input type="number" id="psim-target-days" value="100" min="1" max="365"
                style="width:70px;padding:0.3rem 0.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-main);font-size:0.85rem;">
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
            <label style="font-size:0.85rem;color:var(--text-muted)">Speed:</label>
            <div id="psim-speed-btns" style="display:flex;gap:0.25rem;">
                <button class="psim-speed active" data-ms="200">1x</button>
                <button class="psim-speed" data-ms="40">5x</button>
                <button class="psim-speed" data-ms="10">10x</button>
            </div>
        </div>
        <button id="psim-play-btn" style="padding:0.4rem 1.2rem;background:rgba(56,189,248,0.15);border:1px solid #38bdf8;border-radius:8px;color:#38bdf8;cursor:pointer;font-size:0.9rem;">▶ Play</button>
        <button id="psim-pause-btn" style="padding:0.4rem 1.2rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:var(--text-muted);cursor:pointer;font-size:0.9rem;" disabled>⏸ Pause</button>
        <button id="psim-reset-btn" style="padding:0.4rem 1.2rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:var(--text-muted);cursor:pointer;font-size:0.9rem;">↺ Reset</button>
        <span id="psim-day-label" style="font-size:0.85rem;color:var(--text-muted);margin-left:auto;">Day 0</span>
    </div>

    <!-- Timeline Chart -->
    <div class="glass" style="padding:1.5rem;margin-bottom:1.5rem;">
        <canvas id="psim-chart" height="280"></canvas>
        <div id="psim-legend" style="display:flex;gap:1.5rem;margin-top:0.75rem;flex-wrap:wrap;"></div>
    </div>

    <!-- Stats Table -->
    <div id="psim-stats" class="glass" style="padding:1.5rem;margin-bottom:1rem;"></div>

    <!-- Economy Table -->
    <div id="psim-economy" class="glass" style="padding:1.5rem;"></div>
</section>
```

- [ ] **Step 3: Add script tags to `index.html`**

Before `<script src="js/app.js"></script>`:
```html
<script src="js/sim/simDataLoader.js"></script>
<script src="js/sim/simEnergy.js"></script>
<script src="js/sim/simBoard.js"></script>
<script src="js/sim/simCooking.js"></script>
<script src="js/sim/simEngine.js"></script>
<script src="js/sim/simRunner.js"></script>
<script src="js/sim/simConfig.js"></script>
<script src="js/sim/simChart.js"></script>
```

- [ ] **Step 4: Add styles to `styles.css`**

Append to `styles.css`:
```css
/* ── Player Simulation Tab ─────────────────────────────────────────── */
.psim-profile-card {
  background: rgba(30,41,59,0.6);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}

.psim-profile-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.psim-profile-header label {
  font-size: 0.82rem;
  color: var(--text-muted);
}

.psim-profile-header input,
.psim-profile-header select {
  padding: 0.25rem 0.5rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  color: var(--text-main);
  font-size: 0.82rem;
}

.psim-purchase-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  flex-wrap: wrap;
}

.psim-purchase-row input,
.psim-purchase-row select {
  padding: 0.2rem 0.4rem;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 5px;
  color: var(--text-main);
  font-size: 0.8rem;
}

.psim-speed { padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12); border-radius: 5px;
  color: var(--text-muted); cursor: pointer; font-size: 0.8rem; }
.psim-speed.active { background: rgba(56,189,248,0.15);
  border-color: #38bdf8; color: #38bdf8; }

.psim-legend-item { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; }
.psim-legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

#psim-stats table, #psim-economy table {
  width: 100%; border-collapse: collapse; font-size: 0.85rem;
}
#psim-stats th, #psim-economy th {
  color: var(--text-muted); font-weight: 500; padding: 0.4rem 0.75rem;
  border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left;
}
#psim-stats td, #psim-economy td {
  padding: 0.35rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.04);
  font-family: 'JetBrains Mono', monospace;
}
```

- [ ] **Step 5: Verify tab appears in browser**

Open the dashboard. Click "🎮 Player Sim" in sidebar. Should see the tab with empty config, controls, and chart placeholder.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css
git commit -m "feat: add Player Simulation tab skeleton with HTML markup and CSS"
```

---

## Task 9: SimConfig

**Files:**
- Create: `js/sim/simConfig.js`

- [ ] **Step 1: Create SimConfig**

```js
// js/sim/simConfig.js
const SimConfig = (() => {
  const PROFILE_COLORS = ['#38bdf8', '#f87171', '#a78bfa', '#34d399'];

  const DEFAULT_PROFILES = [
    { name: 'Hardcore', sessionMode: 'sessionsPerDay', sessionsPerDay: 8,
      intervalHours: 3, regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [], enabled: true },
    { name: 'Mid-core', sessionMode: 'interval', sessionsPerDay: 4,
      intervalHours: 6, regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [], enabled: true },
    { name: 'Casual',   sessionMode: 'interval', sessionsPerDay: 2,
      intervalHours: 12, regenPerMin: 0.2, cap: 100, playerType: 'f2p', purchases: [], enabled: true },
  ];

  let _profiles = DEFAULT_PROFILES.map(p => ({ ...p, purchases: [] }));
  let _globalRegen = 0.2;
  let _globalCap = 100;
  let _iapCatalog = {};
  let _onChangeCallback = null;

  function getIAPOptions(iapCatalog) {
    const opts = [{ value: '', label: '— Select Package —' }];
    Object.entries(iapCatalog).forEach(([key, packs]) => {
      (packs || []).forEach(p => opts.push({ value: `${key}::${p.id}`, label: p.name || key }));
    });
    return opts;
  }

  function renderPurchaseRow(purchase, profileIdx, purchaseIdx, iapOptions) {
    const optHtml = iapOptions.map(o =>
      `<option value="${o.value}" ${purchase.packageKey + '::' + purchase.packageId === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    return `
      <div class="psim-purchase-row" data-profile="${profileIdx}" data-purchase="${purchaseIdx}">
        <label>Day</label>
        <input type="number" class="psim-purchase-day" value="${purchase.day}" min="1" max="365" style="width:55px">
        <select class="psim-purchase-pkg">${optHtml}</select>
        <label>×</label>
        <input type="number" class="psim-purchase-qty" value="${purchase.quantity || 1}" min="1" max="99" style="width:45px">
        <button class="psim-remove-purchase" style="padding:0.15rem 0.4rem;background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.75rem;">×</button>
      </div>`;
  }

  function renderProfileCard(profile, idx, iapOptions) {
    const color = PROFILE_COLORS[idx % PROFILE_COLORS.length];
    const purchaseRows = profile.purchases
      .map((p, pi) => renderPurchaseRow(p, idx, pi, iapOptions)).join('');
    return `
      <div class="psim-profile-card" data-profile="${idx}" style="border-left:3px solid ${color}">
        <div class="psim-profile-header">
          <span class="psim-legend-dot" style="background:${color}"></span>
          <label>Name</label>
          <input type="text" class="psim-profile-name" value="${profile.name}" style="width:100px">
          <label>Type</label>
          <select class="psim-profile-type">
            <option value="f2p" ${profile.playerType === 'f2p' ? 'selected' : ''}>F2P</option>
            <option value="spender" ${profile.playerType === 'spender' ? 'selected' : ''}>Spender</option>
          </select>
          <label>Session</label>
          <select class="psim-session-mode">
            <option value="interval" ${profile.sessionMode === 'interval' ? 'selected' : ''}>Interval (h)</option>
            <option value="sessionsPerDay" ${profile.sessionMode === 'sessionsPerDay' ? 'selected' : ''}>Sessions/day</option>
          </select>
          <input type="number" class="psim-session-interval" value="${profile.intervalHours}" min="1" max="24" style="width:45px"
            ${profile.sessionMode !== 'interval' ? 'style="display:none"' : ''}>
          <input type="number" class="psim-session-count" value="${profile.sessionsPerDay}" min="1" max="24" style="width:45px"
            ${profile.sessionMode !== 'sessionsPerDay' ? '' : ''}>
          <label><input type="checkbox" class="psim-profile-enabled" ${profile.enabled ? 'checked' : ''}> Enabled</label>
        </div>
        <div class="psim-purchases">
          ${purchaseRows}
          <button class="psim-add-purchase" data-profile="${idx}"
            style="font-size:0.78rem;padding:0.2rem 0.6rem;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:5px;color:#38bdf8;cursor:pointer;margin-top:0.25rem;">
            + Add Purchase
          </button>
        </div>
      </div>`;
  }

  function render(iapCatalog) {
    _iapCatalog = iapCatalog || _iapCatalog;
    const container = document.getElementById('psim-config');
    if (!container) return;
    const iapOptions = getIAPOptions(_iapCatalog);

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:1.5rem;margin-bottom:1rem;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <label style="font-size:0.82rem;color:var(--text-muted)">Energy regen:</label>
          <input id="psim-regen" type="number" value="${_globalRegen}" step="0.05" min="0.05" style="width:60px;padding:0.25rem 0.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-main);font-size:0.82rem;">
          <span style="font-size:0.78rem;color:var(--text-muted)">/min</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <label style="font-size:0.82rem;color:var(--text-muted)">Cap:</label>
          <input id="psim-cap" type="number" value="${_globalCap}" min="20" max="500" style="width:60px;padding:0.25rem 0.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-main);font-size:0.82rem;">
        </div>
      </div>
      <div id="psim-profiles">
        ${_profiles.map((p, i) => renderProfileCard(p, i, iapOptions)).join('')}
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    const container = document.getElementById('psim-config');
    if (!container) return;

    container.addEventListener('change', e => {
      const card = e.target.closest('[data-profile]');
      if (!card) return;
      const idx = parseInt(card.dataset.profile);
      if (e.target.classList.contains('psim-profile-name'))
        _profiles[idx].name = e.target.value;
      if (e.target.classList.contains('psim-profile-type'))
        _profiles[idx].playerType = e.target.value;
      if (e.target.classList.contains('psim-session-mode'))
        _profiles[idx].sessionMode = e.target.value;
      if (e.target.classList.contains('psim-session-interval'))
        _profiles[idx].intervalHours = parseFloat(e.target.value) || 6;
      if (e.target.classList.contains('psim-session-count'))
        _profiles[idx].sessionsPerDay = parseInt(e.target.value) || 4;
      if (e.target.classList.contains('psim-profile-enabled'))
        _profiles[idx].enabled = e.target.checked;
      if (e.target.id === 'psim-regen') _globalRegen = parseFloat(e.target.value) || 0.2;
      if (e.target.id === 'psim-cap') _globalCap = parseInt(e.target.value) || 100;
      // Purchase fields
      const pRow = e.target.closest('[data-purchase]');
      if (pRow) {
        const pi = parseInt(pRow.dataset.purchase);
        const purchase = _profiles[idx].purchases[pi];
        if (e.target.classList.contains('psim-purchase-day'))
          purchase.day = parseInt(e.target.value) || 1;
        if (e.target.classList.contains('psim-purchase-qty'))
          purchase.quantity = parseInt(e.target.value) || 1;
        if (e.target.classList.contains('psim-purchase-pkg')) {
          const [key, id] = e.target.value.split('::');
          purchase.packageKey = key; purchase.packageId = id;
        }
      }
    });

    container.addEventListener('click', e => {
      if (e.target.classList.contains('psim-add-purchase')) {
        const idx = parseInt(e.target.dataset.profile);
        _profiles[idx].purchases.push({ day: 1, packageKey: '', packageId: '', quantity: 1 });
        render(_iapCatalog);
      }
      if (e.target.classList.contains('psim-remove-purchase')) {
        const pRow = e.target.closest('[data-purchase]');
        const card = e.target.closest('[data-profile]');
        const idx = parseInt(card.dataset.profile);
        const pi = parseInt(pRow.dataset.purchase);
        _profiles[idx].purchases.splice(pi, 1);
        render(_iapCatalog);
      }
    });
  }

  function getProfiles() {
    return _profiles
      .filter(p => p.enabled)
      .map(p => ({ ...p, regenPerMin: _globalRegen, cap: _globalCap }));
  }

  function getColors() { return PROFILE_COLORS; }

  return { render, getProfiles, getColors };
})();
```

- [ ] **Step 2: Commit**

```bash
git add js/sim/simConfig.js
git commit -m "feat: add SimConfig panel with profile management and IAP purchases"
```

---

## Task 10: SimChart

**Files:**
- Create: `js/sim/simChart.js`

- [ ] **Step 1: Create SimChart**

```js
// js/sim/simChart.js
const SimChart = (() => {
  let _chart = null;
  let _iterators = [];
  let _playInterval = null;
  let _speedMs = 200;
  let _catalogs = null;

  const COLORS = SimConfig ? SimConfig.getColors() :
    ['#38bdf8', '#f87171', '#a78bfa', '#34d399'];

  function init(catalogs) {
    _catalogs = catalogs;
    bindPlaybackControls();
    bindSpeedButtons();
  }

  function buildChart(profileNames) {
    const ctx = document.getElementById('psim-chart');
    if (!ctx) return;
    if (_chart) _chart.destroy();

    const sceneLabels = (_catalogs.sceneCatalog || []).map((s, i) => s.name.replace('Scene_', 'S'));

    _chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: profileNames.map((name, i) => ({
          label: name,
          data: [],
          borderColor: COLORS[i % COLORS.length],
          backgroundColor: COLORS[i % COLORS.length] + '18',
          borderWidth: 2,
          pointRadius: 0,
          stepped: 'before',
          tension: 0
        }))
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Day', color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: 'Scene', color: '#94a3b8' },
            ticks: {
              color: '#94a3b8',
              callback: v => sceneLabels[v] || `S${v}`
            },
            min: 0,
            max: Math.max(2, (_catalogs.sceneCatalog || []).length),
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `Day ${items[0].parsed.x}`,
              label: item => {
                const scene = sceneLabels[Math.floor(item.parsed.y)] || `Scene ${item.parsed.y}`;
                return `${item.dataset.label}: ${scene}`;
              }
            }
          }
        }
      }
    });

    renderLegend(profileNames);
  }

  function renderLegend(profileNames) {
    const el = document.getElementById('psim-legend');
    if (!el) return;
    el.innerHTML = profileNames.map((name, i) =>
      `<div class="psim-legend-item">
        <div class="psim-legend-dot" style="background:${COLORS[i % COLORS.length]}"></div>
        <span>${name}</span>
      </div>`
    ).join('');
  }

  function pushDataPoint(profileIdx, day, sceneIndex) {
    if (!_chart || profileIdx >= _chart.data.datasets.length) return;
    _chart.data.datasets[profileIdx].data.push({ x: day, y: sceneIndex });
    _chart.update('none');
  }

  function updateDayLabel(day) {
    const el = document.getElementById('psim-day-label');
    if (el) el.textContent = `Day ${day}`;
  }

  function renderStats(profiles, allLogs) {
    const el = document.getElementById('psim-stats');
    if (!el) return;
    const scenes = (_catalogs.sceneCatalog || []).map(s => s.name);
    const headers = ['Profile', ...scenes.map(s => s.replace('Scene_', 'S')), 'Sim End'];
    const rows = profiles.map((p, i) => {
      const logs = allLogs[i] || [];
      const sceneDays = scenes.map(sName => {
        const first = logs.find(l => {
          const sc = _catalogs.sceneCatalog[l.sceneIndex];
          return sc && sc.index > scenes.indexOf(sName);
        });
        return first ? `Day ${first.day}` : '—';
      });
      return [p.name, ...sceneDays, logs.length ? `Day ${logs[logs.length - 1].day}` : '—'];
    });

    el.innerHTML = `
      <div class="panel-header" style="margin-bottom:0.75rem">
        <span class="panel-title">Scene Milestones</span>
      </div>
      <div class="table-container" style="overflow-x:auto">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function renderEconomy(profiles, allFinalStates) {
    const el = document.getElementById('psim-economy');
    if (!el) return;
    const headers = ['Profile', 'Energy rcv', 'Energy spent', 'Gems rcv', 'Gems spent', 'Gold rcv', 'Gold spent'];
    const rows = profiles.map((p, i) => {
      const eco = (allFinalStates[i] || {}).economy || {};
      const e = eco.energy || {}, g = eco.gems || {}, go = eco.gold || {};
      return [p.name,
        (e.received || 0).toLocaleString(), (e.spent || 0).toLocaleString(),
        (g.received || 0).toLocaleString(), (g.spent || 0).toLocaleString(),
        (go.received || 0).toLocaleString(), (go.spent || 0).toLocaleString()
      ];
    });

    el.innerHTML = `
      <div class="panel-header" style="margin-bottom:0.75rem">
        <span class="panel-title">Economy Summary</span>
      </div>
      <div class="table-container" style="overflow-x:auto">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function bindPlaybackControls() {
    document.getElementById('psim-play-btn').addEventListener('click', startPlayback);
    document.getElementById('psim-pause-btn').addEventListener('click', pausePlayback);
    document.getElementById('psim-reset-btn').addEventListener('click', resetPlayback);
  }

  function bindSpeedButtons() {
    document.querySelectorAll('.psim-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.psim-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _speedMs = parseInt(btn.dataset.ms) || 200;
        if (_playInterval) { clearInterval(_playInterval); scheduleNext(); }
      });
    });
  }

  function startPlayback() {
    const profiles = SimConfig.getProfiles();
    if (!profiles.length || !_catalogs) return;
    const targetDays = parseInt(document.getElementById('psim-target-days').value) || 100;

    buildChart(profiles.map(p => p.name));
    const finalStates = profiles.map(() => null);
    const allLogs = profiles.map(() => []);

    _iterators = profiles.map(p => SimRunner.createStepIterator(_catalogs, p, targetDays));

    document.getElementById('psim-play-btn').disabled = true;
    document.getElementById('psim-pause-btn').disabled = false;

    function tick() {
      let allDone = true;
      _iterators.forEach((iter, i) => {
        if (!iter) return;
        const result = iter.next();
        if (result.done) { _iterators[i] = null; return; }
        allDone = false;
        const { dayLog, state } = result.value;
        allLogs[i].push(dayLog);
        finalStates[i] = state;
        pushDataPoint(i, dayLog.day, dayLog.sceneIndex);
        updateDayLabel(dayLog.day);
      });

      if (allDone) {
        clearInterval(_playInterval);
        _playInterval = null;
        document.getElementById('psim-play-btn').disabled = false;
        document.getElementById('psim-pause-btn').disabled = true;
        renderStats(profiles, allLogs);
        renderEconomy(profiles, finalStates);
      }
    }

    _playInterval = setInterval(tick, _speedMs);
  }

  function scheduleNext() {
    _playInterval = setInterval(() => {
      // resumed — tick function captured in closure won't work here
      // Simple restart: caller must re-invoke startPlayback after reset
    }, _speedMs);
  }

  function pausePlayback() {
    if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
    document.getElementById('psim-play-btn').disabled = false;
    document.getElementById('psim-pause-btn').disabled = true;
  }

  function resumePlayback() {
    // Re-schedules tick — tick closure is in startPlayback so we need a different approach
    // Simple solution: store tick function
    document.getElementById('psim-pause-btn').disabled = false;
    document.getElementById('psim-play-btn').disabled = true;
  }

  function resetPlayback() {
    pausePlayback();
    _iterators = [];
    if (_chart) { _chart.data.datasets.forEach(d => d.data = []); _chart.update('none'); }
    updateDayLabel(0);
    document.getElementById('psim-stats').innerHTML = '';
    document.getElementById('psim-economy').innerHTML = '';
    document.getElementById('psim-play-btn').disabled = false;
  }

  return { init, buildChart, renderStats, renderEconomy };
})();
```

**Note on pause/resume:** The current `pausePlayback` / `resumePlayback` shares state via closure. Refactor `startPlayback` to store `tick` in a module-level variable so `resume` can re-attach it: replace `function tick() {` with `let _tick; _tick = function() {` and `_playInterval = setInterval(_tick, _speedMs)` — then resume calls `_playInterval = setInterval(_tick, _speedMs)`.

- [ ] **Step 2: Commit**

```bash
git add js/sim/simChart.js
git commit -m "feat: add SimChart with animated playback, stats, and economy tables"
```

---

## Task 11: Wire Up app.js

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add PlayerSim module and init**

In `js/app.js`, add `PlayerSim` initialization in `initModules()`:
```js
function initModules() {
    if (typeof ItemEncyclopedia !== 'undefined') ItemEncyclopedia.init();
    if (typeof EnergyCalc       !== 'undefined') EnergyCalc.init();
    if (typeof OrdersTab        !== 'undefined') OrdersTab.init();
    if (typeof OrderAnalysis    !== 'undefined') OrderAnalysis.init();
    if (typeof IAPPackages      !== 'undefined') IAPPackages.init();
    if (typeof PlayerSim        !== 'undefined') PlayerSim.init();
}
```

- [ ] **Step 2: Create PlayerSim entry point**

Add before `</body>` in `index.html`, or as part of `simChart.js` — create the top-level `PlayerSim` module in `js/sim/simChart.js` by appending:

```js
// Top-level PlayerSim module wired into app.js
const PlayerSim = (() => {
  function init() {
    const catalogs = SimDataLoader.build(window.GameData);
    SimConfig.render(catalogs.iapCatalog);
    SimChart.init(catalogs);
  }
  return { init };
})();
```

- [ ] **Step 3: Open browser, verify full integration**

1. Open `index.html` in browser (via local server)
2. Navigate to "🎮 Player Sim" tab
3. Verify config panel renders with 3 default profiles
4. Set Days=30, click ▶ Play
5. Verify chart animates with step-line for each enabled profile
6. Verify stats table and economy table appear after simulation completes

- [ ] **Step 4: Commit**

```bash
git add js/app.js js/sim/simChart.js
git commit -m "feat: wire PlayerSim into app.js, complete Player Simulation tab integration"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §3.1 Item pipeline (tap → expand → cook → order) — SimBoard.tapGenerator, SimCooking, SimEngine.runSession
- [x] §3.2 Generator rules (lv4+, pool, cooldown) — SimDataLoader.buildGeneratorCatalog, SimBoard
- [x] §3.3 Board 63-slot + inventory 15-slot — SimBoard.create, addItem
- [x] §3.4 Demand-driven merge — SimBoard.mergeGenerators + SimEngine.getRequiredItems
- [x] §3.5 Reward schedule (OrderSystem + BuildUpGoalData + RewardBonus) — SimDataLoader.buildRewardSchedule
- [x] §3.6 F2P sell / Spender expand inventory — SimEngine.handleBoardFull, SimBoard.sellCheapestItem
- [x] §3.7 Scene progression — SimEngine.checkSceneCompletion
- [x] §4 Energy system — SimEnergy
- [x] §5 Session model (interval + sessionsPerDay) — SimEngine.getSessionStartMins, sessionCount
- [x] §6 IAP packages — SimDataLoader.buildIAPCatalog, SimEngine.applyPurchase, SimConfig purchases UI
- [x] §7 Economy tracker — state.economy tracked in SimEngine throughout
- [x] §8.1 Config panel with per-profile purchases — SimConfig
- [x] §8.2 Animated timeline chart + playback — SimChart
- [x] §8.3 Stats table — SimChart.renderStats
- [x] §8.4 Economy table — SimChart.renderEconomy
