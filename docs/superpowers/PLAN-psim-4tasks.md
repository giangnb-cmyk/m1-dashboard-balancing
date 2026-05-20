# PLAN: Player Sim — 4 Tasks
_Generated from subagent research. Execute phases in order._

---

## Phase 0 — Findings Summary (DO NOT SKIP — read before coding)

### Confirmed APIs / field names

| Symbol | Location | Shape |
|--------|----------|-------|
| `_eventLogs[pi]` | simChart.js | `{day, scene, type, amount, orderId, detail}[]` |
| `_catalogs.batchMap` | simDataLoader.js | `{[id:str]: {id, scene, orderIds:str[], canReceiveReward}}` |
| `_catalogs.orderDetailMap` | simDataLoader.js | `{[id:str]: {orderId, gold, items:[{itemId,qty}]}}` |
| `_catalogs.itemNames` | simDataLoader.js | `{[itemId:str]: displayName:str}` |
| `state.board.boardItems` | simBoard.js L6 | `{[itemId:str]: count:int}` — plain object |
| `state.board.inventoryItems` | simBoard.js L6 | same shape |
| `state.progress.completedOrderIds` | simEngine.js L71 | `Set<string>` |
| `state.progress.completedBatchIds` | simEngine.js L70 | `Set<string>` |
| `_takeSnapshot(state, pi)` | simChart.js L198 | snapshots `state.stats` shallow copy |
| `.psim-modal/.psim-modal-box/.psim-modal-backdrop` | styles.css L4902+ | existing modal CSS |

### Anti-patterns confirmed — DO NOT DO
- Do NOT use `dayLog` entries for batch/order data — they have no batch fields
- Do NOT mix number/string in `Array.includes()` — `batchMap.orderIds` are strings; always coerce
- `_renderItemStats` reads LAST snapshot only (not scrubber position) — this is intentional for current inventory
- `tryCompleteOrders` processes orders sequentially with `break` on first blocked — a stuck order blocks all later ones in the same batch

---

## Phase 1 — Fix Batch 6 in Order Summary

**Root cause (confirmed by research):**
`_renderOrderSummary` at simChart.js L589 does:
```js
const batchEntry = Object.values(batchMap).find(b => b.orderIds && b.orderIds.includes(e.orderId));
```
`batchMap[id].orderIds` are always **strings** (from CSV). But `e.orderId` on `gold_earn` events is written from `orderId` variable in `tryCompleteOrders` — need to confirm its type. If Batch 6 belongs to Scene 2 and Hardcore never exits Scene 1, its orders are never attempted, so they can't appear in the log at all. Both issues must be fixed.

### Task 1.1 — Coerce orderId to string in event log (simEngine.js)
File: `js/sim/simEngine.js`
In `tryCompleteOrders`, find the line that pushes to `state.eventLog`:
```js
state.eventLog.push({ day: state.day, scene: state.progress.scene,
  type: 'gold_earn', amount: detail.gold, orderId, ... });
```
Change `orderId` to `String(orderId)` in the push, AND when adding to `completedOrderIds`:
```js
progress.completedOrderIds.add(String(orderId));
```

### Task 1.2 — Coerce in batchMap lookup (simChart.js)
File: `js/sim/simChart.js`, function `_renderOrderSummary` (~L589)
Change:
```js
b.orderIds && b.orderIds.includes(e.orderId)
```
To:
```js
b.orderIds && b.orderIds.includes(String(e.orderId))
```

### Task 1.3 — Add batch-complete event to eventLog (simEngine.js)
In `tryCompleteOrders`, after `progress.completedBatchIds.add(batchId)` (currently only fires `level_up` event), also push a dedicated event:
```js
state.eventLog.push({
  day: state.day,
  scene: state.progress.scene,
  type: 'batch_complete',
  amount: 0,
  detail: `Batch ${batchId} complete`
});
```
This gives the Order Summary a way to show batch transitions even if the view is filtered.

### Verification
- Run sim with Hardcore for 10+ days
- Open Order Summary — every row must show a Batch label, no `—`
- If Batch 6 is in Scene 2 and sim never reaches it, Batch 6 is legitimately absent (confirm by checking `catalogs.batchMap["6"].scene` in browser console)

