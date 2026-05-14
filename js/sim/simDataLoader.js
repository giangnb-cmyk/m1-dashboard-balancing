// js/sim/simDataLoader.js
const SimDataLoader = (() => {
  const CURRENCY_TYPE = { '1': 'gold', '2': 'gems', '3': 'energy' };

  function normalizeTheme(raw) {
    if (!raw) return null;
    if (typeof raw === 'string' && raw.startsWith('Scene_')) return raw;
    if (raw === 'Tutorial' || raw === '0') return 'Tutorial';
    const n = parseInt(raw);
    if (isNaN(n)) return raw;
    return n < 10 ? `Scene_0${n}` : `Scene_${n}`;
  }

  function buildGeneratorCatalog(rows, itemMergeRows) {
    const sellPrice = {};
    itemMergeRows.forEach(r => { if (r.id) sellPrice[r.id] = parseInt(r.sell_price) || 0; });

    const byId = {};
    rows.forEach(r => {
      const id = r.id; if (!id) return;
      if (!byId[id]) {
        byId[id] = {
          id,
          type: r.type || 'Unknown',
          cooldownSecs: parseInt(r.time_cooldown) || 0,
          costEnergy: parseInt(r.cost_energy) || 1,
          minPool: parseInt(r.min_count) || 0,
          maxPool: parseInt(r.max_count) || 0,
          gemToMin: parseInt(r.gem_to_min) || 0,
          spawns: [],
          sellPrice: sellPrice[id] || 0,
          level: 0,
          canGenerate: false
        };
      }
      if (r.item_id && r.rate) {
        byId[id].spawns.push({ itemId: r.item_id.trim(), rate: parseFloat(r.rate) || 0 });
      }
    });

    const byType = {};
    Object.values(byId).forEach(g => {
      if (!byType[g.type]) byType[g.type] = [];
      byType[g.type].push(g);
    });
    Object.values(byType).forEach(gens => {
      gens.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      gens.forEach((g, i) => { g.level = i + 1; g.canGenerate = g.level >= 4; });
    });

    return byId;
  }

  function buildToolCatalog(rows) {
    const tools = {};
    rows.forEach(r => {
      const toolId = r.toolId; if (!toolId) return;
      if (!tools[toolId]) tools[toolId] = { type: toolId, recipes: [] };
      const resultId = r.itemID || r.ResultId;
      if (!resultId) return; // skip malformed rows
      const ings = [r.Ingredient1Id, r.Ingredient2Id, r.Ingredient3Id, r.Ingredient4Id]
        .filter(i => i && i.trim());
      tools[toolId].recipes.push({
        resultId,
        timeSecs: parseFloat(r.TimeToCook_sec) || 1,
        ingredients: ings
      });
    });
    return tools;
  }

  function buildItemExpandCatalog(rows) {
    const catalog = {};
    rows.forEach(r => {
      const src = r.itemID; if (!src || !r.spawn_itemID) return;
      if (!catalog[src]) {
        catalog[src] = {
          sourceId: src,
          resultIds: [],
          costEnergy: parseInt(r.cost_energy) || 1,
          cooldownSecs: parseInt(r.time_cooldown) || 3
        };
      }
      catalog[src].resultIds.push(r.spawn_itemID);
    });
    return catalog;
  }

  function buildSceneCatalog(buildUpRows, orderSystemRows) {
    const sceneMap = {};
    let currentTheme = null;

    buildUpRows.forEach(r => {
      if (r.theme) currentTheme = normalizeTheme(r.theme) || r.theme;
      if (!currentTheme || r.id === undefined || r.id === '') return;
      if (!sceneMap[currentTheme]) {
        sceneMap[currentTheme] = { name: currentTheme, buildSteps: [], batchIds: [] };
      }
      const reward = (r.rw_build_up_type === 'Item' && r.custom_rw_build_up_value)
        ? { itemId: r.custom_rw_build_up_value, qty: parseInt(r.rw_build_up_number) || 1 }
        : null;
      sceneMap[currentTheme].buildSteps.push({
        stepId: r.id, goldCost: parseInt(r.cost) || 0, reward
      });
    });

    let currentBatchId = null;
    orderSystemRows.forEach(r => {
      if (r.id) currentBatchId = r.id;
      if (!currentBatchId) return;
      const scene = normalizeTheme(r.theme_type || r.themeType);
      if (!scene || !sceneMap[scene]) return;
      if (!sceneMap[scene].batchIds.includes(currentBatchId)) {
        sceneMap[scene].batchIds.push(currentBatchId);
      }
    });

    return Object.values(sceneMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s, i) => ({ ...s, index: i }));
  }

  function buildRewardSchedule(sceneCatalog, buildUpRewardRows, orderSystemRows) {
    const schedule = [];

    // Build-step rewards from already-parsed sceneCatalog
    sceneCatalog.forEach(scene => {
      scene.buildSteps.forEach(step => {
        if (step.reward) {
          schedule.push({ trigger: 'buildStep', scene: scene.name, stepId: step.stepId,
            itemId: step.reward.itemId, qty: step.reward.qty });
        }
      });
    });

    // BuildUpGoalReward bonus rows (separate CSV, still needs raw parsing)
    (buildUpRewardRows || []).forEach(r => {
      if (r.res_type === 'Item' && r.custom_value) {
        schedule.push({ trigger: 'buildStep', scene: r.theme, stepId: r.id,
          itemId: r.custom_value, qty: parseInt(r.res_number) || 1 });
      }
    });

    let currentBatch = null;
    orderSystemRows.forEach(r => {
      if (r.id) currentBatch = r.id;
      if (!currentBatch || !r.id_order) return;
      if (r.res_type === 'Item' && r.custom_value) {
        schedule.push({ trigger: 'order', orderId: r.id_order, batchId: currentBatch,
          itemId: r.custom_value, qty: parseInt(r.res_number) || 1 });
      } else if (r.res_type === 'Money' && r.res_id && r.res_number) {
        const currency = CURRENCY_TYPE[r.res_id];
        if (currency) {
          schedule.push({ trigger: 'order', orderId: r.id_order, batchId: currentBatch,
            currency, amount: parseInt(r.res_number) || 0 });
        }
      }
    });

    return schedule;
  }

  function buildIAPCatalog(gameData) {
    const catalog = {};
    Object.keys(gameData).filter(k => k.startsWith('iap')).forEach(key => {
      const rows = gameData[key];
      if (!Array.isArray(rows) || !rows.length) return;
      catalog[key] = rows.map(r => {
        const contents = [];
        if (r.res_type === 'Money' && r.res_id) {
          const t = CURRENCY_TYPE[r.res_id];
          if (t) contents.push({ type: t, amount: parseInt(r.res_number) || 0 });
        } else if (r.res_type === 'Item' && r.custom_value) {
          contents.push({ type: 'item', itemId: r.custom_value, qty: parseInt(r.res_number) || 1 });
        }
        return { id: r.id, name: r.pack_name || key, iapCost: parseFloat(r.iap_cost) || 0, contents };
      });
    });
    return catalog;
  }

  function buildItemSellPrices(itemMergeRows) {
    const map = {};
    itemMergeRows.forEach(r => { if (r.id) map[r.id] = parseInt(r.sell_price) || 0; });
    return map;
  }

  function buildOrderCatalog(orderSystemRows, orderDetailRows) {
    const orderDetailMap = {};
    orderDetailRows.forEach(r => {
      if (!r.orderId) return;
      orderDetailMap[r.orderId] = {
        orderId: r.orderId,
        gold: parseInt(r.gold) || 0,
        items: [
          r.item1_id ? { itemId: r.item1_id, qty: parseInt(r.item1_amount) || 1 } : null,
          r.item2_id ? { itemId: r.item2_id, qty: parseInt(r.item2_amount) || 1 } : null,
        // Game constraint: orders have at most 2 required items (item1_id, item2_id)
        ].filter(Boolean)
      };
    });

    const batchMap = {};
    let currentBatch = null;
    orderSystemRows.forEach(r => {
      if (r.id) {
        const scene = normalizeTheme(r.theme_type || r.themeType);
        currentBatch = {
          id: r.id, scene,
          canReceiveReward: r.can_receive_reward === 'TRUE',
          orderIds: []
        };
        batchMap[r.id] = currentBatch;
      }
      if (currentBatch && r.id_order) currentBatch.orderIds.push(r.id_order);
    });

    return { batchMap, orderDetailMap };
  }

  function build(gameData) {
    const gd = gameData || window.GameData;
    const generatorCatalog = buildGeneratorCatalog(gd.rateGenerator || [], gd.itemMerge || []);
    const toolCatalog = buildToolCatalog(gd.formuaRecipes || []);
    const itemExpandCatalog = buildItemExpandCatalog(gd.itemExpand || []);
    const sceneCatalog = buildSceneCatalog(gd.buildUpGoalData || [], gd.orderSystem || []);
    const { batchMap, orderDetailMap } = buildOrderCatalog(gd.orderSystem || [], gd.orderDetail || []);

    return {
      generatorCatalog,
      toolCatalog,
      itemExpandCatalog,
      sceneCatalog,
      rewardSchedule: buildRewardSchedule(sceneCatalog, gd.buildUpGoalReward || [], gd.orderSystem || []),
      iapCatalog: buildIAPCatalog(gd),
      itemSellPrices: buildItemSellPrices(gd.itemMerge || []),
      batchMap,
      orderDetailMap
    };
  }

  if (typeof module !== 'undefined') module.exports = { build, normalizeTheme };
  return { build };
})();
