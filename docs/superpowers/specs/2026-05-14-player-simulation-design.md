# Player Simulation — Design Spec
**Date:** 2026-05-14  
**Feature:** Tab mới "Player Simulation" — giả lập hành trình user từ ngày 0 đến scene N  
**Approach:** Approach B — New tab + `js/playerSim.js` module, event-based engine

---

## 1. Goals

Cho phép game designer nhìn thấy **player progression timeline**: user chơi bao nhiêu ngày sẽ đến scene mấy, theo từng profile (Hardcore / Mid-core / Casual hoặc custom). Simulation có thể cấu hình energy regen, session interval, IAP packages mua theo ngày, và player behavior type (F2P vs Spender).

---

## 2. Architecture

### Files thêm / sửa

```
index.html              +nav item "Player Simulation" + tab section markup
styles.css              +styles cho tab mới (reuse glassmorphism patterns)
js/playerSim.js         Module mới — toàn bộ logic simulation
```

### Module breakdown (`js/playerSim.js`)

```
PlayerSim
├── DataLoader          Parse window.GameData → catalogs & schedules
├── BoardManager        63-slot board + 15-slot inventory, auto-move logic
├── EnergyManager       Free regen + owned pool + IAP inject hook
├── MergeStrategy       Demand-driven merge (trace order → recipe → generator level)
├── CookingPipeline     Tool queue, COOK_DONE events, parallel cooking
├── SimEngine           tickDay(state) → newState, apply purchases, claim rewards
├── ProfileRunner       Run N profiles independently, collect timeline[]
└── Renderer            Config panel + playback controls + animated chart + stats
```

### Data flow

```
window.GameData (loaded by existing pipeline)
    → DataLoader → catalogs
    → SimEngine (per profile) → log[]
    → ProfileRunner (merge logs) → Renderer → Chart + Stats
```

---

## 3. Game Mechanics Modelled

### 3.1 Item Pipeline

```
Generator tap (−1 energy)
  → raw item spawned
  → [optional] ItemExpand (−1 energy, ~instant) → split into sub-items
  → [optional] Cook in Tool (time_to_cook seconds, parallel background)
  → recipe item available
  → match order requirement → gold earned
```

**Data sources:**
- `RateGenerator / ItemGenerator`: generator id, level, item spawn rates, cooldown (seconds), min/max pool
- `ItemExpand`: source item → result items, cost_energy=1, time_cooldown~3s
- `CookingRecipes`: type_tool, id_result, time_to_cook, ingredient item_ids

### 3.2 Generator Rules

- Level 1–3: cannot generate items (non-functional)
- Level 4+: functional — tap to spawn items per `RateGenerator`
- Each tap costs 1 energy, consumes 1 from pool
- When pool depleted → cooldown timer starts → pool refills after `time_cooldown` seconds

### 3.3 Board & Inventory

```
Board:     7×9 = 63 slots
Inventory: 15 slots (default; Spender can expand with gems)

Slot priority (when needing to free space):
  Keep:   generators > tools > items being cooked > items needed for active orders
  Sell/move: lowest-level raw items not needed for current batch
```

**Auto-move logic:**
1. Board full + new item/reward incoming → find lowest-priority item → move to inventory
2. Inventory full + board full → trigger player-type behavior (see §3.6)
3. When order needs item → pull from inventory to board

### 3.4 Demand-Driven Merge Strategy

Instead of greedy max-merge, merge only to levels required by current orders:

```
1. Inspect active batch orders → required recipe items
2. Trace back: recipe item ← cooking ingredients ← item expand ← raw item ← generator level
3. Build target level set = { generatorLevel: count needed }
4. Merge rules:
   - If 2 generators at level L exist and L is NOT in target set → merge to L+1
   - Never merge past the highest level in target set
   - If multiple levels needed simultaneously → keep generators at different levels
   - Excess merging only when board space is critical
```

### 3.5 Reward Schedule

Generators and tools are granted through:

| Source | When | Data |
|---|---|---|
| `OrderSystem` | Batch completion (`can_receive_reward=TRUE`) | `res_type=Item`, `custom_value=itemId` |
| `BuildUpGoalData` | Build step completion | `rw_build_up_type`, `rw_build_up_id`, `custom_value` |
| `BuildUpGoalRewardBonus` | Bonus build step rewards | same structure |

Item IDs mapped to generator/tool type via `ItemGenerator` / item catalog.

### 3.6 Player Type Behavior (when board + inventory full)

| Type | Behavior |
|---|---|
| **F2P** | Scan board → sell lowest-value items (sorted by `ItemMerge.sell_price` ascending, not needed for active orders) → free 1+ slots. Gold earned from sell tracked in economy tracker. Generators always have `sell_price=0` so are never sold. |
| **Spender** | Spend gems to unlock +1 inventory slot (gem cost from `DiscountGemRaw.csv`). When gems = 0 → fallback to F2P behavior |

### 3.7 Scene Progression

- **Scene clear** = all build steps in scene completed (gold cost) AND all batches in scene completed
- Build step cost in gold → from `BuildUpGoalData.cost`
- On scene clear → move to next scene, new generator/tool rewards applied

