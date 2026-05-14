# Player Simulation — Technical Context

## Purpose

Tab "🎮 Player Sim" giả lập hành trình chơi của user trong Merge Cooking game theo từng ngày, cho phép game designer xem profile nào đến được scene mấy sau bao nhiêu ngày. Simulation chạy in-browser với Chart.js, animated từng ngày một.

---

## File Map

```
js/sim/
├── simDataLoader.js   Parse window.GameData → simulation catalogs (entry: SimDataLoader.build)
├── simEnergy.js       Energy regen, cap, IAP inject (SimEnergy)
├── simBoard.js        Board 63-slot + inventory 15-slot + demand-driven merge (SimBoard)
├── simCooking.js      Tool cooking pipeline (SimCooking)
├── simEngine.js       tickDay(state, catalogs, profileCfg) → {dayLog} (SimEngine)
├── simRunner.js       runFull + createStepIterator generator (SimRunner)
├── simConfig.js       Config panel + per-profile IAP purchases UI (SimConfig)
└── simChart.js        Chart.js animation + playback controls + PlayerSim entry point
```

`PlayerSim.init()` là entry point, defined ở cuối `simChart.js`, được gọi từ `app.js`.

---

## Game Mechanics Modelled

### Item Pipeline
```
Generator tap (−1 energy)
  → raw item spawned
  → [optional] ItemExpand (−1 energy, ~instant) → split into sub-items
  → [optional] Cook in Tool (time_to_cook seconds, background) → recipe item
  → match order requirement → gold earned
  → gold → build steps → scene progress
```

### Generator Rules
- Level 1–3: **không thể** spawn items (`canGenerate: false`)
- Level 4+: functional — tap → spawn items theo rate%
- Mỗi tap: −1 energy, giảm pool 1
- Pool = 0 → cooldown timer → refill sau `time_cooldown` giây
- **Demand-driven merge**: chỉ merge generator KHÔNG nằm trong required set, không merge vượt level cao nhất đang cần

### Scene Progression
- Scene clear khi: tất cả build steps done (tốn gold) VÀ tất cả batches trong scene done
- Build step cost từ `BuildUpGoalData.cost`
- Batch done khi tất cả orders trong batch completed

### Energy System
- Free regen: X energy/phút, cap = 100
- Nếu `owned >= cap`: dừng regen
- `owned` có thể vượt cap qua IAP inject

### Board
- 63 slots total = generators + tools + board items
- Inventory: 15 slots riêng (off-board storage)
- Board full → move item sang inventory, hoặc sell (F2P) / expand inventory (Spender)

---

## window.GameData Keys Dùng

| Key | Nguồn | Dùng cho |
|-----|-------|----------|
| `rateGenerator` | RateGenerator.csv + ItemGenerator.csv | Generator catalog (id, type, spawns, cooldown, pool) |
| `itemMerge` | ItemMerge.csv | Sell prices per item |
| `itemExpand` | ItemExpand.csv | Fields: itemID, spawn_itemID, spawn_number, cost_energy |
| `formuaRecipes` | CookingRecipes.csv | Fields: itemID, toolId, TimeToCook_sec, Ingredient1Id..4Id |
| `buildUpGoalData` | BuildUpGoalData.csv | Build steps: theme, id, cost, rw_build_up_* rewards |
| `buildUpGoalReward` | BuildUpGoalReward.csv | Bonus build step rewards |
| `orderSystem` | OrderSystem.csv | Batches: id, themeType (numeric string '1'='Scene_01'), id_order, rewards |
| `orderDetail` | OrderDetail.csv | Orders: orderId, item1_id, item1_amount, item2_id, gold |
| `iap*` | IAP CSVs | Packages: id, pack_name, res_type, res_id, res_number, iap_cost |

> **Lưu ý**: `themeType` trong orderSystem là numeric string ('1', '2'...) không phải 'Scene_01'.
> `normalizeTheme('1')` → 'Scene_01'. Hàm này có trong simDataLoader.js.

> **Lưu ý**: key là `formuaRecipes` (typo từ CSV gốc), KHÔNG phải `cookingRecipes`.

---

## Catalogs (output của SimDataLoader.build)

