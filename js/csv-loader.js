/**
 * csv-loader.js
 * Fetch và parse CSV files từ thư mục Csv/.
 * Xử lý "merged rows" (dòng bỏ trống key columns — fill-down convention).
 */
const CsvLoader = (() => {

  // --- Core parse ---

  function parseRaw(text) {
    const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
    if (!lines.length) return [];
    // Strip BOM
    if (lines[0].charCodeAt(0) === 0xFEFF) lines[0] = lines[0].slice(1);
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const vals = splitCsvLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
      return row;
    }).filter(row => Object.values(row).some(v => v !== ''));
  }

  /** Split one CSV line respecting quoted fields. */
  function splitCsvLine(line) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur);
    return result;
  }

  /**
   * Fill-down: khi row bỏ trống các columns trong `keyFields`,
   * copy giá trị từ row trước lên.
   */
  function fillDown(rows, keyFields) {
    let last = {};
    return rows.map(row => {
      const filled = { ...row };
      keyFields.forEach(k => {
        if (filled[k] === '' || filled[k] === undefined) {
          filled[k] = last[k] || '';
        } else {
          last[k] = filled[k];
        }
      });
      return filled;
    });
  }

  // --- Fetch helpers ---

  async function load(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Cannot load ${path}: ${res.status}`);
    const text = await res.text();
    return parseRaw(text);
  }

  async function loadFilled(path, keyFields) {
    const rows = await load(path);
    return fillDown(rows, keyFields);
  }

  // --- Cooking Recipes adapter ---
  // CookingRecipes.csv schema: type_tool, id_result, time_to_cook, item_id  (fill-down)
  // Output schema (compat với code cũ + consumers):
  //   itemID, tool (name), toolId, cooking_time (seconds float), ingredients (CSV string of ids),
  //   ResultId, TypeTool (name), TimeToCook_sec,
  //   Ingredient{1..4}Id, Ingredient{1..4}Type
  const TOOL_NAMES = { '2001': 'Juicer', '2002': 'Chef Counter', '2003': 'Grill', '2004': 'Pan', '2005': 'Oven' };

  function normTime(raw) {
    // "2,5" (VN decimal) or "2.5" → number string with dot
    return (raw || '').replace(',', '.');
  }

  function parseCookingRecipes(rows) {
    const filled = fillDown(rows, ['type_tool', 'id_result', 'time_to_cook']);
    const grouped = new Map();
    filled.forEach(r => {
      const id = r.id_result;
      if (!id) return;
      if (!grouped.has(id)) {
        const toolId   = r.type_tool || '';
        const toolName = TOOL_NAMES[toolId] || toolId;
        const time     = normTime(r.time_to_cook);
        grouped.set(id, {
          itemID:         id,
          tool:           toolName,
          toolId:         toolId,
          cooking_time:   time,
          ResultId:       id,
          TypeTool:       toolName,
          TimeToCook_sec: time,
          _ings: [],
        });
      }
      if (r.item_id) grouped.get(id)._ings.push(r.item_id);
    });
    return [...grouped.values()].map(rec => {
      const out = { ...rec, ingredients: rec._ings.join(',') };
      for (let i = 0; i < 4; i++) {
        out[`Ingredient${i + 1}Id`]   = rec._ings[i] || '';
        out[`Ingredient${i + 1}Type`] = '';
      }
      delete out._ings;
      return out;
    });
  }

  async function loadCookingRecipes(path) {
    const rows = await load(path);
    return parseCookingRecipes(rows);
  }

  // --- Load all game CSVs ---

  async function loadAll() {
    const base = 'Csv/';
    const [
      buildUpGoalData,
      buildUpGoalReward,
      buildUpGoalRewardBonus,
      itemData,
      itemCurrency,
      itemExpand,
      orderDetail,
      orderSystem,
      orderDetailReward,
      orderGold,
      orderSystemReward,
      rewardMinDistribute,
      formuaRecipes,
      itemBoxGenerator,
      itemAssistantsChest,
      itemChefsChest,
      itemCoinBox,
      itemDailyGift,
      itemEquipmentBox,
      itemFlushGift,
      itemGift,
      itemLuckyBox,
      itemLuckyHandbag,
      itemTraineeBox,
      buyCurrency,
      chefsBookData,
      convertTime,
      itemGenerator,
      itemMerge,
    ] = await Promise.all([
      loadFilled(`${base}Core/BuildUpGoal/BuildUpGoalData.csv`,        ['theme']),
      loadFilled(`${base}Core/BuildUpGoal/BuildUpGoalReward.csv`,      ['theme_type']),
      loadFilled(`${base}Core/BuildUpGoal/BuildUpGoalRewardBonus.csv`, ['type', 'index']),
      load(`${base}Core/ItemIdentify/ItemData.csv`),
      load(`${base}Core/ItemIdentify/ItemCurrency.csv`),
      load(`${base}Core/ItemExpand/ItemExpand.csv`),
      load(`${base}Core/Order/OrderDetail.csv`),
      load(`${base}Core/Order/OrderSystem.csv`),
      loadFilled(`${base}Core/Order/OrderDetailReward.csv`,            ['theme_type']),
      load(`${base}Core/Order/OrderGold.csv`),
      loadFilled(`${base}Core/Order/OrderSystemReward.csv`,            ['theme_type']),
      load(`${base}Core/Order/RewardMinDistributeOrderDetail.csv`),
      loadCookingRecipes(`${base}Core/Recipes/CookingRecipes.csv`),
      loadFilled(`${base}Core/Box&Gift/ItemBoxGenerator.csv`,          ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemAssistantsChest.csv`,       ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemChefsChest.csv`,            ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemCoinBox.csv`,               ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemDailyGift.csv`,             ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemEquipmentBox.csv`,          ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemFlushGift.csv`,             ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemGift.csv`,                  ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemLuckyBox.csv`,              ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemLuckyHandbag.csv`,          ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      loadFilled(`${base}Core/Box&Gift/ItemTraineeBox.csv`,            ['item_save_type', 'id_item', 'many_generator', 'time_unlock']),
      load(`${base}Features/BuyCurrency/BuyCurrency.csv`),
      loadFilled(`${base}Features/ChefsBook/ChefsBookData.csv`,        ['chefs_type']),
      load(`${base}Extends/ConvertTime/ConvertTimeTool.csv`),
      loadFilled(`${base}Core/Generators/ItemGenerator.csv`, ['id']),
      load(`${base}Core/ItemIdentify/ItemMerge.csv`),
    ]);

    return {
      buildUpGoalData, buildUpGoalReward, buildUpGoalRewardBonus,
      itemData, itemCurrency, itemExpand,
      orderDetail, orderSystem, orderDetailReward,
      orderGold, orderSystemReward, rewardMinDistribute,
      formuaRecipes,
      boxes: {
        itemBoxGenerator, itemAssistantsChest, itemChefsChest,
        itemCoinBox, itemDailyGift, itemEquipmentBox, itemFlushGift,
        itemGift, itemLuckyBox, itemLuckyHandbag, itemTraineeBox,
      },
      buyCurrency, chefsBookData, convertTime,
      itemGenerator, itemMerge,
    };
  }

  return { load, loadFilled, loadAll, fillDown };
})();