---

## 4. Energy System

```
EnergyManager {
  owned: number        // can exceed cap (from IAP/events)
  cap: 100             // free regen cap
  regenPerMin: number  // configurable (default: 0.2 = 1/5min)

  tick(minutes):
    if owned < cap → owned = min(cap, owned + regenPerMin × minutes)
    // no regen when owned >= cap

  inject(amount, source):  // IAP / event hook
    owned += amount
    // source: { type: 'iap'|'event', packageId, day }
}
```

---

## 5. Session Model

Each profile configures **when** the player opens the game:

```js
// Option C: fixed interval
{ sessionMode: 'interval', intervalHours: 6 }

// Option D: sessions per day
{ sessionMode: 'sessionsPerDay', count: 4 }
```

Multi-profile: ProfileRunner runs each profile's SimEngine independently, then merges results for chart rendering.

---

## 6. IAP Package Integration

```js
profile.purchases = [
  { day: 5,  packageId: 'StarterPack' },
  { day: 14, packageId: 'EnergyPack', quantity: 3 }
]
```

Package contents parsed from existing IAP CSVs (`StarterPack.csv`, `EnergyPack.csv`, etc.) — energy, generators, tools, gold, gems.

In `tickDay()`: if `purchases[currentDay]` exists → `applyPackage(state, pkg)` → inject contents, trigger auto-merge, update economy tracker.

---

## 7. Economy Tracker

Per profile, track all currency flows:

```js
economy: {
  energy: { received: 0, spent: 0 },
  gems:   { received: 0, spent: 0 },
  gold:   { received: 0, spent: 0 }
}
```

| Flow | Received | Spent |
|---|---|---|
| Energy | regen ticks + IAP inject + event | generator taps + item expand |
| Gems | rewards + IAP packages | inventory slot unlock (Spender) |
| Gold | completed orders | build steps |

---

## 8. Output & UI

### 8.1 Config Panel

```
Energy regen: [0.2] /min    Cap: [100]
──────────────────────────────────────────────────────
Profile 1: [Hardcore ▼]  Type: [F2P ▼]
  Session: ( ) Interval [3] h   (●) Sessions/day [8]   [✓]
  Purchases: Day 5 → [Starter Pack ▼] [×]   [+ Add]

Profile 2: [Mid-core ▼]  Type: [F2P ▼]
  Session: (●) Interval [6] h   ( ) Sessions/day [4]   [✓]
  Purchases: (none)                                     [+ Add]

Profile 3: [Casual ▼]    Type: [Spender ▼]
  Session: (●) Interval [12] h  ( ) Sessions/day [2]   [✓]
  Purchases: Day 3 → [Energy Pack ▼] [×]               [+ Add]
──────────────────────────────────────────────────────
Days to simulate: [100]   Speed: [ 1x · 5x · 10x ]
[ ▶ Play ]  [ ⏸ Pause ]  [ ↺ Reset ]
```

### 8.2 Animated Timeline Chart

- **X axis**: Day (0 → target days)
- **Y axis**: Scene index (Tutorial=0, Scene_01=1, Scene_02=2...)
- **Each profile**: 1 step-line dataset, different color
- **Playback**: `setTimeout` loop calling `tickDay()` per frame, `chart.update('none')` each tick
- **Speed**: 1x=200ms/day, 5x=40ms/day, 10x=20ms/day
- **Tooltip on hover**: "Day 14 — Mid-core: Scene_02 (build 60%, 3/7 batches)"

### 8.3 Stats Table (below chart)

```
Profile    Scene_01   Scene_02   Scene_03   …   Sim End
HC         Day 8      Day 19     Day 34         Day 45
MC         Day 12     Day 28     Day 51         Day 67
CA         Day 31     Day 72     Day 130        Day 180
```

### 8.4 Economy Summary Table (below stats)

```
Profile    Energy rcv  Energy spent   Gems rcv  Gems spent   Gold rcv   Gold spent
HC         4,200       4,050          80        35           12,400     11,900
MC         2,100       1,980          40        0            6,200      5,800
CA         800         760            0         0            2,300      2,200
```

---

## 9. Key Simplifications & Assumptions

| Assumption | Rationale |
|---|---|
| Items in transit stored in abstract `inventory` (not occupying board slots) | Simplifies board space tracking; items are transient |
| Cooking happens fully in background (parallel to energy spending) | Matches actual game behavior |
| Item expand treated as near-instant (3s cooldown abstracted away) | Negligible impact on daily simulation |
| Initial board state = generators/tools granted at game start | Parsed from earliest OrderSystem / BuildUpGoal rewards |
| Inventory default = 15 slots | Per designer spec; Spender can expand with gems |
| Free-to-play energy only (no IAP) unless purchases explicitly configured | Makes baseline comparable across profiles |

---

## 10. Out of Scope (this version)

- Event merge (PizzaTowerRace, FortuneMeetsCookie, etc.)
- Battle Pass progression
- Daily Rewards / Lucky Spin effects
- NPC-specific order routing
- Star cost for build (modelled as gold cost only per BuildUpGoalData)