```js
{
  generatorCatalog:  Map<genId, {id, type, level, canGenerate, cooldownSecs, costEnergy,
                                  minPool, maxPool, spawns:[{itemId,rate}], sellPrice}>,
  toolCatalog:       Map<toolType, {type, recipes:[{resultId, timeSecs, ingredients[]}]}>,
  itemExpandCatalog: Map<sourceId, {sourceId, resultIds[], costEnergy, cooldownSecs}>,
  sceneCatalog:      SceneDef[] sorted by name, [{name, index, buildSteps[], batchIds[]}],
  rewardSchedule:    [{trigger:'buildStep'|'order', scene?, stepId?, orderId?, batchId?,
                        itemId?, qty?, currency?, amount?}],
  iapCatalog:        Map<key, [{id, name, iapCost, contents:[{type, amount}]}]>,
  itemSellPrices:    Map<itemId, number>,
  batchMap:          Map<batchId, {id, scene, canReceiveReward, orderIds[]}>,
  orderDetailMap:    Map<orderId, {orderId, gold, items:[{itemId, qty}]}>
}
```

---

## State Structure

```js
{
  day: 0,
  timeMins: 0,
  energy: { owned, cap, regenPerMin },
  board: {
    generators: [{ genId, pool, cooldownUntil }],
    tools: [{ toolType, cooking: null | { resultId, doneAt } }],
    boardItems: {},       // itemId → count (chiếm board slots)
    boardItemCount: 0,
    inventoryItems: {},   // itemId → count (off-board)
    inventoryCount: 0,
    inventoryCapacity: 15
  },
  progress: {
    sceneIndex, scene,
    buildStepsDone, goldBank, goldEarned,
    batchesDone,
    completedBatchIds: Set,
    completedOrderIds: Set
  },
  economy: {
    energy: { received, spent },
    gems:   { received, spent },
    gold:   { received, spent }
  },
  gems: 0,
  log: [{ day, scene, sceneIndex, buildStepsDone, goldEarned, economy }]
}
```

---

## Profile Config

```js
{
  name, sessionMode: 'interval' | 'sessionsPerDay',
  intervalHours,   // dùng khi sessionMode='interval'
  sessionsPerDay,  // dùng khi sessionMode='sessionsPerDay'
  regenPerMin, cap, playerType: 'f2p' | 'spender',
  purchases: [{ day, packageKey, packageId, quantity }],
  enabled: bool
}
```

---

## Simulation Initialization (getStarterItems)

`SimRunner.getStarterItems(catalogs)` tính starting board:
1. Thu thập generators từ **tất cả** build step rewards của scene đầu tiên
2. Thu thập thêm từ order rewards của batch đầu tiên
3. **Fallback**: nếu không có functional generator (level 4+), tự động pick generator level 4+ đầu tiên mỗi type
4. Populate `initialTools` từ tất cả toolCatalog keys

> **Quan trọng**: Build step 0 của Scene_01 thường cho generator level 3 (`canGenerate: false`).
> Fallback đảm bảo simulation luôn có ít nhất 1 generator hoạt động được.

---

## Chart

- X-axis: Day (linear)
- Y-axis: sceneIndex (min=-0.3 để y=0 không bị ẩn bởi trục X)
- Mỗi profile = 1 step-line dataset
- Playback: `setInterval(_tick, speedMs)`, `chart.update('none')` mỗi frame
- `_tick` có try-catch: lỗi runtime hiện ra ở `#psim-day-label`

---

## Tests

```
tests/simDataLoader.test.js   34 tests
tests/simEnergy.test.js       12 tests
tests/simBoard.test.js        27 tests
tests/simCooking.test.js      15 tests
tests/simEngine.test.js        9 tests
```

Run: `node tests/<file>.test.js` (Node.js, no dependencies)

---

## Known Limitations / Out of Scope

- Event merge (PizzaTowerRace, FortuneMeetsCookie) không được model
- Battle Pass, Daily Rewards, Lucky Spin không ảnh hưởng simulation
- NPC-specific order routing không model
- Item expand: chỉ lấy `resultIds[0]` (first result), không model all results
- Spender inventory expand cost hard-coded là 10 gems/slot (không đọc từ CSV)
- Simulation là deterministic-ish: generator spawn dùng `Math.random()`
