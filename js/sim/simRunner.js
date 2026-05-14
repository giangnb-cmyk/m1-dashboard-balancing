// js/sim/simRunner.js
const SimRunner = (() => {
  const _engine = () => typeof module !== 'undefined' ? require('./simEngine') : window.SimEngine;

  function getStarterItems(catalogs) {
    const initialGens = [];
    const initialTools = [];
    if (!catalogs.sceneCatalog.length) return { initialGens, initialTools };

    const firstScene = catalogs.sceneCatalog[0];
    catalogs.rewardSchedule
      .filter(r => r.trigger === 'buildStep' && r.scene === firstScene.name && r.stepId === '0')
      .forEach(r => {
        if (catalogs.generatorCatalog[r.itemId]) {
          const existing = initialGens.find(g => g.genId === r.itemId);
          if (existing) existing.qty += (r.qty || 1);
          else initialGens.push({ genId: r.itemId, qty: r.qty || 1 });
        }
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
