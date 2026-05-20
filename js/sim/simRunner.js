// js/sim/simRunner.js
const SimRunner = (() => {
  const _engine = () => typeof module !== 'undefined' ? require('./simEngine') : window.SimEngine;

  // Tool items in the game use 6-digit IDs; the tool catalog is keyed by 4-digit toolType.
  // e.g. item 200203 → toolType '2002' (Chef Counter).
  function _itemIdToToolType(itemId, toolCatalog) {
    const prefix = itemId.slice(0, 4);
    return toolCatalog[prefix] ? prefix : null;
  }

  function getStarterItems(catalogs) {
    const initialGens   = [];   // [{genId, qty}]
    const initialTools  = [];   // [{toolType}]
    const initialItems  = {};   // {itemId: qty}

    // ── Path 1: use BoardDefault.asset data if available ──────────────────
    if (catalogs.boardDefault && catalogs.boardDefault.length > 0) {
      catalogs.boardDefault.forEach(({ idItem }) => {
        if (catalogs.generatorCatalog[idItem]) {
          // It's a generator
          const existing = initialGens.find(g => g.genId === idItem);
          if (existing) existing.qty++;
          else initialGens.push({ genId: idItem, qty: 1 });
        } else {
          const toolType = _itemIdToToolType(idItem, catalogs.toolCatalog);
          if (toolType && !initialTools.find(t => t.toolType === toolType)) {
            initialTools.push({ toolType, itemId: idItem });
          }
        }
      });

      // Ensure all cooking tool types are available (tools are board fixtures, not item rewards)
      Object.keys(catalogs.toolCatalog).forEach(toolType => {
        if (!initialTools.find(t => t.toolType === toolType)) {
          const itemId = (catalogs.toolItemMap && catalogs.toolItemMap[toolType]) || null;
          initialTools.push({ toolType, itemId });
        }
      });

      // Guarantee at least one functional generator (canGenerate = level 4+)
      const hasFunc = initialGens.some(g => (catalogs.generatorCatalog[g.genId] || {}).canGenerate);
      if (!hasFunc) {
        const seenTypes = new Set();
        Object.values(catalogs.generatorCatalog)
          .filter(g => g.canGenerate)
          .sort((a, b) => a.level - b.level)
          .forEach(g => {
            if (!seenTypes.has(g.type)) {
              seenTypes.add(g.type);
              initialGens.push({ genId: g.id, qty: 1 });
            }
          });
      }

      return { initialGens, initialTools, initialItems };
    }

    // ── Path 2: fallback — derive from reward schedule (original logic) ───
    if (!catalogs.sceneCatalog.length) return { initialGens, initialTools, initialItems };
    const firstScene = catalogs.sceneCatalog[0];

    catalogs.rewardSchedule
      .filter(r => r.trigger === 'buildStep' && r.scene === firstScene.name)
      .forEach(r => {
        if (r.itemId && catalogs.generatorCatalog[r.itemId]) {
          const existing = initialGens.find(g => g.genId === r.itemId);
          if (existing) existing.qty += (r.qty || 1);
          else initialGens.push({ genId: r.itemId, qty: r.qty || 1 });
        }
      });

    const firstBatchId = firstScene.batchIds[0];
    if (firstBatchId) {
      catalogs.rewardSchedule
        .filter(r => r.trigger === 'order' && r.batchId === firstBatchId && r.itemId)
        .forEach(r => {
          if (catalogs.generatorCatalog[r.itemId]) {
            const existing = initialGens.find(g => g.genId === r.itemId);
            if (existing) existing.qty += (r.qty || 1);
            else initialGens.push({ genId: r.itemId, qty: r.qty || 1 });
          }
        });
    }

    const hasFunc = initialGens.some(g => (catalogs.generatorCatalog[g.genId] || {}).canGenerate);
    if (!hasFunc) {
      const seenTypes = new Set();
      Object.values(catalogs.generatorCatalog)
        .filter(g => g.canGenerate)
        .sort((a, b) => a.level - b.level)
        .forEach(g => {
          if (!seenTypes.has(g.type)) {
            seenTypes.add(g.type);
            initialGens.push({ genId: g.id, qty: 1 });
          }
        });
    }

    Object.keys(catalogs.toolCatalog).forEach(toolType => {
      const itemId = (catalogs.toolItemMap && catalogs.toolItemMap[toolType]) || null;
      initialTools.push({ toolType, itemId });
    });

    return { initialGens, initialTools, initialItems };
  }

  function runFull(catalogs, profileCfg, targetDays) {
    const SimEngine = _engine();
    const { initialGens, initialTools, initialItems } = getStarterItems(catalogs);
    const state = SimEngine.createState(catalogs, profileCfg, initialGens, initialTools, initialItems);

    for (let d = 0; d < targetDays; d++) {
      SimEngine.tickDay(state, catalogs, profileCfg);
    }
    return state.log;
  }

  function* createStepIterator(catalogs, profileCfg, targetDays) {
    const SimEngine = _engine();
    const { initialGens, initialTools, initialItems } = getStarterItems(catalogs);
    const state = SimEngine.createState(catalogs, profileCfg, initialGens, initialTools, initialItems);

    for (let d = 0; d < targetDays; d++) {
      const { dayLog } = SimEngine.tickDay(state, catalogs, profileCfg);
      const done = state.progress.sceneIndex >= catalogs.sceneCatalog.length;
      yield { dayLog, state, done };
    }
  }

  const exports = { runFull, createStepIterator, getStarterItems };
  if (typeof module !== 'undefined') module.exports = exports;
  if (typeof window !== 'undefined') window.SimRunner = exports;
  return exports;
})();
