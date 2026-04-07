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

  // --- Load all game CSVs ---

  async function loadAll() {
    const base = 'Csv/';
    const [
      buildUpGoalData,
      buildUpGoalReward,
      buildUpGoalRewardBonus,
      itemMerge,
      itemGenerator,
      itemRaw,
      itemTool,
      itemBooster,
      itemChest,
      itemFood,
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
    ] = await Promise.all([
      loadFilled(`${base}Core/BuildUpGoal/BuildUpGoalData.csv`,        ['theme']),
      loadFilled(`${base}Core/BuildUpGoal/BuildUpGoalReward.csv`,      ['theme_type']),
      loadFilled(`${base}Core/BuildUpGoal/BuildUpGoalRewardBonus.csv`, ['type', 'index']),
      loadFilled(`${base}Core/ItemIdentify/ItemMerge.csv`,             ['type']),
      loadFilled(`${base}Core/ItemIdentify/ItemGenerator.csv`,         ['type']),
      loadFilled(`${base}Core/ItemIdentify/ItemRaw.csv`,               ['type']),
      loadFilled(`${base}Core/ItemIdentify/ItemTool.csv`,              ['type']),
      loadFilled(`${base}Core/ItemIdentify/ItemBooster.csv`,           ['type']),
      load(`${base}Core/ItemIdentify/ItemChest.csv`),
      loadFilled(`${base}Core/ItemIdentify/ItemFood.csv`,              ['type']),
      loadFilled(`${base}Core/ItemIdentify/ItemCurrency.csv`,          ['type']),
      loadFilled(`${base}Core/ItemExpand.csv`,                         ['type', 'id']),
      load(`${base}Core/Order/OrderDetail.csv`),
      load(`${base}Core/Order/OrderSystem.csv`),
      loadFilled(`${base}Core/Order/OrderDetailReward.csv`,            ['theme_type']),
      load(`${base}Core/Order/OrderGold.csv`),
      loadFilled(`${base}Core/Order/OrderSystemReward.csv`,            ['theme_type']),
      load(`${base}Core/Order/RewardMinDistributeOrderDetail.csv`),
      load(`${base}Core/Recipes/FormulaRecipes.csv`),
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
    ]);

    return {
      buildUpGoalData, buildUpGoalReward, buildUpGoalRewardBonus,
      itemMerge, itemGenerator, itemRaw, itemTool,
      itemBooster, itemChest, itemFood, itemCurrency,
      itemExpand,
      orderDetail, orderSystem, orderDetailReward,
      orderGold, orderSystemReward, rewardMinDistribute,
      formuaRecipes,
      boxes: {
        itemBoxGenerator, itemAssistantsChest, itemChefsChest,
        itemCoinBox, itemDailyGift, itemEquipmentBox, itemFlushGift,
        itemGift, itemLuckyBox, itemLuckyHandbag, itemTraineeBox,
      },
      buyCurrency, chefsBookData, convertTime,
    };
  }

  return { load, loadFilled, loadAll, fillDown };
})();
