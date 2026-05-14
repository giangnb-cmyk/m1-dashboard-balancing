// js/sim/simRunner.js
const SimRunner = (() => {
  const _engine = () => typeof module !== 'undefined' ? require('./simEngine') : window.SimEngine;

  function getStarterItems(catalogs) {
    const initialGens = [];
    const initialTools = [];
    if (!catalogs.sceneCatalog.length) return { initialGens, initialTools };

    const firstScene = catalogs.sceneCatalog[0];

    // Collect generators from first build step rewards
    catalogs.rewardSchedule
      .filter(r => r.trigger === 'buildStep' && r.scene === firstScene.name)
      .forEach(r => {
        if (r.itemId && catalogs.generatorCatalog[r.itemId]) {
          const existing = initialGens.find(g => g.genId === r.itemId);
          if (existing) existing.qty += (r.qty || 1);
          else initialGens.push({ genId: r.itemId, qty: r.qty || 1 });
        }
      });

    // Also collect from first batch's order rewards
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

    // Fallback: if no functional generators found, pick the first level-4+ per type
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

    // Add one tool per tool type (needed for cooking)
    Object.keys(catalogs.toolCatalog).forEach(toolType => {
      initialTools.push({ toolType });
    });

    return { initialGens, initialTools };
  }

  function runFull(catalogs, profileCfg, targetDays) {
    const SimEngine = _engine();
    const { initialGens, initialTools } = getStarterItems(catalogs);
    const state = SimEngine.createState(catalogs, profileCfg, initialGens, initialTools);

    for (let d = 0; d < targetDays; d++) {
      SimEngine.tickDay(state, catalogs, profileCfg);
      if (state.progress.sceneIndex >= catalogs.sceneCatalog.length) break;
    }
    return state.log;
  }

  function* createStepIterator(catalogs, profileCfg, targetDays) {
    const SimEngine = _engine();
    const { initialGens, initialTools } = getStarterItems(catalogs);
    const state = SimEngine.createState(catalogs, profileCfg, initialGens, initialTools);

    for (let d = 0; d < targetDays; d++) {
      const { dayLog } = SimEngine.tickDay(state, catalogs, profileCfg);
      const done = state.progress.sceneIndex >= catalogs.sceneCatalog.length;
      yield { dayLog, state, done };
      if (done) break;
    }
  }

  const exports = { runFull, createStepIterator, getStarterItems };
  if (typeof module !== 'undefined') module.exports = exports;
  return exports;
})();
