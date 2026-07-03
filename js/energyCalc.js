/**
 * energyCalc.js — Tab: Energy Calculator
 *
 * Energy cost lấy trực tiếp từ itemData.energy_cost (source of truth từ CSV).
 * Generator level selector ảnh hưởng công thức:
 *   energy_per_tap(gen_lv, item) = cost_energy / (rate/100)
 *   Nhân với tier ratio so với lv1 generator spawn → energy tương đối
 *
 * Công thức:
 *   • Raw item:    energy = itemData.energy_cost  (đã tính sẵn)
 *   • Expand lv1:  energy = parent.energy_cost + expand.cost_energy
 *   • Expand lvN:  energy = expand_lv1.energy × (tier_ratio)
 *   • Recipe:      energy = sum(ingredient.energy_cost)
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
        return badge(src || '?', 'rgba(148,163,184,0.12)', '#94a3b888', '#94a3b8');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GENERATOR LEVEL PANEL
    // genLevelMap: genType → sorted list of gen ids (by numeric value)
    // ═════════════════════════════════════════════════════════════════════════

    const buildGenLevelMap  = (rows)                          => GlobalData.buildGenLevelMap(rows);
    const buildGenEnergyMap = (rows, lvMap, idx)              => GlobalData.buildGenEnergyMap(rows, lvMap, idx);
    const buildFullEnergyMap = (idata, rows, lvMap, idx, exp) => GlobalData.buildFullEnergyMap(idata, rows, lvMap, idx, exp);

    function maxLevelCount(genLevelMap) {
        return Math.max(...Object.values(genLevelMap).map(ids => ids.length));
    }

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
        const samples = Object.entries(genLevelMap).slice(0, 3).map(([type, ids]) => {
            const id = ids[Math.min(levelIdx, ids.length - 1)];
            return `${type} #${id}`;
        });
        desc.textContent = samples.join(' · ') + (Object.keys(genLevelMap).length > 3 ? ' · ...' : '');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // BUILD ROWS — Raw Items
    // ═════════════════════════════════════════════════════════════════════════

    function buildItemGenTypeMap(rateGenRows, itemExpand) {
        const spawnMap = {};
        rateGenRows.forEach(r => {
            if (r.item_id && r.type) spawnMap[r.item_id] = r.type;
        });
        const prefixMap = {};
        Object.entries(spawnMap).forEach(([id, t]) => { prefixMap[id.slice(0, 4)] = t; });
        rateGenRows.forEach(r => {
            if (r.item_id && !spawnMap[r.item_id])
                spawnMap[r.item_id] = prefixMap[r.item_id.slice(0, 4)] || '';
        });
        let changed = true;
        while (changed) {
            changed = false;
            (itemExpand || []).forEach(r => {
                const pid = r.itemID || r.id;
                const sid = r.spawn_itemID || r.id_item || r.id_item_expand;
                if (!pid || !sid) return;
                const parentType = spawnMap[pid] || prefixMap[pid.slice(0, 4)];
                if (parentType && !spawnMap[sid]) {
                    spawnMap[sid] = parentType;
                    prefixMap[sid.slice(0, 4)] = parentType;
                    changed = true;
                }
            });
        }
        return spawnMap;
    }

    function buildRawEnergyRows(itemData, energyMap, spawnMap) {
        const rawItems = itemData.filter(r => r.type === 'Raw');
        const prefixGenType = {};
        rawItems.forEach(r => {
            const gt = spawnMap[r.itemID];
            if (gt) prefixGenType[r.itemID.slice(0, 4)] = gt;
        });

        return rawItems.map(item => {
            const genType = spawnMap[item.itemID] || prefixGenType[item.itemID.slice(0, 4)] || '';
            const entry   = energyMap[item.itemID] || null;
            const energy  = entry?.energy ?? null;
            const src     = entry
                ? sourceBadge(entry.source)
                : `<span style="color:var(--text-muted);font-size:0.78rem">No data</span>`;
            const detail  = entry?.sourceDetail || genType || '';

            return {
                genType,
                itemId:   item.itemID   || '',
                itemName: item.name_item || '',
                tier:     parseInt(item.tier) || 0,
                energy,
                source:   entry?.source || '',
                html: `<tr>
                    <td style="color:var(--accent);font-size:0.8rem">${genType || '—'}</td>
                    <td class="mono" style="color:var(--energy)">${item.itemID || ''}</td>
                    <td>${item.name_item || ''}</td>
                    <td class="mono" style="color:var(--text-muted);text-align:center">${item.tier || ''}</td>
                    <td>${src}<br><span style="font-size:0.72rem;color:var(--text-muted)">${detail}</span></td>
                    <td style="text-align:right">${energyCell(energy, true)}</td>
                </tr>`,
            };
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // BUILD ROWS — Recipes
    // ═════════════════════════════════════════════════════════════════════════

    function buildIngredientCell(id, energyMap, nameMap) {
        if (!id) return { html: '<span style="color:var(--text-muted)">—</span>', energy: null };
        const e    = energyMap[id]?.energy ?? null;
        const name = nameMap[id] || id;
        const html = `<div style="display:flex;flex-direction:column;gap:2px;padding:2px 0">
            <span style="color:var(--text-main);font-size:0.82rem;font-weight:500">${name}</span>
            <span class="mono" style="color:var(--accent);font-size:0.75rem">${id}</span>
            ${e != null ? energyCell(e) : naCell()}
        </div>`;
        return { html, energy: e };
    }

    function buildRecipeEnergyRows(recipes, energyMap, nameMap) {
        return recipes.map(r => {
            const ingIds = [r['Ingredient1Id'], r['Ingredient2Id'],
                            r['Ingredient3Id'], r['Ingredient4Id']].filter(Boolean);

            let totalEnergy = 0, hasUnknown = false;
            const cells = ingIds.map(id => {
                const { html, energy } = buildIngredientCell(id, energyMap, nameMap);
                if (energy != null) totalEnergy += energy;
                else hasUnknown = true;
                return html;
            });
            while (cells.length < 3) cells.push('—');

            const computable = ingIds.length === 0 ? 'no'
                : hasUnknown ? (totalEnergy > 0 ? 'partial' : 'no')
                : 'yes';

            const totalDisplay = computable === 'no'
                ? naCell()
                : computable === 'partial'
                    ? energyCell(totalEnergy) + ` <span style="color:var(--warning);font-size:0.72rem">+?</span>`
                    : energyCell(totalEnergy, true);

            const resultId   = r['ResultId'] || r['itemID'] || '';
            const resultName = nameMap[resultId] || r['name_item'] || '—';
            const tool       = r['tool'] || r['TypeTool'] || '';

            return {
                tool, resultId, resultName,
                totalEnergy: computable === 'no' ? null : totalEnergy,
                computable,
                html: `<tr>
                    <td style="vertical-align:middle">${badge(tool || '—', 'rgba(99,102,241,0.15)', '#6366f188', '#818cf8')}</td>
                    <td class="mono" style="color:var(--energy);vertical-align:middle;font-size:0.82rem">${resultId}</td>
                    <td style="vertical-align:middle;font-weight:500">${resultName}</td>
                    <td style="vertical-align:top;padding:6px 8px">${cells[0]}</td>
                    <td style="vertical-align:top;padding:6px 8px">${cells[1]}</td>
                    <td style="vertical-align:top;padding:6px 8px">${cells[2]}</td>
                    <td style="text-align:right;vertical-align:middle">${totalDisplay}</td>
                </tr>`,
            };
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // INIT SUB-TABS
    // ═════════════════════════════════════════════════════════════════════════

    const rawState    = { sortKey: 'energy', sortAsc: true };
    const recipeState = { sortKey: 'totalEnergy', sortAsc: true };

    function initRawEnergy(energyMap, isFirstInit) {
        const data     = window.GameData;
        const spawnMap = buildItemGenTypeMap(data.rateGenerator || [], data.itemExpand || []);
        const allRows  = buildRawEnergyRows(data.itemData || [], energyMap, spawnMap);

        if (isFirstInit) {
            setText('eraw-total-count', allRows.length.toLocaleString());
            fillSelect('eraw-filter-type',
                [...new Set(allRows.map(r => r.genType).filter(Boolean))].sort());
            fillSelect('eraw-filter-source',
                [...new Set(allRows.map(r => r.source).filter(Boolean))].sort());
        }

        function render() {
            const search  = ($('eraw-search')?.value || '').toLowerCase().trim();
            const typeF   = $('eraw-filter-type')?.value || '';
            const sourceF = $('eraw-filter-source')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (typeF   && r.genType !== typeF)   return false;
                    if (sourceF && r.source  !== sourceF) return false;
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
                (k, a) => { rawState.sortKey = k; rawState.sortAsc = a; }, render);
            bindFilters(['eraw-search', 'eraw-filter-type', 'eraw-filter-source'], render);
        }
        render();
    }

    function initRecipeEnergy(energyMap, isFirstInit) {
        const data    = window.GameData;
        const nameMap = {};
        (data.itemData || []).forEach(r => {
            if (r.itemID) nameMap[r.itemID] = r.name_item || '';
        });

        const allRows = buildRecipeEnergyRows(data.formuaRecipes || [], energyMap, nameMap);

        if (isFirstInit) {
            setText('erecipe-total-count', allRows.length.toLocaleString());
            fillSelect('erecipe-filter-tool',
                [...new Set(allRows.map(r => r.tool).filter(Boolean))].sort());
        }

        function render() {
            const search      = ($('erecipe-search')?.value || '').toLowerCase().trim();
            const toolF       = $('erecipe-filter-tool')?.value || '';
            const computableF = $('erecipe-filter-computable')?.value || '';
            const filtered = allRows
                .filter(r => {
                    if (toolF       && r.tool       !== toolF)      return false;
                    if (computableF && r.computable !== computableF) return false;
                    if (search && !r.resultName.toLowerCase().includes(search)
                               && !r.resultId.includes(search)) return false;
                    return true;
                })
                .sort((a, b) => sortByKey(a, b, recipeState.sortKey, recipeState.sortAsc));
            setText('erecipe-result-count', filtered.length.toLocaleString() + ' recipes');
            renderRows('erecipe-body', filtered, 7);
        }

        if (isFirstInit) {
            bindSort('erecipe-table',
                () => ({ key: recipeState.sortKey, asc: recipeState.sortAsc }),
                (k, a) => { recipeState.sortKey = k; recipeState.sortAsc = a; }, render);
            bindFilters(['erecipe-search', 'erecipe-filter-tool',
                         'erecipe-filter-computable'], render);
        }
        render();
    }

    function rebuildAndRender(levelIdx) {
        const data      = window.GameData;
        const glb       = window.ProcessedData.global;
        const energyMap = GlobalData.buildFullEnergyMap(
            data.itemData || [], data.rateGenerator || [],
            glb.genLevelMap, levelIdx, data.itemExpand || []);
        initRawEnergy(energyMap, false);
        initRecipeEnergy(energyMap, false);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC
    // ═════════════════════════════════════════════════════════════════════════

    function init() {
        if (!window.GameData || !window.ProcessedData?.global) return;

        const energyPanel = document.getElementById('panel-energy');
        if (energyPanel) TableUtils.initSubTabs(energyPanel);

        const glb      = window.ProcessedData.global;
        const levelIdx = initGenLevelPanel(glb.genLevelMap, rebuildAndRender);

        initRawEnergy(glb.energyMap, true);
        initRecipeEnergy(glb.energyMap, true);
    }

    return { init };

})();
