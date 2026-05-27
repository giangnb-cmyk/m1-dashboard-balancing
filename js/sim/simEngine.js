// js/sim/simEngine.js
// Main simulation loop: advances game state by one day at a time.
const SimEngine = (() => {
  // Lazy-load sibling modules — works in Node.js (require) and browser (window globals)
  const _energy  = () => typeof module !== 'undefined' ? require('./simEnergy')  : window.SimEnergy;
  const _board   = () => typeof module !== 'undefined' ? require('./simBoard')   : window.SimBoard;
  const _cooking = () => typeof module !== 'undefined' ? require('./simCooking') : window.SimCooking;

  // ---------------------------------------------------------------------------
  // createState
  // ---------------------------------------------------------------------------
  function createState(catalogs, profileCfg, initialGens, initialTools, initialItems) {
    const SimEnergy = _energy();
    const SimBoard  = _board();

    const energy = SimEnergy.create({
      regenPerMin: profileCfg.regenPerMin || 0.2,
      cap: profileCfg.cap || 100,
      initialOwned: profileCfg.startingEnergy !== undefined ? profileCfg.startingEnergy : 50
    });

    const board = SimBoard.create({ inventoryCapacity: profileCfg.inventoryCapacity || 15 });
    if (profileCfg.ignoreCapacity) board.unlimitedCapacity = true;

    (initialGens || []).forEach(({ genId, qty }) => {
      for (let i = 0; i < (qty || 1); i++) {
        SimBoard.addGenerator(board, genId, catalogs.generatorCatalog);
      }
    });
    (initialTools || []).forEach(({ toolType, itemId }) => {
      SimBoard.addTool(board, toolType, itemId);
    });
    // Place starting board items (from BoardDefault) after generators and tools
    Object.entries(initialItems || {}).forEach(([itemId, qty]) => {
      SimBoard.addItem(board, itemId, qty);
    });

    const firstScene = (catalogs.sceneCatalog[0] || {}).name || 'Scene_01';

    // Log day-0 placement so users can trace where starting items came from
    const eventLog = [];
    (initialGens || []).forEach(({ genId, qty }) => {
      const def = catalogs.generatorCatalog[genId];
      if (def) eventLog.push({ day: 0, scene: firstScene, type: 'gen_receive', amount: qty || 1,
        detail: `Starting board: ${def.type} Lv${def.gameTier || def.level} ×${qty || 1}`, itemId: genId });
    });
    (initialTools || []).forEach(({ toolType, itemId }) => {
      const toolDef  = (catalogs.toolCatalog || {})[toolType];
      const toolName = toolDef ? (toolDef.name || toolType) : toolType;
      const tier     = itemId && (catalogs.itemTierMap || {})[itemId]
        ? (catalogs.itemTierMap[itemId].tier) : null;
      const lvStr    = tier ? ` Lv${tier}` : '';
      eventLog.push({ day: 0, scene: firstScene, type: 'tool', amount: 1,
        detail: `Starting board: ${toolName}${lvStr}`, itemId: toolType });
    });

    return {
      day: 0,
      timeMins: 0,
      energy,
      board,
      progress: {
        sceneIndex: 0,
        scene: firstScene,
        buildStepsDone: 0,
        goldBank: 0,
        goldEarned: 0,
        batchesDone: 0,
        level: 0,
        completedBatchIds: new Set(),
        completedOrderIds: new Set()
      },
      economy: {
        energy: { received: 0, spent: 0 },
        gems:   { received: 0, spent: 0 },
        gold:   { received: 0, spent: 0 }
      },
      gems: profileCfg.startingGems || 0,
      energyBuyCount: 0,     // resets each day — tracks BuyCurrency.csv escalating tier
      gemGenResetCount: 0,   // resets each day
      gemInstantCookCount: 0,// resets each day
      stats: { generated: {}, cooked: {}, merged: {} },
      eventLog,
      log: []
    };
  }

  // ---------------------------------------------------------------------------
  // Session count helpers
  // ---------------------------------------------------------------------------
  function getSessionCount(profileCfg) {
    if (profileCfg.sessionMode === 'interval') {
      return Math.floor(1440 / (profileCfg.intervalHours * 60));
    }
    return profileCfg.sessionsPerDay || 4;
  }

  function getSessionStartMins(day, sessionIdx, profileCfg) {
    if (profileCfg.sessionMode === 'interval') {
      return (day - 1) * 1440 + sessionIdx * (profileCfg.intervalHours * 60);
    }
    const sessions = profileCfg.sessionsPerDay || 4;
    return (day - 1) * 1440 + sessionIdx * (1440 / sessions);
  }

  // ---------------------------------------------------------------------------
  // Required items / generators for current scene batch orders
  // ---------------------------------------------------------------------------
  function getRequiredItems(state, catalogs) {
    const { progress } = state;
    const scene = catalogs.sceneCatalog[progress.sceneIndex];
    if (!scene) return { itemIds: new Set(), genIds: new Set(), neededQty: {} };

    const itemIds = new Set();
    const genIds  = new Set();
    const neededQty = {};       // only direct order items (reserve on board)
    const maxTierByFamily = {}; // family → highest tier the chain ever touches

    function setMaxTier(itemId) {
      const meta = (catalogs.itemTierMap || {})[itemId];
      if (!meta) return;
      const cur = maxTierByFamily[meta.family] || 0;
      if (meta.tier > cur) maxTierByFamily[meta.family] = meta.tier;
    }

    // walkBackSources: structural tracing only (itemIds, genIds, maxTierByFamily).
    // Uses neededQty[itemId] — which must be fully accumulated BEFORE calling —
    // as the multiplier when reserving cooking ingredients.
    const visited = new Set();
    function walkBackSources(itemId) {
      if (visited.has(itemId)) return;
      visited.add(itemId);
      itemIds.add(itemId);
      setMaxTier(itemId);
      // Multiply ingredient reservation by how many of this item are needed so
      // mergeItems doesn't consume the last copies before cooking can use them.
      const itemQty = neededQty[itemId] || 1;
      const recipe = _cooking().findRecipe(catalogs.toolCatalog, itemId);
      if (recipe) recipe.ingredients.forEach(ingId => {
        neededQty[ingId] = (neededQty[ingId] || 0) + itemQty;
        walkBackSources(ingId);
      });
      Object.values(catalogs.itemExpandCatalog || {}).forEach(exp => {
        if (exp.resultIds && exp.resultIds.includes(itemId)) walkBackSources(exp.sourceId);
      });
      // Merge-chain predecessor: 2× tier N → 1× tier N+1.
      const meta = (catalogs.itemTierMap || {})[itemId];
      if (meta && meta.tier > 1) {
        const chain = (catalogs.familyChain || {})[meta.family] || [];
        const prevId = chain[meta.tier - 2];
        if (prevId) walkBackSources(prevId);
      }
      Object.values(catalogs.generatorCatalog).forEach(gen => {
        if (gen.spawns.some(s => s.itemId === itemId)) genIds.add(gen.id);
      });
    }

    // Pass 1 — accumulate neededQty for the FIRST incomplete order only.
    // Sequential focus keeps merge chains concentrated: spreading resources across
    // every batch order simultaneously would dilute each chain below the tier threshold.
    // tryCompleteOrders uses continue (not break) so other already-satisfiable orders
    // in the same batch still get completed each session.
    for (const batchId of scene.batchIds) {
      if (progress.completedBatchIds.has(batchId)) continue;
      const batch = catalogs.batchMap[batchId];
      if (!batch) break;
      for (const orderId of batch.orderIds) {
        if (progress.completedOrderIds.has(orderId)) continue;
        const detail = catalogs.orderDetailMap[orderId];
        if (detail) {
          detail.items.forEach(({ itemId, qty }) => {
            itemIds.add(itemId);
            neededQty[itemId] = (neededQty[itemId] || 0) + (qty || 1);
          });
        }
        break; // First incomplete order only
      }
      break;
    }

    // Pass 2 — trace sources only for items still in deficit
    for (const [itemId, qty] of Object.entries(neededQty)) {
      const have = _board().itemCount(state.board, itemId);
      if (have >= qty) continue;
      walkBackSources(itemId);
    }

    return { itemIds, genIds, neededQty, maxTierByFamily };
  }

  function traceIngredientsToGens(itemId, catalogs, itemIds, genIds) {
    const recipe = _cooking().findRecipe(catalogs.toolCatalog, itemId);
    if (recipe) {
      recipe.ingredients.forEach(ingId => {
        itemIds.add(ingId);
        traceIngredientsToGens(ingId, catalogs, itemIds, genIds);
      });
    }
    // Find any generator that spawns this item
    Object.values(catalogs.generatorCatalog).forEach(gen => {
      if (gen.spawns.some(s => s.itemId === itemId)) genIds.add(gen.id);
    });
  }

  // ---------------------------------------------------------------------------
  // Tap all available generators in one session tick
  // ---------------------------------------------------------------------------

  // Priority 1: buy energy with gems at session start (spender only).
  // Cost escalates per BuyCurrency.csv: 10→20→40→80→160 gems per 100 energy, max 5 times/day.
  function _tryBuyEnergy(state, profileCfg) {
    const maxBuys = Math.min(
      profileCfg.gemEnergyBuysPerDay ?? ENERGY_BUY_COSTS.length,
      ENERGY_BUY_COSTS.length
    );
    while (
      state.energyBuyCount < maxBuys &&
      state.energy.owned < state.energy.cap &&
      state.gems >= ENERGY_BUY_COSTS[state.energyBuyCount]
    ) {
      const cost = ENERGY_BUY_COSTS[state.energyBuyCount];
      state.gems -= cost;
      state.economy.gems.spent += cost;
      _energy().inject(state.energy, ENERGY_BUY_AMOUNT, state.economy);
      state.eventLog.push({
        day: state.day, scene: state.progress.scene,
        type: 'gem_spend', amount: -cost,
        detail: `Buy energy +${ENERGY_BUY_AMOUNT} (${cost}💎, #${state.energyBuyCount + 1}/day)`
      });
      state.energyBuyCount++;
    }
  }

  // Priority 3 (last): spend gems to refill generator pool mid-session (spender only).
  // Returns true if reset succeeded.
  function _tryGemReset(slot, def, state, requiredItems, profileCfg) {
    if (!def.gemToMin || state.gems < def.gemToMin) return false;
    if (!requiredItems.genIds || !requiredItems.genIds.has(slot.genId)) return false;
    const maxResets = profileCfg?.gemGenResetsPerDay ?? Infinity;
    if (state.gemGenResetCount >= maxResets) return false;
    state.gems -= def.gemToMin;
    state.economy.gems.spent += def.gemToMin;
    state.gemGenResetCount++;
    slot.pool = def.minPool;
    slot.cooldownUntil = 0;
    state.eventLog.push({
      day: state.day, scene: state.progress.scene, type: 'gem_spend',
      amount: -def.gemToMin,
      detail: `Reset cooldown: ${def.type} Lv${def.gameTier || def.level} → ${def.minPool} charges (${def.gemToMin}💎)`
    });
    return true;
  }

  function _trackCookEvents(cooked, state, catalogs) {
    cooked.forEach(resultId => {
      state.stats.cooked[resultId] = (state.stats.cooked[resultId] || 0) + 1;
      const recipe = _cooking().findRecipe(catalogs.toolCatalog, resultId);
      const toolName = recipe && catalogs.toolCatalog[recipe.toolId]
        ? (catalogs.toolCatalog[recipe.toolId].name || recipe.toolId) : '?';
      const itemName = (catalogs.itemNames || {})[resultId] || resultId;
      state.eventLog.push({ day: state.day, scene: state.progress.scene,
        type: 'cook', amount: 1,
        detail: `Cooked: ${itemName} [${toolName}]` });
    });
  }

  function _trackMergeStats(mergeEvents, state) {
    mergeEvents.forEach(({ toId }) => {
      state.stats.merged[toId] = (state.stats.merged[toId] || 0) + 1;
    });
  }

  function _logToolMergeUpgrade(events, state, catalogs) {
    events.forEach(e => {
      const toolName = (catalogs.toolCatalog[e.toolType] || {}).name || e.toolType;
      const detail = e.kind === 'merge'
        ? `Merged: ${toolName} Lv${e.fromTier} ×2 → Lv${e.toTier}`
        : `Upgraded: ${toolName} Lv${e.fromTier} → Lv${e.toTier}`;
      state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'tool', amount: 1, detail });
    });
  }

  function _logPromotedGenerators(promoted, state, catalogs) {
    promoted.forEach(({ genId, count }) => {
      const def = catalogs.generatorCatalog[genId];
      if (!def) return;
      state.eventLog.push({
        day: state.day, scene: state.progress.scene,
        type: 'gen_receive', amount: count,
        detail: `Assembled: ${def.type} Lv${def.gameTier || def.level} ×${count} (merged from low-tier items)`
      });
    });
  }

  // Tap one generator slot until energy/pool runs out or maxTaps is reached.
  // maxTaps=undefined means no cap (used for rest generators and redistribution pass).
  function _tapGeneratorSlot(slot, def, state, catalogs, currentTimeMins, requiredItems, profileCfg, maxTaps) {
    const SimEnergy = _energy(), SimBoard = _board();
    const { board, energy, economy } = state;
    let taps = 0;
    while (energy.owned >= (def.costEnergy || 1) && slot.pool > 0 && slot.cooldownUntil <= currentTimeMins) {
      if (maxTaps !== undefined && taps >= maxTaps) break;
      taps++;
      const cost = def.costEnergy || 1;
      if (!SimEnergy.spend(energy, cost)) break;
      economy.energy.spent += cost;

      const spawnedId = SimBoard.tapGenerator(board, slot.genId, catalogs.generatorCatalog, currentTimeMins);
      if (!spawnedId) break;

      let finalId = spawnedId;
      const expandDef = catalogs.itemExpandCatalog[spawnedId];
      if (expandDef && energy.owned >= expandDef.costEnergy) {
        const srcMeta = (catalogs.itemTierMap || {})[spawnedId];
        let mergeChainNeed = 0;
        if (srcMeta && requiredItems.itemIds.has(spawnedId)) {
          for (const [needId, needQty] of Object.entries(requiredItems.neededQty || {})) {
            const m = (catalogs.itemTierMap || {})[needId];
            if (m && m.family === srcMeta.family && m.tier > srcMeta.tier)
              mergeChainNeed += needQty * (1 << (m.tier - srcMeta.tier));
          }
        }
        if (SimBoard.itemCount(board, spawnedId) >= mergeChainNeed) {
          SimEnergy.spend(energy, expandDef.costEnergy);
          economy.energy.spent += expandDef.costEnergy;
          finalId = expandDef.resultIds[0] || spawnedId;
        }
      }

      const added = SimBoard.addItem(board, finalId, 1);
      if (!added) handleFullBoard(state, catalogs, finalId, requiredItems, profileCfg);
      state.stats.generated[finalId] = (state.stats.generated[finalId] || 0) + 1;

      // No-cooldown: refill first so spender gem-reset is never needed
      if (slot.pool === 0 && profileCfg.noCooldown) {
        slot.pool = def.maxPool;
        slot.cooldownUntil = 0;
      }
      if (slot.pool === 0 && slot.cooldownUntil > currentTimeMins && profileCfg.playerType === 'spender') {
        if (!_tryGemReset(slot, def, state, requiredItems, profileCfg)) break;
      }
    }
    return taps;
  }

  function tapGenerators(state, catalogs, currentTimeMins, requiredItems, profileCfg) {
    const { energy } = state;
    const neededGenIds = requiredItems.genIds || new Set();
    const allSlots = [...state.board.generators];
    const requiredSlots = allSlots.filter(s => neededGenIds.has(s.genId));
    const restSlots     = allSlots.filter(s => !neededGenIds.has(s.genId));

    // Fair cap so no single required generator starves others in the same pass.
    const numRequired = requiredSlots.filter(s => {
      const d = catalogs.generatorCatalog[s.genId];
      return d && d.canGenerate && s.pool > 0 && s.cooldownUntil <= currentTimeMins;
    }).length || 1;
    const fairTapCap = Math.ceil(energy.owned / numRequired);

    const tapsPerGen = {}; // genId → { taps, spent } — aggregated across both passes

    // Pass 1: required generators with fair cap, then rest generators uncapped.
    for (const slot of [...requiredSlots, ...restSlots]) {
      const def = catalogs.generatorCatalog[slot.genId];
      if (!def || !def.canGenerate) continue;
      if (slot.pool <= 0 || slot.cooldownUntil > currentTimeMins) {
        if (profileCfg.noCooldown) { slot.pool = def.maxPool; slot.cooldownUntil = 0; }
        else if (slot.pool <= 0 && slot.cooldownUntil > currentTimeMins && profileCfg.playerType === 'spender') {
          if (!_tryGemReset(slot, def, state, requiredItems, profileCfg)) continue;
        } else { continue; }
      }
      const maxTaps = neededGenIds.has(slot.genId) ? fairTapCap : undefined;
      const eb1 = energy.owned;
      const t1  = _tapGeneratorSlot(slot, def, state, catalogs, currentTimeMins, requiredItems, profileCfg, maxTaps);
      if (t1 > 0) {
        const g = tapsPerGen[slot.genId] = tapsPerGen[slot.genId] || { taps: 0, spent: 0 };
        g.taps += t1; g.spent += eb1 - energy.owned;
      }
    }

    // Pass 2: redistribute leftover energy to any generator still active.
    for (const slot of [...requiredSlots, ...restSlots]) {
      if (energy.owned < 1) break;
      const def = catalogs.generatorCatalog[slot.genId];
      if (!def || !def.canGenerate) continue;
      if (slot.pool <= 0 || slot.cooldownUntil > currentTimeMins) {
        if (profileCfg.noCooldown) { slot.pool = def.maxPool; slot.cooldownUntil = 0; }
        else continue;
      }
      const eb2 = energy.owned;
      const t2  = _tapGeneratorSlot(slot, def, state, catalogs, currentTimeMins, requiredItems, profileCfg, undefined);
      if (t2 > 0) {
        const g = tapsPerGen[slot.genId] = tapsPerGen[slot.genId] || { taps: 0, spent: 0 };
        g.taps += t2; g.spent += eb2 - energy.owned;
      }
    }

    // One log entry per tapped generator — shows machine name, tap count, energy cost
    for (const [genId, info] of Object.entries(tapsPerGen)) {
      const def = catalogs.generatorCatalog[genId];
      if (!def) continue;
      state.eventLog.push({
        day: state.day, scene: state.progress.scene,
        type: 'energy_spend', amount: -info.spent,
        detail: `Tapped: ${def.type} Lv${def.gameTier || def.level} ×${info.taps} (−${info.spent}⚡)`
      });
    }
  }

  // After merging, items that match an itemExpand entry can be expanded into needed results.
  // Costs energy per expand. Player chooses to expand only when the result is a needed item.
  function expandItems(state, catalogs, requiredItems) {
    const SimEnergy = _energy();
    const SimBoard  = _board();
    const expandCatalog = catalogs.itemExpandCatalog || {};

    const expandLog = {}; // sourceId → { count, spent, resultId }
    let changed = true;
    while (changed) {
      changed = false;
      for (const sourceId in expandCatalog) {
        const def = expandCatalog[sourceId];
        if (!def || !def.resultIds || !def.resultIds.length) continue;
        // Expand if any result is needed OR the source itself is in the required
        // chain (traced back via walkBackSources for a merge-chain product).
        const anyNeeded = def.resultIds.some(rid => requiredItems.itemIds.has(rid))
          || requiredItems.itemIds.has(sourceId);
        if (!anyNeeded) continue;
        const have = SimBoard.itemCount(state.board, sourceId);
        if (have < 1) continue;
        // Guard 1: don't expand items directly reserved for orders or cooking.
        const directNeed = (requiredItems.neededQty || {})[sourceId] || 0;
        // Guard 2: don't expand merge-chain base items needed to produce higher-tier
        // required items in the same family (e.g. Ice Cube needed for Milk Bottle/Yogurt
        // must not all be expanded to Glass Bottle).
        let mergeChainNeed = 0;
        const srcMeta = (catalogs.itemTierMap || {})[sourceId];
        if (srcMeta && requiredItems.itemIds.has(sourceId)) {
          for (const [needId, needQty] of Object.entries(requiredItems.neededQty || {})) {
            const m = (catalogs.itemTierMap || {})[needId];
            if (m && m.family === srcMeta.family && m.tier > srcMeta.tier)
              mergeChainNeed += needQty * (1 << (m.tier - srcMeta.tier));
          }
        }
        if (have <= directNeed + mergeChainNeed) continue;
        const cost = def.costEnergy || 0;
        if (state.energy.owned < cost) break;
        SimBoard.consumeItem(state.board, sourceId, 1);
        if (cost > 0) {
          SimEnergy.spend(state.energy, cost);
          state.economy.energy.spent += cost;
        }
        // Add ALL results (e.g. Coconut → Coconut Water + Coconut Shell simultaneously)
        def.resultIds.forEach(rid => SimBoard.addItem(state.board, rid, 1));
        const ex = expandLog[sourceId] = expandLog[sourceId] || { count: 0, spent: 0, resultId: def.resultIds[0] };
        ex.count++; ex.spent += cost;
        changed = true;
      }
    }
    // Emit one log entry per expanded source item
    for (const [srcId, info] of Object.entries(expandLog)) {
      const srcName = (catalogs.itemNames || {})[srcId] || srcId;
      const resName = (catalogs.itemNames || {})[info.resultId] || info.resultId;
      const costStr = info.spent > 0 ? ` (−${info.spent}⚡)` : '';
      state.eventLog.push({
        day: state.day, scene: state.progress.scene,
        type: 'energy_spend', amount: -info.spent,
        detail: `Expanded: ${srcName} → ${resName} ×${info.count}${costStr}`
      });
    }
  }

  const GEM_COST_INVENTORY_EXPAND  = 10;
  const GEM_COST_INSTANT_COOK_RATE = 60;  // 1 gem per 60 seconds of cook time
  // BuyCurrency.csv — Diamonds cost per 100 energy, escalates per purchase within the day
  const ENERGY_BUY_COSTS  = [10, 20, 40, 80, 160];
  const ENERGY_BUY_AMOUNT = 100;

  function handleFullBoard(state, catalogs, itemId, requiredItems, profileCfg) {
    const SimBoard = _board();
    const { board, progress } = state;
    // Unlimited capacity: just add without selling anything
    if (board.unlimitedCapacity) { SimBoard.addItem(board, itemId, 1); return; }
    const isNeeded = requiredItems.itemIds && requiredItems.itemIds.has(itemId);

    if (profileCfg.playerType === 'spender' && isNeeded) {
      // Only expand inventory when the item is actually needed by pending orders
      if (state.gems >= GEM_COST_INVENTORY_EXPAND) {
        state.gems -= GEM_COST_INVENTORY_EXPAND;
        state.economy.gems.spent += GEM_COST_INVENTORY_EXPAND;
        state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'gem_spend', amount: -GEM_COST_INVENTORY_EXPAND, detail: 'Inventory +1 slot' });
      }
      SimBoard.expandInventory(board);
      SimBoard.addItem(board, itemId, 1);
    } else {
      // f2p or spender with non-needed item: sell cheapest surplus item, then add
      const gold = SimBoard.sellCheapestItem(board, catalogs.itemSellPrices, requiredItems.itemIds || new Set());
      progress.goldBank += gold;
      state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'board_full', amount: gold, detail: `Board full — sold item for ${gold}g` });
      SimBoard.addItem(board, itemId, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Try to complete orders that have all required items
  // ---------------------------------------------------------------------------
  function tryCompleteOrders(state, catalogs) {
    const SimBoard = _board();
    const { board, progress, economy } = state;
    const scene = catalogs.sceneCatalog[progress.sceneIndex];
    if (!scene) return;

    // Only attempt the first incomplete batch — batches must complete in order
    const batchId = scene.batchIds.find(id => !progress.completedBatchIds.has(id));
    if (!batchId) return;
    {
      const batch = catalogs.batchMap[batchId];
      if (!batch) return;

      let batchComplete = true;
      for (const orderId of batch.orderIds) {
        if (progress.completedOrderIds.has(orderId)) continue;
        const detail = catalogs.orderDetailMap[orderId];
        if (!detail) {
          // No detail entry = tutorial/cutscene order with no item requirement — auto-complete
          progress.completedOrderIds.add(orderId);
          continue;
        }

        // Check if all items available — skip blocked orders but keep trying others.
        // A batch is complete only when ALL orders are done, but individual orders
        // within a batch can complete in any order (matches real game behavior).
        const canFulfill = detail.items.every(({ itemId, qty }) =>
          SimBoard.itemCount(board, itemId) >= qty
        );
        if (!canFulfill) { batchComplete = false; continue; }

        // Consume items and earn gold
        detail.items.forEach(({ itemId, qty }) => SimBoard.consumeItem(board, itemId, qty));
        progress.goldBank += detail.gold;
        progress.goldEarned += detail.gold;
        economy.gold.received += detail.gold;
        progress.completedOrderIds.add(String(orderId));
        state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'gold_earn', amount: detail.gold, orderId: String(orderId), detail: `Order ${orderId} +${detail.gold}g` });

        // Claim order rewards
        claimOrderRewards(orderId, state, catalogs);
      }

      if (batchComplete && batch.orderIds.every(id => progress.completedOrderIds.has(id))) {
        progress.completedBatchIds.add(batchId);
        progress.batchesDone++;
        progress.level++;
        state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'level_up', amount: progress.level,
          detail: `Lv${progress.level} — Batch ${batchId} complete · Energy spent: ${state.economy.energy.spent}` });
        state.eventLog.push({
          day: state.day,
          scene: state.progress.scene,
          type: 'batch_complete',
          amount: 0,
          detail: `Batch ${batchId} complete`
        });
        claimBatchRewards(batchId, state, catalogs);
      }
    }
  }

  // Generator reset: each generator has its own gem_to_min cost from catalog (def.gemToMin).
  // Restores pool to def.minPool (not maxPool — natural cooldown restores maxPool for free).

  function _claimReward(r, state, catalogs, context) {
    const SimBoard  = _board();
    const SimEnergy = _energy();
    const qty = r.qty || 1;
    if (r.itemId) {
      const genDef = catalogs.generatorCatalog[r.itemId];
      if (genDef) {
        // Functional generator (Lv4+): place into board.generators so it can be tapped
        for (let q = 0; q < qty; q++) {
          SimBoard.addGenerator(state.board, r.itemId, catalogs.generatorCatalog);
        }
        state.eventLog.push({
          day: state.day, scene: state.progress.scene,
          type: 'gen_receive', amount: qty,
          detail: `Generator: ${genDef.type} Lv${genDef.gameTier || genDef.level} ×${qty}${context ? ' [' + context + ']' : ''}`,
          itemId: r.itemId
        });
      } else if (catalogs.generatorItemIds && catalogs.generatorItemIds.has(r.itemId)) {
        // Non-functional generator (tier 1-3). Upgrade to first functional level of this
        // family so the simulation can actually tap it — mirrors the real game giving the
        // player a usable generator after earning this reward.
        const family = r.itemId.slice(0, 4);
        const firstFuncGen = Object.values(catalogs.generatorCatalog)
          .filter(g => g.id.startsWith(family) && g.canGenerate)
          .sort((a, b) => a.level - b.level)[0];
        if (firstFuncGen) {
          for (let q = 0; q < qty; q++) {
            SimBoard.addGenerator(state.board, firstFuncGen.id, catalogs.generatorCatalog);
          }
          state.eventLog.push({
            day: state.day, scene: state.progress.scene,
            type: 'gen_receive', amount: qty,
            detail: `Generator: ${firstFuncGen.type} Lv${firstFuncGen.gameTier || firstFuncGen.level} ×${qty}${context ? ' [' + context + ']' : ''}`,
            itemId: firstFuncGen.id
          });
        } else {
          SimBoard.addItem(state.board, r.itemId, qty);
          state.eventLog.push({
            day: state.day, scene: state.progress.scene,
            type: 'gen_receive', amount: qty,
            detail: `Generator (low lv): ${r.itemId} ×${qty} — needs merge${context ? ' [' + context + ']' : ''}`,
            itemId: r.itemId
          });
        }
      } else {
        SimBoard.addItem(state.board, r.itemId, qty);
        // Log tool rewards so players can see which tool tier they received and from where
        const toolPrefix = r.itemId.slice(0, 4);
        const toolDef = catalogs.toolCatalog && catalogs.toolCatalog[toolPrefix];
        if (toolDef) {
          const toolName = toolDef.name || toolPrefix;
          const tier = catalogs.itemTierMap && catalogs.itemTierMap[r.itemId]
            ? catalogs.itemTierMap[r.itemId].tier : null;
          const lvStr = tier ? ` Lv${tier}` : '';
          state.eventLog.push({
            day: state.day, scene: state.progress.scene,
            type: 'tool', amount: qty,
            detail: `Tool: ${toolName}${lvStr} ×${qty}${context ? ' [' + context + ']' : ''}`,
            itemId: toolPrefix
          });
        }
      }
    } else if (r.currency === 'energy') {
      SimEnergy.inject(state.energy, r.amount, state.economy);
      state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'energy_reward', amount: r.amount,
        detail: `Energy +${r.amount}⚡${context ? ' [' + context + ']' : ''}` });
    } else if (r.currency === 'gems') {
      state.gems += r.amount;
      state.economy.gems.received += r.amount;
    } else if (r.currency === 'gold') {
      state.progress.goldBank += r.amount;
      state.economy.gold.received += r.amount;
    }
  }

  function _sceneShort(s) { return (s || '').replace('Scene_0', 'S').replace('Scene_', 'S'); }

  function claimBatchRewards(batchId, state, catalogs) {
    const batch = catalogs.batchMap[batchId];
    const ctx = batch ? `Batch ${batchId} · ${_sceneShort(batch.scene)}` : `Batch ${batchId}`;
    catalogs.rewardSchedule
      .filter(r => r.trigger === 'batch' && r.batchId === batchId)
      .forEach(r => _claimReward(r, state, catalogs, ctx));
  }

  // ---------------------------------------------------------------------------
  // Reward claiming
  // ---------------------------------------------------------------------------
  function claimOrderRewards(orderId, state, catalogs) {
    catalogs.rewardSchedule
      .filter(r => r.trigger === 'order' && r.orderId === orderId)
      .forEach(r => _claimReward(r, state, catalogs, `Order ${orderId}`));
  }

  function claimBuildStepRewards(scene, stepId, state, catalogs) {
    catalogs.rewardSchedule
      .filter(r => r.trigger === 'buildStep' && r.scene === scene && r.stepId === stepId)
      .forEach(r => _claimReward(r, state, catalogs, `Build ${_sceneShort(scene)} step ${stepId}`));
  }

  // ---------------------------------------------------------------------------
  // Spend gold on build steps (greedy)
  // ---------------------------------------------------------------------------
  function spendGoldOnBuild(state, catalogs) {
    const { progress } = state;
    const scene = catalogs.sceneCatalog[progress.sceneIndex];
    if (!scene) return;

    let keepSpending = true;
    while (keepSpending) {
      const stepIdx = progress.buildStepsDone;
      if (stepIdx >= scene.buildSteps.length) break;
      const step = scene.buildSteps[stepIdx];
      if (progress.goldBank < step.goldCost) break;
      progress.goldBank -= step.goldCost;
      state.economy.gold.spent += step.goldCost;
      progress.buildStepsDone++;
      state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'gold_spend', amount: -step.goldCost, detail: `Build step ${progress.buildStepsDone} −${step.goldCost}g` });
      claimBuildStepRewards(scene.name, step.stepId, state, catalogs);
      // Check if we can still afford next step
      keepSpending = progress.buildStepsDone < scene.buildSteps.length;
    }
  }

  // ---------------------------------------------------------------------------
  // Scene completion check
  // ---------------------------------------------------------------------------
  function checkSceneComplete(state, catalogs) {
    const { progress } = state;
    const scene = catalogs.sceneCatalog[progress.sceneIndex];
    if (!scene) return;

    const allBuildDone = progress.buildStepsDone >= scene.buildSteps.length;
    const allBatchesDone = scene.batchIds.every(id => progress.completedBatchIds.has(id));

    if (allBuildDone && allBatchesDone) {
      progress.sceneIndex++;
      progress.buildStepsDone = 0;
      const nextScene = catalogs.sceneCatalog[progress.sceneIndex];
      if (nextScene) progress.scene = nextScene.name;
    } else {
      // Only push one scene_debug event per day (function is called once per session inside tickDay)
      const alreadyLogged = state.eventLog.some(e => e.type === 'scene_debug' && e.day === state.day);
      if (!alreadyLogged) {
        const batchesDoneCount = scene.batchIds.filter(id => progress.completedBatchIds.has(id)).length;
        state.eventLog.push({
          type: 'scene_debug',
          day: state.day,
          scene: state.progress.scene,
          allBuildDone,
          allBatchesDone,
          buildStepsDone: progress.buildStepsDone,
          totalBuildSteps: scene.buildSteps.length,
          batchesDoneCount,
          totalBatches: scene.batchIds.length,
          amount: 0,
          detail: `Scene stall: build ${progress.buildStepsDone}/${scene.buildSteps.length} · batches ${batchesDoneCount}/${scene.batchIds.length}`
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // applyPurchase
  // ---------------------------------------------------------------------------
  function applyPurchase(state, purchase, iapCatalog) {
    const SimBoard  = _board();
    const SimEnergy = _energy();

    const packages = iapCatalog[purchase.packageKey];
    if (!packages) return;
    const pkg = packages.find(p => p.id === purchase.packageId);
    if (!pkg) return;

    const qty = purchase.quantity || 1;
    const pkgName = pkg.name || purchase.packageKey;
    for (let q = 0; q < qty; q++) {
      pkg.contents.forEach(content => {
        if (content.type === 'energy') {
          SimEnergy.inject(state.energy, content.amount, state.economy);
          state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'energy_reward', amount: content.amount, detail: `IAP energy +${content.amount} (${pkgName})` });
        } else if (content.type === 'gems') {
          state.gems += content.amount;
          state.economy.gems.received += content.amount;
          state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'gem_receive', amount: content.amount, detail: `IAP gems +${content.amount} (${pkgName})` });
        } else if (content.type === 'gold') {
          state.progress.goldBank += content.amount;
          state.economy.gold.received += content.amount;
          state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'gold_earn', amount: content.amount, detail: `IAP gold +${content.amount} (${pkgName})` });
        } else if (content.type === 'item') {
          SimBoard.addItem(state.board, content.itemId, content.qty || 1);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // tickDay — main simulation loop
  // ---------------------------------------------------------------------------
  // Direct-energy mode: skip generator simulation entirely.
  // For each order in the current batch, pay its energy cost (sum of item energy costs)
  // directly from the player's energy pool, then complete it immediately.
  // ---------------------------------------------------------------------------
  function _directEnergySession(state, catalogs, profileCfg) {
    const SimEnergy = _energy();
    const { energy, economy, progress } = state;
    const energyCosts = catalogs.itemEnergyCosts || {};

    let anyDone = true;
    while (anyDone) {
      anyDone = false;
      const scene = catalogs.sceneCatalog[progress.sceneIndex];
      if (!scene) break;

      const batchId = scene.batchIds.find(id => !progress.completedBatchIds.has(id));
      if (!batchId) { checkSceneComplete(state, catalogs); break; }
      const batch = catalogs.batchMap[batchId];
      if (!batch) break;

      let batchComplete = true;
      for (const orderId of batch.orderIds) {
        if (progress.completedOrderIds.has(orderId)) continue;
        const detail = catalogs.orderDetailMap[orderId];
        if (!detail) { progress.completedOrderIds.add(orderId); anyDone = true; continue; }

        const cost = detail.items.reduce((s, { itemId, qty }) =>
          s + (energyCosts[itemId] || 0) * qty, 0);

        if (energy.owned < cost) { batchComplete = false; continue; }

        SimEnergy.spend(energy, cost);
        economy.energy.spent += cost;
        progress.goldBank  += detail.gold;
        progress.goldEarned += detail.gold;
        economy.gold.received += detail.gold;
        progress.completedOrderIds.add(String(orderId));
        state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'energy_spend', amount: -cost,
          detail: `Order ${orderId} −${cost}⚡ → +${detail.gold}g` });
        state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'gold_earn', amount: detail.gold, orderId: String(orderId),
          detail: `Order ${orderId} +${detail.gold}g` });
        claimOrderRewards(orderId, state, catalogs);
        anyDone = true;
      }

      if (batchComplete && batch.orderIds.every(id => progress.completedOrderIds.has(id))) {
        progress.completedBatchIds.add(batchId);
        progress.batchesDone++;
        progress.level++;
        state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'level_up', amount: progress.level,
          detail: `Lv${progress.level} — Batch ${batchId} complete` });
        state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'batch_complete', amount: 0, detail: `Batch ${batchId} complete` });
        claimBatchRewards(batchId, state, catalogs);
        anyDone = true;
      }

      spendGoldOnBuild(state, catalogs);
      checkSceneComplete(state, catalogs);
    }
  }

  // ---------------------------------------------------------------------------
  function tickDay(state, catalogs, profileCfg) {
    const SimEnergy = _energy();
    const SimBoard  = _board();
    const SimCooking = _cooking();

    state.day++;

    // Apply scheduled purchases for this day
    (profileCfg.purchases || [])
      .filter(p => p.day === state.day)
      .forEach(p => applyPurchase(state, p, catalogs.iapCatalog));

    const sessions = getSessionCount(profileCfg);
    // For intervalHours mode use the exact interval (e.g. 3h → 180 mins).
    // For sessionsPerDay mode divide the day evenly.
    const minsPerSession = profileCfg.sessionMode === 'interval'
      ? (profileCfg.intervalHours * 60)
      : (1440 / sessions);

    // Reset all daily gem-spend counters
    state.energyBuyCount    = 0;
    state.gemGenResetCount  = 0;
    state.gemInstantCookCount = 0;

    for (let s = 0; s < sessions; s++) {
      const sessionStartMins = getSessionStartMins(state.day, s, profileCfg);
      state.timeMins = sessionStartMins;

      // a. Regen energy for time elapsed since last session
      // Capture energy before regen to correctly track actual regen received (capped)
      const ownedBefore = state.energy.owned;
      if (profileCfg.directEnergyMode) {
        // Direct mode: accumulate without cap so orders costing more than cap can be paid
        state.energy.owned += state.energy.regenPerMin * minsPerSession;
      } else {
        SimEnergy.tick(state.energy, minsPerSession);
      }
      const actualRegen = state.energy.owned - ownedBefore;
      if (actualRegen > 0) {
        state.economy.energy.received += actualRegen;
        state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'energy_reward', amount: actualRegen,
          detail: `Regen +${Math.round(actualRegen)}⚡ (session ${s + 1})` });
      }

      // b. Spender priority 1: buy energy with gems before doing anything else this session
      if (profileCfg.playerType === 'spender') _tryBuyEnergy(state, profileCfg);

      // Direct-energy mode: skip generator pipeline entirely
      if (profileCfg.directEnergyMode) { _directEnergySession(state, catalogs, profileCfg); continue; }

      // c. Refill generators whose cooldown elapsed
      SimBoard.refillGenerators(state.board, catalogs.generatorCatalog, sessionStartMins);

      // d. Process completed cooking
      _trackCookEvents(SimCooking.processCooking(state.board, sessionStartMins), state, catalogs);

      // e+f. Determine required items and demand-driven merge
      const required = getRequiredItems(state, catalogs);
      SimBoard.mergeGenerators(state.board, required.genIds, catalogs.generatorCatalog)
        .forEach(e => state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'gen_receive', amount: 1,
          detail: `Merged: ${e.fromType} Lv${e.fromLevel} ×2 → ${e.toType} Lv${e.toLevel}` }));
      _logToolMergeUpgrade(SimBoard.mergeAndUpgradeTools(state.board, catalogs.toolCatalog, catalogs.itemTierMap || {}), state, catalogs);

      // Pre-tap: merge leftover items from prior sessions and expand any sources
      // (uses a little energy before main tapping). This mimics a player who
      // first clears the board before farming new items.
      _trackMergeStats(SimBoard.mergeItems(state.board, required.neededQty, catalogs.familyChain, required.maxTierByFamily), state);
      _logPromotedGenerators(SimBoard.promoteGeneratorItems(state.board, catalogs.generatorCatalog), state, catalogs);
      expandItems(state, catalogs, required);

      // g. Tap generators until energy runs out
      tapGenerators(state, catalogs, sessionStartMins, required, profileCfg);

      // g2. Item-level merge again on newly spawned items
      _trackMergeStats(SimBoard.mergeItems(state.board, required.neededQty, catalogs.familyChain, required.maxTierByFamily), state);
      _logPromotedGenerators(SimBoard.promoteGeneratorItems(state.board, catalogs.generatorCatalog), state, catalogs);

      // g3. Best-effort expand on what's left (only fires if energy remains)
      expandItems(state, catalogs, required);

      // h. Start cooking only when have + in-progress < needed.
      // Items with a tracked neededQty use the count check to avoid starting duplicate
      // cooks when a previous cook is still running in a parallel tool slot.
      // Items traced only structurally (neededQty=0) fall back to old "always try" behaviour.
      const cookingCount = {};
      state.board.tools.forEach(t => {
        if (t.cooking) cookingCount[t.cooking.resultId] = (cookingCount[t.cooking.resultId] || 0) + 1;
      });
      const pendingItems = [...required.itemIds].filter(id => {
        if (!SimCooking.findRecipe(catalogs.toolCatalog, id)) return false;
        const needed = (required.neededQty || {})[id] || 0;
        if (needed === 0) return true; // structural need — unknown qty, always try
        return SimBoard.itemCount(state.board, id) + (cookingCount[id] || 0) < needed;
      });
      SimCooking.tryStartAllCooking(state.board, catalogs.toolCatalog, pendingItems, sessionStartMins);
      // Instant-cook mode: complete all queued cooking within the same session
      if (profileCfg.instantCook) {
        _trackCookEvents(SimCooking.processCooking(state.board, state.timeMins + 999999), state, catalogs);
      }

      // h2. Spender: use gems to instantly finish cooking for needed results.
      // Gem cost = ceil(timeSecs / GEM_COST_INSTANT_COOK_RATE), min 1.
      if (profileCfg.playerType === 'spender') {
        let anyCook = false;
        const maxCooks = profileCfg.gemInstantCooksPerDay ?? Infinity;
        state.board.tools.forEach(slot => {
          if (!slot.cooking) return;
          if (state.gemInstantCookCount >= maxCooks) return;
          if (!required.itemIds.has(slot.cooking.resultId)) return;
          const recipe = _cooking().findRecipe(catalogs.toolCatalog, slot.cooking.resultId);
          const timeSecs = recipe ? (recipe.timeSecs || 1) : 1;
          if (timeSecs < 60) return; // short recipes complete naturally — no gem needed
          const gemCost = Math.max(1, Math.ceil(timeSecs / GEM_COST_INSTANT_COOK_RATE));
          if (state.gems < gemCost) return;
          state.gems -= gemCost;
          state.economy.gems.spent += gemCost;
          state.gemInstantCookCount++;
          state.eventLog.push({ day: state.day, scene: state.progress.scene, type: 'gem_spend',
            amount: -gemCost, detail: `Instant cook: ${slot.cooking.resultId} (${gemCost}💎)` });
          slot.cooking.doneAt = sessionStartMins;
          anyCook = true;
        });
        // Process instantly-completed recipes so items are available this same session
        if (anyCook) _trackCookEvents(SimCooking.processCooking(state.board, sessionStartMins), state, catalogs);
      }

      // i. Complete fulfilled orders
      tryCompleteOrders(state, catalogs);

      // j. Spend gold on build steps
      spendGoldOnBuild(state, catalogs);

      // k. Already handled in tryCompleteOrders / spendGoldOnBuild (rewards claimed inline)

      // l. Merge generators again after new rewards/items
      const required2 = getRequiredItems(state, catalogs);
      SimBoard.mergeGenerators(state.board, required2.genIds, catalogs.generatorCatalog)
        .forEach(e => state.eventLog.push({ day: state.day, scene: state.progress.scene,
          type: 'gen_receive', amount: 1,
          detail: `Merged: ${e.fromType} Lv${e.fromLevel} ×2 → ${e.toType} Lv${e.toLevel}` }));
      _logToolMergeUpgrade(SimBoard.mergeAndUpgradeTools(state.board, catalogs.toolCatalog, catalogs.itemTierMap || {}), state, catalogs);

      // m. Check if current scene is complete
      checkSceneComplete(state, catalogs);
    }

    // 5. Process any remaining cooking at end of day
    _trackCookEvents(SimCooking.processCooking(state.board, state.day * 1440), state, catalogs);

    // 6. Build and append dayLog
    const dayLog = {
      day: state.day,
      scene: state.progress.scene,
      sceneIndex: state.progress.sceneIndex,
      buildStepsDone: state.progress.buildStepsDone,
      goldEarned: state.progress.goldEarned,
      economy: {
        energy: { ...state.economy.energy },
        gems:   { ...state.economy.gems },
        gold:   { ...state.economy.gold }
      }
    };
    state.log.push(dayLog);

    return { dayLog };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  const exports = { createState, tickDay, applyPurchase };
  if (typeof module !== 'undefined') module.exports = exports;
  if (typeof window !== 'undefined') window.SimEngine = exports;
  return exports;
})();
