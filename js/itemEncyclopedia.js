/**
 * itemEncyclopedia.js — Tab: Item Encyclopedia
 *
 * Mỗi sub-tab có pattern: buildRows() → pre-render HTML cache một lần,
 * render() chỉ filter + sort + join chuỗi đã cache.
 *
 * Phụ thuộc: TableUtils (js/tableUtils.js), window.GameData (js/data.js)
 */

const ItemEncyclopedia = (() => {

    const { $, setText, badge, formatTime, fillSelect, bindFilters,
            sortByKey, bindSort, renderRows, initSubTabs,
            createChainCounter, sellBadge } = TableUtils;

    // ── Shared item sources cho tab Other ────────────────────────────────────

    const OTHER_SOURCES = [
        { key: 'itemFood',     label: 'Food',     color: '#4ade80' },
        { key: 'itemBooster',  label: 'Booster',  color: '#f472b6' },
        { key: 'itemChest',    label: 'Chest',    color: '#fbbf24' },
        { key: 'itemCurrency', label: 'Currency', color: '#34d399' },
    ];

    // ═════════════════════════════════════════════════════════════════════════
    // HELPERS BUILD ROW HTML
    // ═════════════════════════════════════════════════════════════════════════

    /** Build energy cell HTML cho merge items */
    function buildEnergyCell(ei) {
        if (!ei) return `<span style="color:var(--text-muted)">—</span>`;
        return `<span class="mono" style="color:var(--energy)">${ei.energy} ⚡</span>`
             + `<br><span style="font-size:0.72rem;color:var(--text-muted)">${ei.genType}</span>`;
    }

    /** Build ingredient cell HTML cho recipe */
    function buildIngCell(type, id) {
        if (!type && !id) return '';
        return `<div style="white-space:nowrap">`
             + `<span style="color:var(--accent);font-size:0.78rem">${type}</span> `
             + `<span class="mono" style="color:var(--energy);font-size:0.78rem">${id}</span>`
             + `</div>`;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 1: MERGE ITEMS
    // ═════════════════════════════════════════════════════════════════════════

    /** Xây energy map: item_id → { energy, genId, genType } dùng generator cấp thấp nhất */
    function buildEnergyMap(rateGeneratorRows) {
        const map = {};
        rateGeneratorRows.forEach(row => {
            if (!row.item_id || !row.cost_energy) return;
            const itemId = row.item_id.trim();
            const genId  = parseInt(row.id) || 0;
            const existing = map[itemId];
            if (!existing || genId < existing.genId) {
                map[itemId] = { energy: parseFloat(row.cost_energy), genId, genType: row.type };
            }
        });
        return map;
    }

    function buildMergeRows(itemRaw, energyMap) {
        const counter = createChainCounter();
        return itemRaw.map(item => {
            const chain = counter.count(item.type);
            const ei    = energyMap[item.id] || null;
            return {
                chain, type: item.type || '', id: item.id || '',
                name: item.name_item || '', merge_to: item.merge_to || '',
                sell_price: item.sell_price || '', sum_merge: item.sum_merge || '',
                energy: ei ? ei.energy : '',
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted);text-align:center">${chain}</td>
                    <td style="color:var(--accent)">${item.type || ''}</td>
                    <td class="mono" style="color:var(--energy)">${item.id || ''}</td>
                    <td>${item.name_item || ''}</td>
                    <td class="mono" style="color:var(--text-muted)">${item.merge_to || ''}</td>
                    <td class="mono">${item.sell_price || ''}</td>
                    <td class="mono">${item.sum_merge || ''}</td>
                    <td>${buildEnergyCell(ei)}</td>
                    <td style="text-align:center">${sellBadge(item.can_sell)}</td>
                </tr>`,
            };
        });
    }

    function initMergeItems() {
        const data    = window.GameData;
        const energyMap = buildEnergyMap(data.rateGenerator || []);
        const allRows   = buildMergeRows(data.itemRaw || [], energyMap);

        setText('merge-total-count', allRows.length.toLocaleString());
        fillSelect('merge-filter-type', [...new Set(allRows.map(r => r.type).filter(Boolean))].sort());

        let sortKey = 'chain', sortAsc = true;

        function render() {
            const search = ($('merge-search')?.value || '').toLowerCase().trim();
            const typeF  = $('merge-filter-type')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (typeF   && r.type !== typeF) return false;
                    if (search  && !r.name.toLowerCase().includes(search) && !r.id.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            setText('merge-result-count', filtered.length.toLocaleString() + ' items');
            renderRows('merge-body', filtered, 9);
        }

        bindSort('merge-table', () => ({ key: sortKey, asc: sortAsc }), (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['merge-search', 'merge-filter-type'], render);
        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 2: GENERATORS
    // ═════════════════════════════════════════════════════════════════════════

    /** Gộp các row rateGenerator theo type+id, collect spawn items */
    function buildGenMap(rateGeneratorRows) {
        const map = {};
        rateGeneratorRows.forEach(row => {
            const key = row.type + '_' + row.id;
            if (!map[key]) {
                map[key] = {
                    type: row.type, id: row.id,
                    cost_energy: row.cost_energy || '', time_cooldown: row.time_cooldown || '',
                    min_count: row.min_count || '', max_count: row.max_count || '',
                    items: [],
                };
            }
            if (row.item_id) map[key].items.push({ item_id: row.item_id, rate: row.rate || '' });
        });
        return map;
    }

    function buildGeneratorRows(genMap, nameMap) {
        return Object.values(genMap).map(r => {
            const name = nameMap[r.id] || '—';
            const spawnList = r.items.map(it =>
                `<span class="mono" style="color:var(--energy)">${it.item_id}</span>`
                + (it.rate ? `<span style="color:var(--text-muted);font-size:0.75rem"> ${it.rate}%</span>` : '')
            ).join(' · ');
            return {
                type: r.type, id: r.id,
                cost_energy: r.cost_energy, time_cooldown: r.time_cooldown,
                html: `<tr>
                    <td style="color:var(--accent)">${r.type}</td>
                    <td class="mono" style="color:var(--energy)">${r.id}</td>
                    <td>${name}</td>
                    <td class="mono" style="color:var(--energy)">${r.cost_energy !== '' ? r.cost_energy + ' ⚡' : '—'}</td>
                    <td class="mono">${formatTime(r.time_cooldown)}</td>
                    <td class="mono" style="color:var(--text-muted)">${r.min_count}–${r.max_count}</td>
                    <td style="font-size:0.82rem">${spawnList}</td>
                </tr>`,
            };
        });
    }

    function initGenerators() {
        const data   = window.GameData;
        const genMap = buildGenMap(data.rateGenerator || []);
        const nameMap = {};
        (data.itemGenerator || []).forEach(r => { if (r.id) nameMap[r.id] = r.name_item || ''; });

        const allRows = buildGeneratorRows(genMap, nameMap);

        setText('gen-total-count', allRows.length.toLocaleString());
        fillSelect('gen-filter-type', [...new Set(allRows.map(r => r.type).filter(Boolean))].sort());

        let sortKey = 'id', sortAsc = true;

        function render() {
            const search = ($('gen-search')?.value || '').toLowerCase().trim();
            const typeF  = $('gen-filter-type')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (typeF  && r.type !== typeF) return false;
                    if (search && !r.type.toLowerCase().includes(search) && !r.id.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            setText('gen-result-count', filtered.length.toLocaleString() + ' generators');
            renderRows('gen-body', filtered, 7);
        }

        bindSort('gen-table', () => ({ key: sortKey, asc: sortAsc }), (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['gen-search', 'gen-filter-type'], render);
        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 3: RECIPES
    // ═════════════════════════════════════════════════════════════════════════

    /** Build formula lookup map: "ResultType_ResultId" → formula object */
    function buildFormulaMap(formuaRecipes) {
        const map = {};
        formuaRecipes.forEach(r => {
            const key = (r['ResultType'] || '') + '_' + (r['ResultId'] || '');
            map[key] = {
                tool:     r['TypeTool'] || '',
                time:     r['TimeToCook(sec)'] || '',
                ing1Type: r['Ingredient1Type'] || '', ing1Id: r['Ingredient1Id'] || '',
                ing2Type: r['Ingredient2Type'] || '', ing2Id: r['Ingredient2Id'] || '',
                ing3Type: r['Ingredient3Type'] || '', ing3Id: r['Ingredient3Id'] || '',
            };
        });
        return map;
    }

    function buildRecipeRows(itemFood, formulaMap) {
        const counter = createChainCounter();
        return itemFood.map(item => {
            const chain = counter.count(item.type);
            const key   = (item.type || '') + '_' + (item.id || '');
            const f     = formulaMap[key] || null;

            const statusBadge = f
                ? badge('✓ Active',  'rgba(34,197,94,0.12)',  '#22c55e88', '#4ade80')
                : badge('✗ Missing', 'rgba(239,68,68,0.12)',  '#ef444488', '#f87171');

            const toolBadge = f?.tool
                ? badge(f.tool, 'rgba(99,102,241,0.15)', '#6366f188', '#818cf8')
                : '—';

            const ings = f
                ? [buildIngCell(f.ing1Type, f.ing1Id),
                   buildIngCell(f.ing2Type, f.ing2Id),
                   buildIngCell(f.ing3Type, f.ing3Id)].filter(Boolean).join('') || '—'
                : '—';

            return {
                chain, type: item.type || '', id: item.id || '',
                name: item.name_item || '', sell_price: item.sell_price || '',
                tool: f?.tool || '', time: f?.time || '',
                hasRecipe: !!f,
                html: `<tr style="${f ? '' : 'opacity:0.55;'}">
                    <td>${statusBadge}</td>
                    <td class="mono" style="color:var(--text-muted);text-align:center">${chain}</td>
                    <td style="color:var(--accent)">${item.type || ''}</td>
                    <td class="mono" style="color:var(--energy)">${item.id || ''}</td>
                    <td>${item.name_item || ''}</td>
                    <td class="mono">${item.sell_price || ''}</td>
                    <td>${toolBadge}</td>
                    <td class="mono" style="color:var(--gold)">${formatTime(f?.time)}</td>
                    <td style="font-size:0.82rem">${ings}</td>
                </tr>`,
            };
        });
    }

    function initRecipes() {
        const data       = window.GameData;
        const formulaMap = buildFormulaMap(data.formuaRecipes || []);
        const allRows    = buildRecipeRows(data.itemFood || [], formulaMap);

        const activeCount  = allRows.filter(r => r.hasRecipe).length;
        const missingCount = allRows.length - activeCount;

        setText('recipe-stat-active',  activeCount.toLocaleString());
        setText('recipe-stat-missing', missingCount.toLocaleString());
        setText('recipe-stat-total',   allRows.length.toLocaleString());
        setText('recipe-total-count',  allRows.length.toLocaleString());

        fillSelect('recipe-filter-tool', [...new Set(allRows.map(r => r.tool).filter(Boolean))].sort());
        fillSelect('recipe-filter-type', [...new Set(allRows.map(r => r.type).filter(Boolean))].sort());

        let sortKey = 'chain', sortAsc = true;

        function render() {
            const search  = ($('recipe-search')?.value || '').toLowerCase().trim();
            const toolF   = $('recipe-filter-tool')?.value || '';
            const typeF   = $('recipe-filter-type')?.value || '';
            const statusF = $('recipe-filter-status')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (toolF                          && r.tool !== toolF)   return false;
                    if (typeF                          && r.type !== typeF)   return false;
                    if (statusF === 'active'  && !r.hasRecipe)                return false;
                    if (statusF === 'missing' &&  r.hasRecipe)                return false;
                    if (search && !r.name.toLowerCase().includes(search) && !r.id.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            setText('recipe-result-count', filtered.length.toLocaleString() + ' items');
            renderRows('recipe-body', filtered, 9);
        }

        bindSort('recipe-table', () => ({ key: sortKey, asc: sortAsc }), (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['recipe-search', 'recipe-filter-tool', 'recipe-filter-type', 'recipe-filter-status'], render);

        // Click stat card → filter nhanh
        $('recipe-stat-active-card')?.addEventListener('click', () => {
            $('recipe-filter-status').value = 'active'; render();
        });
        $('recipe-stat-missing-card')?.addEventListener('click', () => {
            $('recipe-filter-status').value = 'missing'; render();
        });

        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 4: TOOL
    // ═════════════════════════════════════════════════════════════════════════

    function buildMergeItemRows(items) {
        const counter = createChainCounter();
        return items.map(item => {
            const chain = counter.count(item.type);
            return {
                chain, type: item.type || '', id: item.id || '',
                name: item.name_item || '', merge_to: item.merge_to || '',
                sell_price: item.sell_price || '', sum_merge: item.sum_merge || '',
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted);text-align:center">${chain}</td>
                    <td style="color:var(--accent)">${item.type || ''}</td>
                    <td class="mono" style="color:var(--energy)">${item.id || ''}</td>
                    <td>${item.name_item || ''}</td>
                    <td class="mono" style="color:var(--text-muted)">${item.merge_to || ''}</td>
                    <td class="mono">${item.sell_price || ''}</td>
                    <td class="mono">${item.sum_merge || ''}</td>
                    <td style="text-align:center">${sellBadge(item.can_sell)}</td>
                </tr>`,
            };
        });
    }

    function initSubTabMergeList({ dataKey, totalId, filterTypeId, searchId, resultCountId, tableId, tbodyId, colSpan }) {
        const allRows = buildMergeItemRows(window.GameData[dataKey] || []);
        setText(totalId, allRows.length.toLocaleString());
        fillSelect(filterTypeId, [...new Set(allRows.map(r => r.type).filter(Boolean))].sort());

        let sortKey = 'chain', sortAsc = true;

        function render() {
            const search = ($(searchId)?.value || '').toLowerCase().trim();
            const typeF  = $(filterTypeId)?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (typeF  && r.type !== typeF) return false;
                    if (search && !r.name.toLowerCase().includes(search) && !r.id.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            setText(resultCountId, filtered.length.toLocaleString() + ' items');
            renderRows(tbodyId, filtered, colSpan);
        }

        bindSort(tableId, () => ({ key: sortKey, asc: sortAsc }), (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters([searchId, filterTypeId], render);
        render();
    }

    function initTool() {
        initSubTabMergeList({
            dataKey: 'itemTool', totalId: 'tool-total-count',
            filterTypeId: 'tool-filter-type', searchId: 'tool-search',
            resultCountId: 'tool-result-count', tableId: 'tool-table',
            tbodyId: 'tool-body', colSpan: 8,
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 5: OTHER ITEMS
    // ═════════════════════════════════════════════════════════════════════════

    function buildOtherRows(data) {
        const allRows = [];
        OTHER_SOURCES.forEach(({ key, label, color }) => {
            const srcBadge = badge(label, color + '22', color + '88', color);
            const counter  = createChainCounter();
            (data[key] || []).forEach(item => {
                const chain = counter.count(item.type);
                allRows.push({
                    sourceLabel: label, color, chain,
                    type: item.type || '', id: item.id || '',
                    name: item.name_item || '', merge_to: item.merge_to || '',
                    sell_price: item.sell_price || '', sum_merge: item.sum_merge || '',
                    html: `<tr>
                        <td>${srcBadge}</td>
                        <td class="mono" style="color:var(--text-muted);text-align:center">${chain}</td>
                        <td style="color:var(--accent)">${item.type || ''}</td>
                        <td class="mono" style="color:var(--energy)">${item.id || ''}</td>
                        <td>${item.name_item || ''}</td>
                        <td class="mono" style="color:var(--text-muted)">${item.merge_to || ''}</td>
                        <td class="mono">${item.sell_price || ''}</td>
                        <td class="mono">${item.sum_merge || ''}</td>
                        <td style="text-align:center">${sellBadge(item.can_sell)}</td>
                    </tr>`,
                });
            });
        });
        return allRows;
    }

    function initOther() {
        const allRows = buildOtherRows(window.GameData);
        setText('other-total-count', allRows.length.toLocaleString());
        fillSelect('other-filter-type', [...new Set(allRows.map(r => r.type).filter(Boolean))].sort());

        let sortKey = 'sourceLabel', sortAsc = true;

        function render() {
            const search = ($('other-search')?.value || '').toLowerCase().trim();
            const srcF   = $('other-filter-src')?.value || '';
            const typeF  = $('other-filter-type')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (srcF   && r.sourceLabel !== srcF) return false;
                    if (typeF  && r.type        !== typeF) return false;
                    if (search && !r.name.toLowerCase().includes(search) && !r.id.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            setText('other-result-count', filtered.length.toLocaleString() + ' items');
            renderRows('other-body', filtered, 9);
        }

        bindSort('other-table', () => ({ key: sortKey, asc: sortAsc }), (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['other-search', 'other-filter-src', 'other-filter-type'], render);
        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GLOBAL STATS
    // ═════════════════════════════════════════════════════════════════════════

    function countUniqueGenerators(rateGeneratorRows) {
        const seen = new Set();
        rateGeneratorRows.forEach(r => { if (r.type && r.id) seen.add(r.type + '_' + r.id); });
        return seen.size;
    }

    function updateGlobalStats() {
        const d = window.GameData;
        setText('stat-merge',     (d.itemRaw?.length || 0).toLocaleString());
        setText('stat-generator', countUniqueGenerators(d.rateGenerator || []).toLocaleString());
        setText('stat-recipe',    (d.itemFood?.length || 0).toLocaleString());
        setText('stat-tool',      (d.itemTool?.length || 0).toLocaleString());
        setText('stat-other',     OTHER_SOURCES.reduce((s, { key }) => s + (d[key]?.length || 0), 0).toLocaleString());

        const statusEl = $('data-status');
        if (!statusEl) return;
        const ok = (d.itemRaw?.length || 0) > 0;
        statusEl.textContent = ok ? '✓ Data loaded' : '⚠ Chạy generate_data.py';
        statusEl.style.color = ok ? 'var(--success)' : 'var(--warning)';
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC
    // ═════════════════════════════════════════════════════════════════════════

    function init() {
        if (!window.GameData) {
            const el = $('data-status');
            if (el) { el.textContent = '⚠ Không có data — chạy generate_data.py'; el.style.color = 'var(--warning)'; }
            return;
        }
        initSubTabs();
        updateGlobalStats();
        initMergeItems();
        initGenerators();
        initRecipes();
        initTool();
        initOther();
    }

    return { init };

})();
