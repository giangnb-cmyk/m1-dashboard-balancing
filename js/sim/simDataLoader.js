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

  function buildGeneratorCatalog(rows, itemMergeRows, itemDataRows) {
    const sellPrice = {};
    itemMergeRows.forEach(r => { if (r.id) sellPrice[r.id] = parseInt(r.sell_price) || 0; });

    // Game tier from itemData (tier 4 = first tappable level the player sees as "Lv4")
    const gameTierMap = {};
    (itemDataRows || []).forEach(r => { if (r.itemID && r.tier) gameTierMap[r.itemID] = parseInt(r.tier) || 0; });

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
          gameTier: gameTierMap[id] || 0,
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
      // All catalog entries are functional (game tier ≥ 4). Non-functional tiers (1–3)
      // only exist in itemData and never appear here.
      gens.forEach((g, i) => {
        g.level = i + 1;
        g.canGenerate = true;
        if (!g.gameTier) g.gameTier = g.level; // fallback for generators not in itemData
      });
    });

    return byId;
  }

  function buildToolCatalog(rows) {
    const tools = {};
    rows.forEach(r => {
      const toolId = r.toolId; if (!toolId) return;
      if (!tools[toolId]) tools[toolId] = { type: toolId, name: r.tool || toolId, recipes: [] };
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

  function buildRewardSchedule(sceneCatalog, buildUpRewardRows, orderSystemRows, orderDetailRows) {
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

    // Individual order completion rewards (custom_value field in OrderDetail.csv).
    // Parsed by generate_data.py as rw_item_id / rw_item_number on each orderDetail row.
    (orderDetailRows || []).forEach(r => {
      if (!r.orderId || !r.rw_item_id) return;
      schedule.push({ trigger: 'order', orderId: r.orderId,
        itemId: r.rw_item_id, qty: parseInt(r.rw_item_number) || 1 });
    });

    // Wide-format batch rewards: rewardN_resType/_resId/_resNumber/_customValue (1..4)
    orderSystemRows.forEach(r => {
      if (!r.id) return;
      for (let i = 1; i <= 4; i++) {
        const resType = r[`reward${i}_resType`];
        if (!resType) continue;
        const customValue = r[`reward${i}_customValue`];
        const resId = r[`reward${i}_resId`];
        const resNumber = parseInt(r[`reward${i}_resNumber`]) || 0;
        if (resType === 'Item' && customValue) {
          schedule.push({ trigger: 'batch', batchId: r.id,
            itemId: customValue, qty: resNumber || 1 });
        } else if (resType === 'Money' && resId) {
          const currency = CURRENCY_TYPE[resId];
          if (currency) {
            schedule.push({ trigger: 'batch', batchId: r.id,
              currency, amount: resNumber });
          }
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

  function buildItemEnergyCosts(itemDataRows) {
    const map = {};
    itemDataRows.forEach(r => { if (r.itemID) map[r.itemID] = parseFloat(r.energy_cost) || 0; });
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
    orderSystemRows.forEach(r => {
      if (!r.id) return;
      const scene = normalizeTheme(r.theme_type || r.themeType);
      const orderIds = [];
      // Wide-format: orderN_idOrder columns (1..7 in current CSV)
      for (let i = 1; i <= 7; i++) {
        const v = r[`order${i}_idOrder`];
        if (v) orderIds.push(v);
      }
      batchMap[r.id] = {
        id: r.id, scene,
        canReceiveReward: r.canReceiveReward === '1' || r.can_receive_reward === 'TRUE',
        orderIds
      };
    });

    return { batchMap, orderDetailMap };
  }

  function buildItemFamilies(itemDataRows) {
    // Family = first 4 digits of itemID (e.g. "7001" = Coffee). Same-family items
    // form a merge chain by tier: 2× tier N → 1× tier N+1.
    const itemTierMap = {};   // itemId → { family, tier }
    const familyChain = {};   // family → [itemId by tier index, 0-based]
    (itemDataRows || []).forEach(r => {
      const id = r.itemID;
      const tier = parseInt(r.tier);
      if (!id || !tier) return;
      const family = id.substring(0, 4);
      itemTierMap[id] = { family, tier };
      if (!familyChain[family]) familyChain[family] = [];
      familyChain[family][tier - 1] = id;
    });
    return { itemTierMap, familyChain };
  }

  function build(gameData) {
    const gd = gameData || window.GameData;
    const generatorCatalog = buildGeneratorCatalog(gd.rateGenerator || [], gd.itemMerge || [], gd.itemData || []);
    const toolCatalog = buildToolCatalog(gd.formuaRecipes || []);
    const itemExpandCatalog = buildItemExpandCatalog(gd.itemExpand || []);
    const sceneCatalog = buildSceneCatalog(gd.buildUpGoalData || [], gd.orderSystem || []);
    const { batchMap, orderDetailMap } = buildOrderCatalog(gd.orderSystem || [], gd.orderDetail || []);
    const { itemTierMap, familyChain } = buildItemFamilies(gd.itemData || []);

    // All item IDs whose type is 'Generator' (includes level 1-3 which aren't in generatorCatalog)
    const generatorItemIds = new Set(
      (gd.itemData || []).filter(r => r.type === 'Generator').map(r => r.itemID).filter(Boolean)
    );

    const itemNames = {};
    (gd.itemMerge || []).forEach(r => { if (r.id && r.name_item) itemNames[r.id] = r.name_item; });

    // toolItemMap: toolType (4-digit) → representative itemId for level display.
    // boardDefault items take priority (actual starting level); first functional tier (4+)
    // is the fallback so display shows a usable level rather than an unbuilt Lv1 shell.
    const toolItemMap = {};
    Object.keys(toolCatalog).forEach(toolType => {
      const functional = Object.entries(itemTierMap)
        .filter(([, info]) => info.family === toolType && info.tier >= 4)
        .sort((a, b) => a[1].tier - b[1].tier);
      if (functional.length) { toolItemMap[toolType] = functional[0][0]; return; }
      const all = Object.entries(itemTierMap)
        .filter(([, info]) => info.family === toolType)
        .sort((a, b) => a[1].tier - b[1].tier);
      if (all.length) toolItemMap[toolType] = all[0][0];
    });
    (gd.boardDefault || []).forEach(({ idItem }) => {
      const family = idItem.substring(0, 4);
      if (toolCatalog[family]) toolItemMap[family] = idItem;
    });

    return {
      generatorCatalog,
      toolCatalog,
      itemExpandCatalog,
      sceneCatalog,
      rewardSchedule: buildRewardSchedule(sceneCatalog, gd.buildUpGoalReward || [], gd.orderSystem || [], gd.orderDetail || []),
      iapCatalog: buildIAPCatalog(gd),
      itemSellPrices:    buildItemSellPrices(gd.itemMerge || []),
      itemEnergyCosts:   buildItemEnergyCosts(gd.itemData || []),
      batchMap,
      orderDetailMap,
      itemTierMap,
      familyChain,
      generatorItemIds,
      itemNames,
      toolItemMap,
      boardDefault: gd.boardDefault || []   // [{idItem, x, y}] from BoardDefault.asset
    };
  }

  const exports = { build, normalizeTheme };
  if (typeof module !== 'undefined') module.exports = exports;
  if (typeof window !== 'undefined') window.SimDataLoader = exports;
  return exports;
})();