---

## Phase 2 — Diagnose and Fix Hardcore Scene 1 Stall

**Root cause candidates (from research):**

1. **Sequential order deadlock**: `tryCompleteOrders` breaks on first blocked order. If Order 1 in Batch 1 needs a cooked item that isn't ready, all later orders are permanently skipped that session.
2. **Gold shortfall**: Build steps have `goldCost`. If `spendGoldOnBuild` reads wrong field name or gold is insufficient, `buildStepsDone` never reaches `scene.buildSteps.length`.
3. **Scene completion condition**: `checkSceneComplete` requires BOTH `allBuildDone` AND `allBatchesDone` simultaneously — either condition failing stalls the scene indefinitely.

### Task 2.1 — Audit spendGoldOnBuild field names (simEngine.js)
File: `js/sim/simEngine.js`, function `spendGoldOnBuild` (~L467)
Verify that `step.goldCost` matches the field name set in simDataLoader `buildSceneCatalog`. Research confirms the field is `goldCost` on the step object — confirm no mismatch.

### Task 2.2 — Add per-day diagnostic event for scene stall (simEngine.js)
In `checkSceneComplete`, if conditions are NOT met, push a diagnostic `eventLog` entry (type: `'scene_debug'`) once per day with:
```js
{ type: 'scene_debug', day: state.day, allBuildDone, allBatchesDone,
  buildStepsDone: progress.buildStepsDone, totalBuildSteps: scene.buildSteps.length,
  batchesDoneCount: [...scene.batchIds].filter(id => progress.completedBatchIds.has(id)).length,
  totalBatches: scene.batchIds.length }
```
This lets the UI show why Scene 1 is stalling.

### Task 2.3 — Surface stall reason in simChart.js
File: `js/sim/simChart.js`, in the day label area or a new debug section.
Read last `scene_debug` event for the active profile and show:
```
Scene 1: Build 3/5 steps · Batches 4/6 done
```
So the designer can see what's missing.

### Task 2.4 — Check energy/session math for Hardcore
Hardcore: 8 sessions/day → every 3h → ~36 energy/session (0.2 regen × 180 min).
Verify `SimEnergy.regenBetweenSessions` uses the correct formula.
File: `js/sim/simEnergy.js` — read and confirm `timeMins` advances correctly between sessions in `tickDay`.

### Verification
- Run Hardcore 30 days, check scene_debug events in console or UI
- Confirm either: (a) scene completes within expected days once bottleneck fixed, or (b) designer can see the exact blocker

---

## Phase 3 — Order Summary Expand Button → Modal

**Existing modal CSS confirmed at styles.css L4902:**
```css
.psim-modal { position: fixed; inset: 0; z-index: 9999; ... }
.psim-modal-backdrop { position: absolute; inset: 0; background: rgba(2,6,23,0.75); ... }
.psim-modal-box { position: relative; width: min(90vw, 860px); max-height: 80vh; ... }
```

### Task 3.1 — Add expand button to Order Summary header (simChart.js)
File: `js/sim/simChart.js`, in `_renderActiveProfile` where the Order Summary section header is rendered.
Change the header HTML from:
```html
<div class="psim-section-title">Order Summary</div>
```
To:
```html
<div class="psim-section-title">
  Order Summary
  <button class="psim-expand-btn" data-expand="order-summary" data-profile="${profileIdx}" title="Expand">⤢</button>
</div>
```

### Task 3.2 — Bind expand button click (simChart.js)
In the event binding section of simChart.js (or PlayerSim.init), add:
```js
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-expand="order-summary"]');
  if (!btn) return;
  const pi = parseInt(btn.dataset.profile);
  _showOrderSummaryModal(pi);
});
```

