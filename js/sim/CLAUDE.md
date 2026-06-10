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
- `owned` có thể vượt cap qua IAP inject / gem buy

### Gem Spending (availability-driven)
Bất kỳ profile nào còn gems sẽ tiêu gems (không phụ thuộc playerType — playerType giờ chỉ là label UI):
- **Buy energy**: 10→20→40→80→160💎 / 100⚡ (BuyCurrency.csv), từ lần 5 trở đi giữ giá 160💎.
  Mua **theo nhu cầu giữa session** khi đang tap generator cần thiết mà hết energy (không top-up mù ở đầu session — tránh đốt energy mua vào generator rác).
- **Gen cooldown reset**: `gem_to_min` per generator → pool = minPool. Chỉ reset generator nằm trong required set.
- **Instant cook**: 1💎/60s cook time, chỉ cho recipe ≥60s đang cần.
- **Inventory expand**: 10💎/slot, cap tổng 30 slots (`MAX_INVENTORY_CAPACITY`).
- Daily limits per profile: `gemEnergyBuysPerDay`, `gemGenResetsPerDay`, `gemInstantCooksPerDay` (default 100 ≈ unlimited; gem bank là ràng buộc thật).

### Session Model
- Mỗi session là 1 "sitting" kéo dài `sessionActiveMins` (default 30 phút): cooking ngắn và generator cooldown ngắn HOÀN THÀNH trong cùng session (`sessionEndMins = start + active`).
- **Intra-session loop**: `_sessionPass` lặp (guard 30) chừng nào progress key còn thay đổi (orders/batches/build/scene/generated/cooked/merged) — người chơi hành động ngay trên rewards mới nhận trong cùng một lần ngồi chơi.

### Boxes / Gifts
- Reward dạng box (vd 600801 Gift, batch reward) được **mở ngay** qua `boxCatalog`: spawn `many_generator` items theo rate table — box không bao giờ chiếm slot board.

### Board-full policy (quantity-aware)
- Bán item rẻ nhất có count > reserve (`sellSurplusItem`). Reserve = direct needs của **mọi order chưa xong trong batch hiện tại** + recipe ingredients + 2^k merge bases (chỉ cho item KHÔNG có recipe — đồ nấu không reserve merge-predecessor).
- Hết đồ bán được → expand inventory bằng gems (≤30 slots) nếu item đang cần.

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
tests/simDataLoader.test.js   34 tests (3 fail pre-existing: order/batch reward parsing)
tests/simEnergy.test.js       12 tests
tests/simBoard.test.js        27 tests
tests/simCooking.test.js      15 tests
tests/simEngine.test.js        9 tests
tests/simEngine.gem.test.js    8 tests (gem spending, in-session cooking, box opening, merge cap)
```

Run: `node tests/<file>.test.js` (Node.js, no dependencies)

---

## Known Limitations / Out of Scope

- Event merge (PizzaTowerRace, FortuneMeetsCookie) không được model
- Battle Pass, Daily Rewards, Lucky Spin, Ads energy (25⚡/ad) không ảnh hưởng simulation
- NPC-specific order routing không model
- Inventory expand cost hard-coded 10 gems/slot, cap 30 slots (không đọc từ CSV)
- Simulation là stochastic: generator spawn + box opening dùng `Math.random()` (timeline lệch ±2 ngày giữa các run)
- Session là điểm thời gian + cửa sổ active 30': người chơi "cày liên tục cả ngày" cần config sessionsPerDay cao (16–24) để mô phỏng đúng
