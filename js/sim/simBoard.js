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
    return BOARD_CAPACITY - board.generators.length - board.tools.length - board.boardItemCount;
  }

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

  function addItem(board, itemId, qty) {
    qty = qty || 1;
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

  function mergeGenerators(board, requiredGenIds, catalog) {
    let changed = true;
    while (changed) {
      changed = false;
      const counts = {};
      board.generators.forEach(g => { counts[g.genId] = (counts[g.genId] || 0) + 1; });
      for (const [genId, count] of Object.entries(counts)) {
        if (count < 2 || (requiredGenIds && requiredGenIds.has(genId))) continue;
        const def = catalog[genId];
        if (!def) continue;
        const nextId = findNextLevelGen(def.type, genId, catalog);
        if (!nextId) continue;
        // Never merge past the highest required level
        const nextDef = catalog[nextId];
        if (nextDef && requiredGenIds && requiredGenIds.size > 0) {
          const maxRequired = Math.max(...[...requiredGenIds]
            .map(id => (catalog[id] || {}).level || 0));
          if (nextDef.level > maxRequired) continue;
        }
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
      .filter(id => (board.boardItems[id] || 0) > 0 && !requiredItems.has(id))
      .sort((a, b) => (sellPrices[a] || 0) - (sellPrices[b] || 0));
    if (!candidates.length) return 0;
    const id = candidates[0];
    board.boardItems[id]--;
    board.boardItemCount--;
    if (board.boardItems[id] === 0) delete board.boardItems[id];
    return sellPrices[id] || 0;
  }

  function expandInventory(board) { board.inventoryCapacity++; }

  const exports = {
    create, slotsUsed, slotsAvailable, boardItemCount,
    addGenerator, addTool, addItem, consumeItem, itemCount,
    tapGenerator, refillGenerators, mergeGenerators,
    sellCheapestItem, expandInventory, findNextLevelGen
  };
  if (typeof module !== 'undefined') module.exports = exports;
  return exports;
})();