### Task 3.3 — Implement _showOrderSummaryModal(profileIdx) (simChart.js)
New private function. Build the full order summary table (no `upToDay` filter — show all completed orders) inside a `.psim-modal`:
```js
function _showOrderSummaryModal(profileIdx) {
  // Remove existing modal if any
  document.querySelector('.psim-modal')?.remove();

  const tableHtml = _buildFullOrderTable(profileIdx); // extract table-building logic

  const modal = document.createElement('div');
  modal.className = 'psim-modal';
  modal.innerHTML = `
    <div class="psim-modal-backdrop"></div>
    <div class="psim-modal-box">
      <div class="psim-modal-header">
        <span>Order Summary — All Days</span>
        <button class="psim-modal-close">✕</button>
      </div>
      <div class="psim-modal-body">${tableHtml}</div>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelector('.psim-modal-close').onclick = () => modal.remove();
  modal.querySelector('.psim-modal-backdrop').onclick = () => modal.remove();
}
```

### Task 3.4 — CSS for expand button (styles.css)
```css
.psim-expand-btn {
  margin-left: auto;
  padding: 0.2rem 0.5rem;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}
.psim-expand-btn:hover { border-color: #38bdf8; color: #38bdf8; }
```

### Verification
- Click expand button → modal opens with full table
- Click backdrop or ✕ → modal closes
- Modal shows rows from all days including Batch 6 (once Phase 1 fix is applied)

---

## Phase 4 — Item Statistics: Inventory Breakdown + Order Assignment

### Task 4.1 — Snapshot boardItems + inventoryItems (simChart.js)
File: `js/sim/simChart.js`, function `_takeSnapshot` (~L198)
Add to the snapshot object:
```js
boardItems:     Object.assign({}, state.board.boardItems),
inventoryItems: Object.assign({}, state.board.inventoryItems),
completedOrderIds: state.progress.completedOrderIds
  ? [...state.progress.completedOrderIds]
  : [],
sceneIndex: state.progress.sceneIndex,
```

### Task 4.2 — Add "Current Inventory" section to _renderItemStats (simChart.js)
File: `js/sim/simChart.js`, function `_renderItemStats` (~L527)
After reading `latest`, also read `latest.boardItems`, `latest.inventoryItems`.
Merge them:
```js
const allItems = {};
Object.entries(latest.boardItems || {}).forEach(([id, n]) => allItems[id] = (allItems[id]||0)+n);
Object.entries(latest.inventoryItems || {}).forEach(([id, n]) => allItems[id] = (allItems[id]||0)+n);
```
Render as a new section using existing `_section()` + `_statRows()` pattern.
Label each item: look up `_catalogs.itemNames[itemId] || itemId`.

### Task 4.3 — Add "Pending Orders" section to _renderItemStats (simChart.js)
From `latest.sceneIndex` look up `catalogs.sceneCatalog[sceneIndex]` to get current scene's `batchIds`.
For each batchId, get `catalogs.batchMap[batchId].orderIds`.
Filter to orders NOT in `latest.completedOrderIds`.
For each pending orderId, read `catalogs.orderDetailMap[orderId].items`.
Build a table showing:
- Order ID
- Items required (name + qty)
- Items owned (from `allItems[itemId]` merged above)
- Status: ✓ enough / ✗ missing N

```html
<table class="psim-gemlog-table">
  <thead><tr><th>Order</th><th>Item</th><th>Need</th><th>Have</th><th>Status</th></tr></thead>
  <tbody>
    <!-- one row per item per order -->
  </tbody>
</table>
```

### Task 4.4 — CSS for new stat sections (styles.css)
Add status indicator styles:
```css
.psim-stat-ok  { color: #34d399; }
.psim-stat-gap { color: #f87171; }
```

### Verification
- After sim runs, Item Statistics shows 3 original sections + "Current Inventory" + "Pending Orders"
- Pending Orders shows which items are ready vs still needed
- Counts match what's on the board (cross-check with Board visualization)

---

## Final Phase — Integration Check

1. Open Player Sim tab, run sim for all 3 profiles
2. Hardcore: confirm Scene 1 completes within reasonable days (or stall reason is shown)
3. Order Summary: all rows have Batch labels; Batch 6 appears if Hardcore reaches Scene 2
4. Expand button: modal opens/closes, shows all orders
5. Item Stats: Inventory and Pending Orders sections populated correctly
6. No JS console errors across all phases
7. Responsive: all new UI elements work at <960px and <580px

---

_End of plan. Execute Phase 1 → 2 → 3 → 4 → Final in sequence._
