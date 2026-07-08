/**
 * csvImport.js
 * Drag-drop CSV/ZIP import — updates window.GameData and reinits all modules.
 */
const CsvImport = (() => {

  // filename → { key, fill?, special? }
  // key "boxes.X" maps to window.GameData.boxes[X]
  const FILE_MAP = {
    'BuildUpGoalData.csv':               { key: 'buildUpGoalData',           fill: ['theme'] },
    'BuildUpGoalReward.csv':             { key: 'buildUpGoalReward',          fill: ['theme_type'] },
    'BuildUpGoalRewardBonus.csv':        { key: 'buildUpGoalRewardBonus',     fill: ['type', 'index'] },
    'ItemData.csv':                      { key: 'itemData' },
    'ItemCurrency.csv':                  { key: 'itemCurrency' },
    'ItemMerge.csv':                     { key: 'itemMerge' },
    'ItemExpand.csv':                    { key: 'itemExpand' },
    'ItemGenerator.csv':                 { key: 'itemGenerator',              fill: ['id'] },
    'RateGenerator.csv':                 { key: 'rateGenerator' },
    'OrderDetail.csv':                   { key: 'orderDetail',                special: 'orderDetail' },
    'OrderSystem.csv':                   { key: 'orderSystem' },
    'OrderGold.csv':                     { key: 'orderGold' },
    'DailyReward.csv':                   { key: 'dailyReward' },
    'OrderSystemReward.csv':             { key: 'orderSystemReward',          fill: ['theme_type'] },
    'RewardMinDistributeOrderDetail.csv':{ key: 'rewardMinDistribute' },
    'CookingRecipes.csv':                { key: 'formuaRecipes',              special: 'cooking' },
    'ItemBoxGenerator.csv':              { key: 'boxes.itemBoxGenerator',     fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemAssistantsChest.csv':           { key: 'boxes.itemAssistantsChest',  fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemChefsChest.csv':                { key: 'boxes.itemChefsChest',       fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemCoinBox.csv':                   { key: 'boxes.itemCoinBox',          fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemDailyGift.csv':                 { key: 'boxes.itemDailyGift',        fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemEquipmentBox.csv':              { key: 'boxes.itemEquipmentBox',     fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemFlushGift.csv':                 { key: 'boxes.itemFlushGift',        fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemGift.csv':                      { key: 'boxes.itemGift',             fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemLuckyBox.csv':                  { key: 'boxes.itemLuckyBox',         fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemLuckyHandbag.csv':              { key: 'boxes.itemLuckyHandbag',     fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'ItemTraineeBox.csv':                { key: 'boxes.itemTraineeBox',       fill: ['item_save_type', 'id_item', 'many_generator', 'time_unlock'] },
    'BuyCurrency.csv':                   { key: 'buyCurrency' },
    'ChefsBookData.csv':                 { key: 'chefsBookData',              fill: ['chefs_type'] },
    'ConvertTimeTool.csv':               { key: 'convertTime' },
  };

  // Pending parsed data before user confirms apply
  let _pending = {}; // filename → { config, data, rows }

  // --- Parse helpers ---

  function parseOrderDetail(rows) {
    const filled = CsvLoader.fillDown(rows, ['order_id', 'id_npc']);
    const itemNames = {};
    (window.GameData?.itemData || []).forEach(r => {
      if (r.itemID) itemNames[r.itemID] = r.name_item || '';
    });

    const grouped = {};
    const orderList = [];
    filled.forEach(row => {
      const oid = row.order_id;
      if (!oid) return;
      if (!grouped[oid]) {
        grouped[oid] = { orderId: oid, idNPC: row.id_npc || '', items: [],
                         gold: row.res_number || '', rwItemId: '', rwItemQty: '1' };
        orderList.push(oid);
      }
      if (row.item_id) {
        grouped[oid].items.push({ id: row.item_id, amount: row.amount || '1',
                                  name: itemNames[row.item_id] || '' });
      }
      const cv = row.custom_value || '';
      const rn = row.res_number || '1';
      if (cv && row.res_type === 'Item') {
        grouped[oid].rwItemId  = cv;
        grouped[oid].rwItemQty = rn;
      } else if (cv && !grouped[oid].rwItemId) {
        grouped[oid].rwItemId  = cv;
        grouped[oid].rwItemQty = rn;
      }
    });

    return orderList.map(oid => {
      const o = grouped[oid];
      const i1 = o.items[0] || {};
      const i2 = o.items[1] || {};
      return {
        orderId:        oid,
        idNPC:          o.idNPC,
        item1_id:       i1.id       || '',
        item1_name:     i1.name     || '',
        item1_amount:   i1.amount   || '',
        item2_id:       i2.id       || '',
        item2_name:     i2.name     || '',
        item2_amount:   i2.amount   || '',
        gold:           o.gold,
        rw_item_id:     o.rwItemId,
        rw_item_number: o.rwItemQty,
      };
    });
  }

  function parseText(filename, text) {
    const config = FILE_MAP[filename];
    if (!config) return null;
    let rows = CsvLoader.parseRaw(text);
    if (config.fill) rows = CsvLoader.fillDown(rows, config.fill);
    if (config.special === 'cooking') rows = CsvLoader.parseCookingRecipes(rows);
    if (config.special === 'orderDetail') rows = parseOrderDetail(rows);
    return { config, rows };
  }

  function setGameData(key, rows) {
    if (key.startsWith('boxes.')) {
      const subKey = key.slice(6); // "boxes.itemBoxGenerator" → "itemBoxGenerator"
      if (!window.GameData.boxes) window.GameData.boxes = {};
      window.GameData.boxes[subKey] = rows;
    } else {
      window.GameData[key] = rows;
    }
  }

  // --- File reading ---

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`Cannot read ${file.name}`));
      reader.readAsText(file, 'utf-8');
    });
  }

  async function processSingleCsv(file) {
    const text = await readFileAsText(file);
    const result = parseText(file.name, text);
    return { filename: file.name, result };
  }

  async function processZip(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip not loaded. Kiểm tra lại CDN script.');
    }
    const zip = await JSZip.loadAsync(file);
    const results = [];
    const promises = [];
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const filename = path.split('/').pop();
      if (!filename.endsWith('.csv')) return;
      promises.push(
        entry.async('string').then(text => {
          const result = parseText(filename, text);
          results.push({ filename, result });
        })
      );
    });
    await Promise.all(promises);
    return results;
  }

  // --- UI ---

  function getEl(id) { return document.getElementById(id); }

  function showModal() {
    getEl('csv-import-modal').style.display = 'flex';
    resetModal();
  }

  function hideModal() {
    getEl('csv-import-modal').style.display = 'none';
  }

  function resetModal() {
    _pending = {};
    getEl('csv-import-results').style.display = 'none';
    getEl('csv-import-results').innerHTML = '';
    getEl('csv-import-actions').style.display = 'none';
    getEl('csv-import-status').style.display = 'none';
    getEl('csv-import-dropzone').classList.remove('drag-over');
    getEl('csv-import-file-input').value = '';
  }

  function setStatus(msg, type = 'info') {
    const el = getEl('csv-import-status');
    el.textContent = msg;
    el.className = `csv-import-status csv-import-status--${type}`;
    el.style.display = 'block';
  }

  function renderResults() {
    const container = getEl('csv-import-results');
    container.innerHTML = '';
    const entries = Object.entries(_pending);
    if (!entries.length) return;

    const ok = entries.filter(([, v]) => v !== null);
    const skip = entries.filter(([, v]) => v === null);

    if (ok.length) {
      const ul = document.createElement('ul');
      ul.className = 'csv-import-list';
      ok.forEach(([filename, { rows }]) => {
        const li = document.createElement('li');
        li.className = 'csv-import-item csv-import-item--ok';
        li.innerHTML = `<span class="csv-import-dot">✓</span><span class="csv-import-name">${filename}</span><span class="csv-import-count">${rows.length} rows</span>`;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    }

    if (skip.length) {
      const skippedNames = skip.map(([f]) => f).join(', ');
      const note = document.createElement('p');
      note.className = 'csv-import-skip-note';
      note.textContent = `Bỏ qua (không nhận dạng được): ${skippedNames}`;
      container.appendChild(note);
    }

    container.style.display = 'block';
    getEl('csv-import-actions').style.display = ok.length ? 'flex' : 'none';
  }

  async function handleFiles(files) {
    if (!files.length) return;
    resetModal();
    setStatus('Đang xử lý...', 'info');

    try {
      let allResults = [];

      for (const file of files) {
        if (file.name.endsWith('.zip')) {
          const results = await processZip(file);
          allResults = allResults.concat(results);
        } else if (file.name.endsWith('.csv')) {
          const r = await processSingleCsv(file);
          allResults.push(r);
        }
      }

      if (!allResults.length) {
        setStatus('Không có file CSV nào được tìm thấy.', 'warn');
        return;
      }

      allResults.forEach(({ filename, result }) => {
        _pending[filename] = result; // null if unrecognized
      });

      const okCount = Object.values(_pending).filter(v => v !== null).length;
      setStatus(`Đã đọc ${allResults.length} file — ${okCount} nhận dạng được.`, okCount ? 'ok' : 'warn');
      renderResults();

    } catch (err) {
      setStatus(`Lỗi: ${err.message}`, 'error');
    }
  }

  function applyUpdates() {
    const entries = Object.entries(_pending).filter(([, v]) => v !== null);
    if (!entries.length) return;

    entries.forEach(([, { config, rows }]) => {
      setGameData(config.key, rows);
    });

    hideModal();
    if (typeof window.reloadGameData === 'function') {
      window.reloadGameData();
    }
  }

  // --- Init ---

  function init() {
    const modal      = getEl('csv-import-modal');
    const closeBtn   = getEl('csv-import-close');
    const backdrop   = modal.querySelector('.csv-import-backdrop');
    const dropzone   = getEl('csv-import-dropzone');
    const fileInput  = getEl('csv-import-file-input');
    const browseBtn  = getEl('csv-import-browse');
    const applyBtn   = getEl('csv-import-apply');
    const triggerBtn = getEl('csv-import-trigger-btn');

    triggerBtn.addEventListener('click', showModal);
    closeBtn.addEventListener('click', hideModal);
    backdrop.addEventListener('click', hideModal);

    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFiles(Array.from(fileInput.files)));

    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      handleFiles(Array.from(e.dataTransfer.files));
    });

    applyBtn.addEventListener('click', applyUpdates);
  }

  return { init };
})();
