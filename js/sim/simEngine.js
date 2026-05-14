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
  function createState(catalogs, profileCfg, initialGens, initialTools) {
    const SimEnergy = _energy();
    const SimBoard  = _board();

    const energy = SimEnergy.create({
      regenPerMin: profileCfg.regenPerMin || 0.2,
      cap: profileCfg.cap || 100,
      initialOwned: profileCfg.initialOwned !== undefined ? profileCfg.initialOwned : 20
    });

    const board = SimBoard.create({ inventoryCapacity: profileCfg.inventoryCapacity || 15 });

    (initialGens || []).forEach(({ genId, qty }) => {
      for (let i = 0; i < (qty || 1); i++) {
        SimBoard.addGenerator(board, genId, catalogs.generatorCatalog);
      }
    });
    (initialTools || []).forEach(({ toolType }) => {
      SimBoard.addTool(board, toolType);
    });

    const firstScene = (catalogs.sceneCatalog[0] || {}).name || 'Scene_01';

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
    if (!scene) return { itemIds: new Set(), genIds: new Set() };

    const itemIds = new Set();
    const genIds  = new Set();

    scene.batchIds.forEach(batchId => {
      if (progress.completedBatchIds.has(batchId)) return;
      const batch = catalogs.batchMap[batchId];
      if (!batch) return;
      batch.orderIds.forEach(orderId => {
        if (progress.completedOrderIds.has(orderId)) return;
        const detail = catalogs.orderDetailMap[orderId];
        if (!detail) return;
        detail.items.forEach(({ itemId }) => {
          itemIds.add(itemId);
          // Trace back through recipes to find which generator produces ingredients
          traceIngredientsToGens(itemId, catalogs, itemIds, genIds);
        });
      });
    });

    return { itemIds, genIds };
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
  function tapGenerators(state, catalogs, currentTimeMins, requiredItems, profileCfg) {
    const SimEnergy = _energy();
    const SimBoard  = _board();
    const { board, energy, economy } = state;

    for (const slot of board.generators) {
      const def = catalogs.generatorCatalog[slot.genId];
      if (!def || !def.canGenerate || slot.pool <= 0 || slot.cooldownUntil > currentTimeMins) continue;

      // Keep tapping this generator while energy and pool allow
      while (energy.owned >= (def.costEnergy || 1) && slot.pool > 0 && slot.cooldownUntil <= currentTimeMins) {
        const cost = def.costEnergy || 1;
        if (!SimEnergy.spend(energy, cost)) break;
        economy.energy.spent += cost;

        const spawnedId = SimBoard.tapGenerator(board, slot.genId, catalogs.generatorCatalog, currentTimeMins);
        if (!spawnedId) break;

        // Expand item if it has an expand recipe
        let finalId = spawnedId;
        const expandDef = catalogs.itemExpandCatalog[spawnedId];
        if (expandDef && energy.owned >= expandDef.costEnergy) {
          SimEnergy.spend(energy, expandDef.costEnergy);
          economy.energy.spent += expandDef.costEnergy;
          finalId = expandDef.resultIds[0] || spawnedId;
        }

        // Add item to board; handle full board
        const added = SimBoard.addItem(board, finalId, 1);
        if (!added) {
          handleFullBoard(state, catalogs, finalId, requiredItems, profileCfg);
        }
      }
    }
  }

  function handleFullBoard(state, catalogs, itemId, requiredItems, profileCfg) {
    const SimBoard = _board();
    const { board, progress } = state;

    if (profileCfg.playerType === 'spender') {
      SimBoard.expandInventory(board);
      SimBoard.addItem(board, itemId, 1);
    } else {
      // f2p: sell cheapest non-required item, then add
      const gold = SimBoard.sellCheapestItem(board, catalogs.itemSellPrices, requiredItems.itemIds || new Set());
      progress.goldBank += gold;
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

    scene.batchIds.forEach(batchId => {
      if (progress.completedBatchIds.has(batchId)) return;
      const batch = catalogs.batchMap[batchId];
      if (!batch) return;

      let batchComplete = true;
      batch.orderIds.forEach(orderId => {
        if (progress.completedOrderIds.has(orderId)) return;
        const detail = catalogs.orderDetailMap[orderId];
        if (!detail) { batchComplete = false; return; }

        // Check if all items available
        const canFulfill = detail.items.every(({ itemId, qty }) =>
          SimBoard.itemCount(board, itemId) >= qty
        );
        if (!canFulfill) { batchComplete = false; return; }

        // Consume items and earn gold
        detail.items.forEach(({ itemId, qty }) => SimBoard.consumeItem(board, itemId, qty));
        progress.goldBank += detail.gold;
        progress.goldEarned += detail.gold;
        economy.gold.received += detail.gold;
        progress.completedOrderIds.add(orderId);

        // Claim order rewards
        claimOrderRewards(orderId, state, catalogs);
      });

      if (batchComplete && batch.orderIds.every(id => progress.completedOrderIds.has(id))) {
        progress.completedBatchIds.add(batchId);
        progress.batchesDone++;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Reward claiming
  // ---------------------------------------------------------------------------
  function claimOrderRewards(orderId, state, catalogs) {
    const SimBoard  = _board();
    const SimEnergy = _energy();

    catalogs.rewardSchedule
      .filter(r => r.trigger === 'order' && r.orderId === orderId)
      .forEach(r => {
        if (r.itemId) {
          SimBoard.addItem(state.board, r.itemId, r.qty || 1);
        } else if (r.currency === 'energy') {
          SimEnergy.inject(state.energy, r.amount, state.economy);
        } else if (r.currency === 'gems') {
          state.gems += r.amount;
          state.economy.gems.received += r.amount;
        } else if (r.currency === 'gold') {
          state.progress.goldBank += r.amount;
          state.economy.gold.received += r.amount;
        }
      });
  }

  function claimBuildStepRewards(scene, stepId, state, catalogs) {
    const SimBoard  = _board();
    const SimEnergy = _energy();

    catalogs.rewardSchedule
      .filter(r => r.trigger === 'buildStep' && r.scene === scene && r.stepId === stepId)
      .forEach(r => {
        if (r.itemId) {
          SimBoard.addItem(state.board, r.itemId, r.qty || 1);
        } else if (r.currency === 'energy') {
          SimEnergy.inject(state.energy, r.amount, state.economy);
        } else if (r.currency === 'gems') {
          state.gems += r.amount;
          state.economy.gems.received += r.amount;
        } else if (r.currency === 'gold') {
          state.progress.goldBank += r.amount;
          state.economy.gold.received += r.amount;
        }
      });
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
      progress.buildStepsDone++;
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
    for (let q = 0; q < qty; q++) {
      pkg.contents.forEach(content => {
        if (content.type === 'energy') {
          SimEnergy.inject(state.energy, content.amount, state.economy);
        } else if (content.type === 'gems') {
          state.gems += content.amount;
          state.economy.gems.received += content.amount;
        } else if (content.type === 'gold') {
          state.progress.goldBank += content.amount;
          state.economy.gold.received += content.amount;
        } else if (content.type === 'item') {
          SimBoard.addItem(state.board, content.itemId, content.qty || 1);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // tickDay — main simulation loop
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
    const minsPerSession = 1440 / sessions;

    for (let s = 0; s < sessions; s++) {
      const sessionStartMins = getSessionStartMins(state.day, s, profileCfg);
      state.timeMins = sessionStartMins;

      // a. Regen energy for time elapsed since last session
      SimEnergy.tick(state.energy, minsPerSession);
      // b. Track regen received (approximate — capped at cap)
      const regenAmount = Math.min(
        state.energy.regenPerMin * minsPerSession,
        state.energy.cap - (state.energy.owned - state.energy.regenPerMin * minsPerSession)
      );
      state.economy.energy.received += Math.max(0, regenAmount);

      // c. Refill generators whose cooldown elapsed
      SimBoard.refillGenerators(state.board, catalogs.generatorCatalog, sessionStartMins);

      // d. Process completed cooking
      SimCooking.processCooking(state.board, sessionStartMins);

      // e+f. Determine required items and demand-driven merge
      const required = getRequiredItems(state, catalogs);
      SimBoard.mergeGenerators(state.board, required.genIds, catalogs.generatorCatalog);

      // g. Tap generators until energy runs out
      tapGenerators(state, catalogs, sessionStartMins, required, profileCfg);

      // h. Try to start cooking for needed items
      const pendingItems = [...required.itemIds].filter(id =>
        _cooking().findRecipe(catalogs.toolCatalog, id)
      );
      SimCooking.tryStartAllCooking(state.board, catalogs.toolCatalog, pendingItems, sessionStartMins);

      // i. Complete fulfilled orders
      tryCompleteOrders(state, catalogs);

      // j. Spend gold on build steps
      spendGoldOnBuild(state, catalogs);

      // k. Already handled in tryCompleteOrders / spendGoldOnBuild (rewards claimed inline)

      // l. Merge generators again after new rewards/items
      const required2 = getRequiredItems(state, catalogs);
      SimBoard.mergeGenerators(state.board, required2.genIds, catalogs.generatorCatalog);

      // m. Check if current scene is complete
      checkSceneComplete(state, catalogs);
    }

    // 5. Process any remaining cooking at end of day
    SimCooking.processCooking(state.board, state.day * 1440);

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
  return exports;
})();
