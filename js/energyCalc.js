/**
 * energyCalc.js — Tab: Energy Calculator
 *
 * Công thức energy:
 *   • lv1 (chain gốc):  energy = gen.cost_energy / (rate/100)  [generator ở level đã chọn]
 *   • lvN (chain gốc):  energy = energy(lv1) × (item.sum_merge / lv1.sum_merge)
 *   • expand_lv1:       energy = energy(parent_item) + expand.cost_energy (=1)
 *   • expand_lvN:       energy = energy(expand_lv1) × (item.sum_merge / expand_lv1.sum_merge)
 *
 * Phụ thuộc: TableUtils, window.GameData
 */

const EnergyCalc = (() => {

    const { $, setText, badge, fillSelect, bindFilters,
            sortByKey, bindSort, renderRows } = TableUtils;

    // ── Format helpers ────────────────────────────────────────────────────────

    function fmtE(val) {
        if (val == null) return '—';
        if (val < 10)    return val.toFixed(2);
        if (val < 1000)  return val.toFixed(1);
        return Math.round(val).toLocaleString();
    }

    function energyCell(val, bold = false) {
        if (val == null) return `<span style="color:var(--text-muted)">—</span>`;
        const fw = bold ? 'font-weight:700;font-size:1rem;' : '';
        return `<span class="mono" style="color:var(--energy);${fw}">${fmtE(val)} ⚡</span>`;
    }

    function naCell() {
        return `<span style="color:var(--warning);font-size:0.78rem">N/A</span>`;
    }

    function sourceBadge(src) {
        if (src === 'generator') return badge('Generator', 'rgba(56,189,248,0.12)', '#38bdf888', '#38bdf8');
        if (src === 'expand')    return badge('Expand',    'rgba(251,191,36,0.12)',  '#fbbf2488', '#fbbf24');
        return badge(src, 'rgba(148,163,184,0.12)', '#94a3b888', '#94a3b8');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GENERATOR LEVEL PANEL
    // All generator types share a common level index (1-based).
    // If a type has fewer levels than selected index, use its last level.
    // ═════════════════════════════════════════════════════════════════════════

    /** @returns {Object.<string, string[]>} genType → sorted id list */
    function buildGenLevelMap(rateGenRows) {
        const map = {};
        rateGenRows.forEach(r => {
            if (!r.type || !r.id) return;
            if (!map[r.type]) map[r.type] = new Set();
            map[r.type].add(r.id);
        });
        Object.keys(map).forEach(type => {
            map[type] = [...map[type]].sort((a, b) => parseInt(a) - parseInt(b));
        });
        return map;
    }

    /** Max level count across all generator types */
    function maxLevelCount(genLevelMap) {
        return Math.max(...Object.values(genLevelMap).map(ids => ids.length));
    }

    /**
     * Render single global level dropdown.
     * Returns initial selectedLevelIndex (0-based).
     */
    function initGenLevelPanel(genLevelMap, onChangeCallback) {
        const sel = $('gen-global-level');
        if (!sel) return 0;

        const maxLevels = maxLevelCount(genLevelMap);
        for (let i = 0; i < maxLevels; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Cấp ${i + 4}`;
            sel.appendChild(opt);
        }
        sel.value = 0;
        updateLevelDesc(genLevelMap, 0);

        sel.addEventListener('change', () => {
            const idx = parseInt(sel.value);
            updateLevelDesc(genLevelMap, idx);
            onChangeCallback(idx);
        });

        return 0;
    }

    function updateLevelDesc(genLevelMap, levelIdx) {
        const desc = $('gen-level-desc');
        if (!desc) return;
        // Show a sample: FruitNutGenerator → id 1003 etc.
        const samples = Object.entries(genLevelMap).slice(0, 3).map(([type, ids]) => {
            const id = ids[Math.min(levelIdx, ids.length - 1)];
            return `${type} #${id}`;
        });
        desc.textContent = samples.join(' · ') + (Object.keys(genLevelMap).length > 3 ? ' · ...' : '');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 1 — Build lv1 energy từ RateGenerator theo level index
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @param {object[]} rateGenRows
     * @param {Object.<string, string[]>} genLevelMap  — genType → sorted id list
     * @param {number} levelIdx  — 0-based index
     * @returns {Object.<string, {energy: number, genType: string, genId: string}>}
     */
    function buildLv1EnergyFromGenerator(rateGenRows, genLevelMap, levelIdx) {
        // Resolve which id to use per generator type
        const selectedIds = {};
        Object.entries(genLevelMap).forEach(([type, ids]) => {
            selectedIds[type] = ids[Math.min(levelIdx, ids.length - 1)];
        });

        // Collect cost_energy per generator key
        const genMeta = {};
        rateGenRows.forEach(r => {
            if (!r.type || !r.id || !r.cost_energy) return;
            const key = r.type + '_' + r.id;
            if (!genMeta[key]) {
                genMeta[key] = { genType: r.type, genId: r.id, costEnergy: parseFloat(r.cost_energy) || 0 };
            }
        });

        const map = {};
        rateGenRows.forEach(r => {
            if (!r.item_id || !r.rate) return;
            const rate = parseFloat(r.rate) || 0;
            if (rate <= 0) return;
            if (r.id !== selectedIds[r.type]) return;

            const meta   = genMeta[r.type + '_' + r.id];
            if (!meta) return;

            const energy = meta.costEnergy / (rate / 100);
            const itemId = r.item_id.trim();
            if (map[itemId] == null || energy < map[itemId].energy) {
                map[itemId] = { energy, genType: meta.genType, genId: meta.genId };
            }
        });

        return map;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 2 — Build chain lookup from itemRaw
    // chain: type → [{ id, sumMerge }] ordered by position in chain
    // ═════════════════════════════════════════════════════════════════════════

    function buildChainMap(itemRaw) {
        const chains = {};
        itemRaw.forEach(r => {
            if (!r.type || !r.id) return;
            if (!chains[r.type]) chains[r.type] = [];
            chains[r.type].push({ id: r.id, sumMerge: parseFloat(r.sum_merge) || 1 });
        });
        return chains;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 3 — Build full energy map
    // energy(lvN) = energy(lv1) × (sumMerge(lvN) / sumMerge(lv1))
    // This handles expand chains where lv1 sumMerge ≠ 1.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @param {object[]} itemRaw
     * @param {object}   lv1Map   — từ buildLv1EnergyFromGenerator
     * @param {object[]} itemExpand
     * @returns {Object.<string, {energy: number, source: string, sourceDetail: string}>}
     */
    function buildFullEnergyMap(itemRaw, lv1Map, itemExpand) {
        const chains    = buildChainMap(itemRaw);
        const energyMap = {};

        // ── Generator chains ──────────────────────────────────────────────
        Object.entries(chains).forEach(([type, items]) => {
            const lv1Item = items[0];
            const lv1Src  = lv1Map[lv1Item.id];
            if (!lv1Src) return;

            const lv1Energy   = lv1Src.energy;
            const lv1SumMerge = lv1Item.sumMerge; // usually 1 for true lv1
            const detail      = `${lv1Src.genType} #${lv1Src.genId}`;

            items.forEach(item => {
                // Relative multiplier from lv1
                const energy = lv1Energy * (item.sumMerge / lv1SumMerge);
                energyMap[item.id] = { energy, source: 'generator', sourceDetail: detail };
            });
        });

        // ── Expand chains ─────────────────────────────────────────────────
        // Build lookup: parentId → [{ expandType, expandLv1Id, costEnergy }]
        const expandMap = {};
        itemExpand.forEach(r => {
            if (!r.type || !r.id || !r.item_save_type || !r.id_item) return;
            const parentId = r.id;
            if (!expandMap[parentId]) expandMap[parentId] = [];
            expandMap[parentId].push({
                expandType:  r.item_save_type,
                expandLv1Id: r.id_item,
                costEnergy:  parseFloat(r.cost_energy) || 1,
            });
        });

        Object.entries(expandMap).forEach(([parentId, expands]) => {
            const parentEntry = energyMap[parentId];
            if (!parentEntry) return;

            expands.forEach(({ expandType, expandLv1Id, costEnergy }) => {
                const expandChain = chains[expandType];
                if (!expandChain) return;

                // Find the lv1 item of this expand chain
                const expandLv1Item = expandChain.find(it => it.id === expandLv1Id);
                if (!expandLv1Item) return;

                // energy(expand_lv1) = parent energy + tap cost
                const expandLv1Energy = parentEntry.energy + costEnergy;

                expandChain.forEach(item => {
                    // Relative multiplier: ratio to the expand chain's lv1 sumMerge
                    const newEnergy = expandLv1Energy * (item.sumMerge / expandLv1Item.sumMerge);
                    const existing  = energyMap[item.id];
                    if (!existing || newEnergy < existing.energy) {
                        energyMap[item.id] = {
                            energy: newEnergy,
                            source: 'expand',
                            sourceDetail: `Expand từ ${parentId}`,
                        };
                    }
                });
            });
        });

        return energyMap;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 4 — Build rows for sub-tab Item Raw
    // ═════════════════════════════════════════════════════════════════════════

    function buildRawEnergyRows(itemRaw, energyMap) {
        return itemRaw.map(item => {
            const entry  = energyMap[item.id] || null;
            const energy = entry?.energy ?? null;
            const src    = entry
                ? sourceBadge(entry.source)
                : `<span style="color:var(--text-muted);font-size:0.78rem">No generator</span>`;
            const detail = entry?.sourceDetail || '';

            return {
                type: item.type || '', itemId: item.id || '',
                itemName: item.name_item || '',
                sumMerge: parseFloat(item.sum_merge) || 1,
                energy,
                source: entry?.source || '',
                html: `<tr>
                    <td style="color:var(--accent)">${item.type || ''}</td>
                    <td class="mono" style="color:var(--energy)">${item.id || ''}</td>
                    <td>${item.name_item || ''}</td>
                    <td class="mono" style="color:var(--text-muted)">${item.sum_merge || ''}</td>
                    <td>${src}<br><span style="font-size:0.72rem;color:var(--text-muted)">${detail}</span></td>
                    <td style="text-align:right">${energyCell(energy, true)}</td>
                </tr>`,
            };
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STEP 5 — Build rows for sub-tab Recipes
    // ═════════════════════════════════════════════════════════════════════════

    function buildIngredientCell(type, id, energyMap, nameMap) {
        if (!type && !id) return { html: '—', energy: null };
        const e    = energyMap[id]?.energy ?? null;
        const name = nameMap[id] || '';
        const lbl  = name ? `<span style="color:var(--text-main);font-size:0.8rem">${name}</span><br>` : '';
        const idSp = `<span class="mono" style="color:var(--accent);font-size:0.78rem">${type} ${id}</span>`;
        const eSp  = e != null ? `<br>${energyCell(e)}` : `<br>${naCell()}`;
        return { html: lbl + idSp + eSp, energy: e };
    }

    function buildRecipeEnergyRows(formuaRecipes, energyMap, nameMap) {
        return formuaRecipes.map(r => {
            const ings = [
                { type: r['Ingredient1Type'] || '', id: r['Ingredient1Id'] || '' },
                { type: r['Ingredient2Type'] || '', id: r['Ingredient2Id'] || '' },
                { type: r['Ingredient3Type'] || '', id: r['Ingredient3Id'] || '' },
            ].filter(ing => ing.type || ing.id);

            let totalEnergy = 0;
            let hasUnknown  = false;
            const cells = ings.map(ing => {
                const { html, energy } = buildIngredientCell(ing.type, ing.id, energyMap, nameMap);
                if (energy != null) totalEnergy += energy;
                else hasUnknown = true;
                return html;
            });
            while (cells.length < 3) cells.push('—');

            const computable = ings.length === 0 ? 'no'
                : hasUnknown ? (totalEnergy > 0 ? 'partial' : 'no')
                : 'yes';

            const totalDisplay = computable === 'no'
                ? naCell()
                : computable === 'partial'
                    ? energyCell(totalEnergy) + ` <span style="color:var(--warning);font-size:0.72rem">+N/A</span>`
                    : energyCell(totalEnergy, true);

            const resultId   = r['ResultId'] || '';
            const resultType = r['ResultType'] || '';
            const resultName = r['ResultName'] || nameMap[resultId] || '—';

            return {
                tool: r['TypeTool'] || '', resultType, resultId, resultName,
                totalEnergy: computable === 'no' ? null : totalEnergy,
                computable,
                html: `<tr>
                    <td>${badge(r['TypeTool'] || '—', 'rgba(99,102,241,0.15)', '#6366f188', '#818cf8')}</td>
                    <td style="color:var(--accent)">${resultType}</td>
                    <td class="mono" style="color:var(--energy)">${resultId}</td>
                    <td>${resultName}</td>
                    <td style="font-size:0.82rem;line-height:1.6">${cells[0]}</td>
                    <td style="font-size:0.82rem;line-height:1.6">${cells[1]}</td>
                    <td style="font-size:0.82rem;line-height:1.6">${cells[2]}</td>
                    <td style="text-align:right">${totalDisplay}</td>
                </tr>`,
            };
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INIT SUB-TABS
    // ═════════════════════════════════════════════════════════════════════════

    // Holds filter+sort state so re-render doesn't reset them
    const rawState    = { sortKey: 'energy', sortAsc: true };
    const recipeState = { sortKey: 'totalEnergy', sortAsc: true };

    function initRawEnergy(energyMap, isFirstInit) {
        const data    = window.GameData;
        const allRows = buildRawEnergyRows(data.itemRaw || [], energyMap);

        if (isFirstInit) {
            setText('eraw-total-count', allRows.length.toLocaleString());
            fillSelect('eraw-filter-type',   [...new Set(allRows.map(r => r.type).filter(Boolean))].sort());
            fillSelect('eraw-filter-source', [...new Set(allRows.map(r => r.source).filter(Boolean))].sort());
        }

        function render() {
            const search  = ($('eraw-search')?.value || '').toLowerCase().trim();
            const typeF   = $('eraw-filter-type')?.value || '';
            const sourceF = $('eraw-filter-source')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (typeF   && r.type   !== typeF)   return false;
                    if (sourceF && r.source !== sourceF) return false;
                    if (search  && !r.itemName.toLowerCase().includes(search)
                               && !r.itemId.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, rawState.sortKey, rawState.sortAsc));
            setText('eraw-result-count', filtered.length.toLocaleString() + ' items');
            renderRows('eraw-body', filtered, 6);
        }

        if (isFirstInit) {
            bindSort('eraw-table',
                () => ({ key: rawState.sortKey, asc: rawState.sortAsc }),
                (k, a) => { rawState.sortKey = k; rawState.sortAsc = a; },
                render);
            bindFilters(['eraw-search', 'eraw-filter-type', 'eraw-filter-source'], render);
        }
        render();
    }

    function initRecipeEnergy(energyMap, isFirstInit) {
        const data    = window.GameData;
        const nameMap = {};
        (data.itemRaw || []).forEach(r => { if (r.id) nameMap[r.id] = r.name_item || ''; });

        const allRows = buildRecipeEnergyRows(data.formuaRecipes || [], energyMap, nameMap);

        if (isFirstInit) {
            setText('erecipe-total-count', allRows.length.toLocaleString());
            fillSelect('erecipe-filter-tool', [...new Set(allRows.map(r => r.tool).filter(Boolean))].sort());
            fillSelect('erecipe-filter-type', [...new Set(allRows.map(r => r.resultType).filter(Boolean))].sort());
        }

        function render() {
            const search      = ($('erecipe-search')?.value || '').toLowerCase().trim();
            const toolF       = $('erecipe-filter-tool')?.value || '';
            const typeF       = $('erecipe-filter-type')?.value || '';
            const computableF = $('erecipe-filter-computable')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (toolF       && r.tool       !== toolF)      return false;
                    if (typeF       && r.resultType !== typeF)       return false;
                    if (computableF && r.computable !== computableF) return false;
                    if (search && !r.resultName.toLowerCase().includes(search)
                               && !r.resultId.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, recipeState.sortKey, recipeState.sortAsc));
            setText('erecipe-result-count', filtered.length.toLocaleString() + ' recipes');
            renderRows('erecipe-body', filtered, 8);
        }

        if (isFirstInit) {
            bindSort('erecipe-table',
                () => ({ key: recipeState.sortKey, asc: recipeState.sortAsc }),
                (k, a) => { recipeState.sortKey = k; recipeState.sortAsc = a; },
                render);
            bindFilters(['erecipe-search', 'erecipe-filter-tool',
                         'erecipe-filter-type', 'erecipe-filter-computable'], render);
        }
        render();
    }

    // Rebuild energy map + re-render both sub-tabs without resetting filters
    let _genLevelMap = {};
    function rebuildAndRender(levelIdx) {
        const data      = window.GameData;
        const lv1Map    = buildLv1EnergyFromGenerator(data.rateGenerator || [], _genLevelMap, levelIdx);
        const energyMap = buildFullEnergyMap(data.itemRaw || [], lv1Map, data.itemExpand || []);
        initRawEnergy(energyMap, false);
        initRecipeEnergy(energyMap, false);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC
    // ═════════════════════════════════════════════════════════════════════════

    function init() {
        if (!window.GameData) return;

        const data = window.GameData;

        // Sub-tab nav scoped in #energy-calculator
        document.querySelectorAll('#energy-calculator .encyc-sub-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#energy-calculator .encyc-sub-tab')
                    .forEach(b => b.classList.remove('active'));
                document.querySelectorAll('#energy-calculator .encyc-subtab-content')
                    .forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const panel = document.getElementById(btn.getAttribute('data-subtab'));
                if (panel) panel.classList.add('active');
            });
        });

        // Build generator level panel
        _genLevelMap         = buildGenLevelMap(data.rateGenerator || []);
        const levelIdx       = initGenLevelPanel(_genLevelMap, rebuildAndRender);

        // Initial energy calculation
        const lv1Map    = buildLv1EnergyFromGenerator(data.rateGenerator || [], _genLevelMap, levelIdx);
        const energyMap = buildFullEnergyMap(data.itemRaw || [], lv1Map, data.itemExpand || []);

        initRawEnergy(energyMap, true);
        initRecipeEnergy(energyMap, true);
    }

    return { init };

})();
