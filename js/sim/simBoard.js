// js/sim/simBoard.js
const SimBoard = (() => {
  const BOARD_CAPACITY = 63;
  const DEFAULT_INVENTORY = 15;

  function create({ inventoryCapacity = DEFAULT_INVENTORY } = {}) {
    return {
      generators: [],
      tools: [],
      boardItems: {},
      boardItemCount: 0,
      inventoryItems: {},
      inventoryCount: 0,
      inventoryCapacity
    };
  }

  function slotsUsed(board) {
    return board.generators.length + board.tools.length + board.boardItemCount;
  }

  function boardItemCount(board) { return board.boardItemCount; }

  function slotsAvailable(board) {
    if (board.unlimitedCapacity) return 9999;
    return BOARD_CAPACITY - board.generators.length - board.tools.length - board.boardItemCount;
  }

  function addGenerator(board, genId, catalog) {
    if (!catalog[genId]) return false;
    if (slotsAvailable(board) <= 0) return false;
    board.generators.push({ genId, pool: catalog[genId].maxPool, cooldownUntil: 0 });
    return true;
  }

  function addTool(board, toolType, itemId) {
    if (slotsAvailable(board) <= 0) return false;
    board.tools.push({ toolType, itemId: itemId || null, cooking: null });
    return true;
  }

  function addItem(board, itemId, qty) {
    qty = qty || 1;
    if (board.unlimitedCapacity) {
      board.boardItems[itemId] = (board.boardItems[itemId] || 0) + qty;
      board.boardItemCount += qty;
      return true;
    }
    if (slotsAvailable(board) >= qty) {
      board.boardItems[itemId] = (board.boardItems[itemId] || 0) + qty;
      board.boardItemCount += qty;
      return true;
    }
    const invSpace = board.inventoryCapacity - board.inventoryCount;
    if (invSpace >= qty) {
      board.inventoryItems[itemId] = (board.inventoryItems[itemId] || 0) + qty;
      board.inventoryCount += qty;
      return true;
    }
    return false;
  }

  function consumeItem(board, itemId, qty) {
    qty = qty || 1;
    const onBoard = board.boardItems[itemId] || 0;
    if (onBoard >= qty) {
      board.boardItems[itemId] -= qty;
      board.boardItemCount -= qty;
      if (board.boardItems[itemId] === 0) delete board.boardItems[itemId];
      return true;
    }
    const total = onBoard + (board.inventoryItems[itemId] || 0);
    if (total < qty) return false;
    board.boardItemCount -= onBoard;
    if (onBoard > 0) delete board.boardItems[itemId];
    const fromInv = qty - onBoard;
    board.inventoryItems[itemId] -= fromInv;
    board.inventoryCount -= fromInv;
    if (board.inventoryItems[itemId] <= 0) delete board.inventoryItems[itemId];
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
    let cumRate = 0;
    let spawnedItemId = def.spawns[def.spawns.length - 1].itemId;
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

  // Returns array of {fromId, fromType, fromLevel, toId, toType, toLevel} for each merge that occurred.
  function mergeGenerators(board, requiredGenIds, catalog) {
    const events = [];
    let changed = true;
    while (changed) {
      changed = false;
      const counts = {};
      board.generators.forEach(g => { counts[g.genId] = (counts[g.genId] || 0) + 1; });
      for (const [genId, count] of Object.entries(counts)) {
        if (count < 2) continue;
        const def = catalog[genId];
        if (!def) continue;
        const nextId = findNextLevelGen(def.type, genId, catalog);
        if (!nextId) continue;
        const nextDef = catalog[nextId];
        let removed = 0;
        board.generators = board.generators.filter(g => {
          if (g.genId === genId && removed < 2) { removed++; return false; }
          return true;
        });
        board.generators.push({ genId: nextId, pool: (catalog[nextId] || {}).maxPool || 0, cooldownUntil: 0 });
        events.push({
          fromId: genId, fromType: def.type, fromLevel: def.gameTier || def.level,
          toId: nextId, toType: nextDef ? nextDef.type : def.type, toLevel: nextDef ? (nextDef.gameTier || nextDef.level) : '?'
        });
        changed = true;
        break;
      }
    }
    return events;
  }

  // Merge duplicate tool items in boardItems (2× same tier → 1× next tier),
  // then upgrade tool station with best available item if higher than current tier.
  // Returns [{kind:'merge'|'upgrade', toolType, fromTier, toTier}].
  function mergeAndUpgradeTools(board, toolCatalog, itemTierMap) {
    const events = [];
    for (const toolType of Object.keys(toolCatalog)) {
      // Phase 1: merge duplicate tool items of same tier
      let changed = true;
      while (changed) {
        changed = false;
        for (const [itemId, qty] of Object.entries(board.boardItems)) {
          const info = itemTierMap[itemId];
          if (!info || info.family !== toolType || qty < 2) continue;
          const nextId = info.family + String(info.tier + 1).padStart(2, '0');
          if (!itemTierMap[nextId]) continue;
          board.boardItems[itemId] -= 2;
          board.boardItemCount -= 2;
          if (!board.boardItems[itemId]) delete board.boardItems[itemId];
          board.boardItems[nextId] = (board.boardItems[nextId] || 0) + 1;
          board.boardItemCount++;
          events.push({ kind: 'merge', toolType, fromTier: info.tier, toTier: info.tier + 1 });
          changed = true;
          break;
        }
      }
      // Phase 2: upgrade station if a higher-tier item is available
      const slot = board.tools.find(t => t.toolType === toolType);
      if (!slot) continue;
      const stationTier = slot.itemId && itemTierMap[slot.itemId] ? itemTierMap[slot.itemId].tier : 0;
      const best = Object.entries(board.boardItems)
        .filter(([id, qty]) => itemTierMap[id] && itemTierMap[id].family === toolType && qty > 0)
        .map(([id]) => ({ id, tier: itemTierMap[id].tier }))
        .sort((a, b) => b.tier - a.tier)[0];
      if (best && best.tier > stationTier) {
        slot.itemId = best.id;
        board.boardItems[best.id]--;
        board.boardItemCount--;
        if (!board.boardItems[best.id]) delete board.boardItems[best.id];
        events.push({ kind: 'upgrade', toolType, fromTier: stationTier, toTier: best.tier });
      }
    }
    return events;
  }

  // Demand-driven item merge: 2× tier N → 1× tier N+1 in same family.
  //   neededQty: { [itemId]: qty } — qty of each item currently required by pending orders.
  //              Don't merge below this threshold (we need them for orders).
  //   familyChain: { [family]: [tier1Id, tier2Id, ...] }
  // For each family with a max needed tier maxN: merge surplus up to maxN.
  // For families with no needs (pure surplus): merge up to family top tier.
  function mergeItems(board, neededQty, familyChain, maxTierByFamily) {
    if (!familyChain) return [];
    neededQty = neededQty || {};
    maxTierByFamily = maxTierByFamily || {};
    const mergeEvents = [];

    const _qty = (id) => (board.boardItems[id] || 0) + (board.inventoryItems[id] || 0);
    const _consume = (id, n) => {
      // Consume from board first. When the board is bloated with low-tier surplus,
      // pulling from inventory leaves the board full → merged result can't be placed
      // → merge undoes and the chain stalls. Taking from board frees slots so each
      // merge step (consume 2, add 1) reduces board pressure by 1.
      const fromBoard = Math.min(n, board.boardItems[id] || 0);
      if (fromBoard > 0) {
        board.boardItems[id] -= fromBoard;
        board.boardItemCount -= fromBoard;
        if (board.boardItems[id] <= 0) delete board.boardItems[id];
      }
      const rest = n - fromBoard;
      if (rest > 0) {
        board.inventoryItems[id] -= rest;
        board.inventoryCount -= rest;
        if (board.inventoryItems[id] <= 0) delete board.inventoryItems[id];
      }
    };

    let changed = true;
    while (changed) {
      changed = false;
      for (const family in familyChain) {      // eslint-disable-line guard-for-in
        const chain = familyChain[family];
        if (!chain || chain.length < 2) continue;
        // Surplus (have - reserved-for-orders) is always safe to merge: needed
        // items remain reserved by neededQty. Families WITHOUT a current tier cap
        // compact junk to top tier to free board slots. Families WITH a cap stop
        // there — merging past the cap destroys items the chain still needs
        // (e.g. 2× needed Lv7 → 1× useless Lv8).
        const famCap = maxTierByFamily[family];
        for (let i = 0; i < chain.length - 1; i++) {
          if (famCap && (i + 2) > famCap) break; // chain[i+1] is tier i+2
          const curr = chain[i];
          const next = chain[i + 1];
          if (!curr || !next) continue;
          const have = _qty(curr);
          const need = neededQty[curr] || 0;
          const surplus = have - need;
          if (surplus < 2) continue;
          _consume(curr, 2);
          // Place merged result: board first, fallback to inventory.
          if (slotsAvailable(board) > 0) {
            board.boardItems[next] = (board.boardItems[next] || 0) + 1;
            board.boardItemCount++;
          } else if (board.inventoryCount < board.inventoryCapacity) {
            board.inventoryItems[next] = (board.inventoryItems[next] || 0) + 1;
            board.inventoryCount++;
          } else {
            // Both full: put back two of curr so we don't lose them.
            board.boardItems[curr] = (board.boardItems[curr] || 0) + 2;
            board.boardItemCount += 2;
            continue;
          }
          mergeEvents.push({ fromId: curr, toId: next });
          changed = true;
        }
      }
    }
    return mergeEvents;
  }

  function sellCheapestItem(board, sellPrices, requiredItems) {
    const candidates = Object.keys(board.boardItems)
      .filter(id => (board.boardItems[id] || 0) > 0 && !requiredItems.has(id))
      .sort((a, b) => (sellPrices[a] || 0) - (sellPrices[b] || 0));
    if (!candidates.length) return 0;
    const id = candidates[0];
    board.boardItems[id]--;
    board.boardItemCount--;
    if (board.boardItems[id] === 0) delete board.boardItems[id];
    return sellPrices[id] || 0;
  }

  // Quantity-aware sale: sell the cheapest board item whose count exceeds its
  // reserved quantity. Unlike sellCheapestItem's all-or-nothing set, this lets
  // a hoard of a needed item (have 24, need 1) shed its surplus copies.
  // Returns { sold, gold }.
  function sellSurplusItem(board, sellPrices, reserves) {
    const candidates = Object.keys(board.boardItems)
      .filter(id => (board.boardItems[id] || 0) > (reserves[id] || 0))
      .sort((a, b) => (sellPrices[a] || 0) - (sellPrices[b] || 0));
    if (!candidates.length) return { sold: false, gold: 0 };
    const id = candidates[0];
    board.boardItems[id]--;
    board.boardItemCount--;
    if (board.boardItems[id] === 0) delete board.boardItems[id];
    return { sold: true, gold: sellPrices[id] || 0 };
  }

  function expandInventory(board) { board.inventoryCapacity++; }

  // After mergeItems, any functional generator that ended up in boardItems/inventoryItems
  // must be moved into board.generators so it can be tapped.
  // Returns [{genId, count}] for each promoted generator type.
  function promoteGeneratorItems(board, generatorCatalog) {
    const promoted = [];
    const sources = [
      { map: board.boardItems,     isBoard: true },
      { map: board.inventoryItems, isBoard: false }
    ];
    for (const { map, isBoard } of sources) {
      for (const itemId of Object.keys(map)) {
        if (!generatorCatalog[itemId]) continue;
        const count = map[itemId] || 0;
        if (count <= 0) continue;
        delete map[itemId];
        if (isBoard) board.boardItemCount -= count;
        else         board.inventoryCount -= count;
        for (let i = 0; i < count; i++) {
          board.generators.push({ genId: itemId, pool: generatorCatalog[itemId].maxPool || 0, cooldownUntil: 0 });
        }
        promoted.push({ genId: itemId, count });
      }
    }
    return promoted;
  }

  const exports = {
    create, slotsUsed, slotsAvailable, boardItemCount,
    addGenerator, addTool, addItem, consumeItem, itemCount,
    tapGenerator, refillGenerators, mergeGenerators, mergeItems,
    mergeAndUpgradeTools,
    promoteGeneratorItems, sellCheapestItem, sellSurplusItem, expandInventory, findNextLevelGen
  };
  if (typeof module !== 'undefined') module.exports = exports;
  if (typeof window !== 'undefined') window.SimBoard = exports;
  return exports;
})();
