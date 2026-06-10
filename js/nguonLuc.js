/**
 * nguonLuc.js — Tab: Nguồn Lực (Resource Analysis)
 *
 * Generator × Batch và Tool × Batch heatmap matrices.
 * Traceback: Order → Recipe → Raw ingredients → Generator / Tool
 */
const NguonLuc = (() => {

    let _matrixData = null;

    // ── Helpers ───────────────────────────────────────────────────────────────

    function getBatchOrderIds(batch) {
        const ids = [];
        for (let i = 1; i <= 7; i++) {
            const oid = batch[`order${i}_idOrder`];
            if (oid !== '' && oid !== undefined) ids.push(oid);
        }
        return ids;
    }

    // ── Data Building ─────────────────────────────────────────────────────────

    function buildLookups(gd) {
        // food item → { toolId, toolName, ingredients[] }
        const foodInfo = {};
        (gd.formuaRecipes || []).forEach(r => {
            const id = r.ResultId || r.itemID;
            if (!id) return;
            const ings = [r.Ingredient1Id, r.Ingredient2Id, r.Ingredient3Id, r.Ingredient4Id]
                .filter(Boolean);
            if (!foodInfo[id]) {
                foodInfo[id] = {
                    toolId:   r.toolId   || '',
                    toolName: r.tool     || r.TypeTool || r.toolId || '',
                    ingredients: ings,
                };
            }
        });

        // genId / toolId → display name
        const genNames  = {};
        const toolNames = {};
        (gd.itemData || []).forEach(r => {
            if (!r.itemID) return;
            if (r.type === 'Generator' || r.itemID.startsWith('100')) {
                genNames[r.itemID] = r.name_item || r.itemID;
            }
        });
        Object.values(foodInfo).forEach(f => {
            if (f.toolId && !toolNames[f.toolId]) toolNames[f.toolId] = f.toolName;
        });

        return { foodInfo, genNames, toolNames };
    }

    function buildColumns(orderSystem) {
        const sceneMap = {};
        orderSystem.forEach(batch => {
            const scene = batch.themeType || '';
            if (!scene) return;
            if (!sceneMap[scene]) sceneMap[scene] = [];
            sceneMap[scene].push(batch);
        });

        const sortedScenes = Object.keys(sceneMap).sort();
        sortedScenes.forEach(s => sceneMap[s].sort((a, b) => parseInt(a.id) - parseInt(b.id)));

        const columns = [];
        sortedScenes.forEach(scene => {
            const sceneNum = parseInt(scene.replace(/\D/g, '')) || 0;
            sceneMap[scene].forEach((batch, bi) => {
                columns.push({
                    batchId: batch.id,
                    batchObj: batch,
                    scene,
                    sceneNum,
                    label: `S${sceneNum}-B${bi + 1}`,
                });
            });
        });
        return columns;
    }

    function buildMatrixData(gd, energyMap) {
        const { foodInfo, genNames, toolNames } = buildLookups(gd);
        const orderMap = {};
        (gd.orderDetail || []).forEach(o => { orderMap[o.orderId] = o; });
        const columns = buildColumns(gd.orderSystem || []);

        const genUsage  = {};  // genId  → { [batchId]: count }
        const toolUsage = {};  // toolId → { [batchId]: count }

        function add(map, key, batchId, qty) {
            if (!key || qty <= 0) return;
            if (!map[key]) map[key] = {};
            map[key][batchId] = (map[key][batchId] || 0) + qty;
        }

        function traceItem(itemId, qty, batchId) {
            if (!itemId || qty <= 0) return;
            const food = foodInfo[itemId];
            if (food) {
                add(toolUsage, food.toolId, batchId, qty);
                food.ingredients.forEach(ing => traceItem(ing, qty, batchId));
            } else {
                const entry = energyMap[itemId];
                if (entry?.genId) add(genUsage, entry.genId, batchId, qty);
            }
        }

        columns.forEach(col => {
            getBatchOrderIds(col.batchObj).forEach(oid => {
                const order = orderMap[oid];
                if (!order) return;
                for (let i = 1; i <= 2; i++) {
                    const id  = order[`item${i}_id`];
                    const qty = parseInt(order[`item${i}_amount`]) || 0;
                    if (id && qty > 0) traceItem(id, qty, col.batchId);
                }
            });
        });

        function buildRows(usageMap, nameMap) {
            return Object.keys(usageMap).map(id => ({
                id,
                name:  nameMap[id] || id,
                total: Object.values(usageMap[id]).reduce((a, b) => a + b, 0),
                cells: usageMap[id],
            })).sort((a, b) => b.total - a.total);
        }

        return {
            columns,
            genRows:  buildRows(genUsage,  genNames),
            toolRows: buildRows(toolUsage, toolNames),
        };
    }

    // ── Heatmap color ─────────────────────────────────────────────────────────

    function heatColor(val, maxVal) {
        if (!val) return null;
        const r = val / maxVal;
        if (r <= 0.15) return { bg: 'rgba(96,165,250,0.35)',  text: '#93c5fd' };
        if (r <= 0.35) return { bg: 'rgba(96,165,250,0.7)',   text: '#bfdbfe' };
        if (r <= 0.55) return { bg: 'rgba(251,191,36,0.75)',  text: '#fef08a' };
        if (r <= 0.75) return { bg: 'rgba(249,115,22,0.85)',  text: '#fed7aa' };
        return              { bg: 'rgba(239,68,68,0.9)',    text: '#fca5a5' };
    }

    // ── Matrix Renderer ───────────────────────────────────────────────────────

    function renderMatrix({ containerId, rows, columns, maxVal, rowLabel, totalLabel, search }) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Scene group spans for header row 1
        const groups = [];
        columns.forEach((col, i) => {
            const last = groups[groups.length - 1];
            if (!last || last.scene !== col.scene) {
                groups.push({ scene: col.scene, sceneNum: col.sceneNum, span: 1 });
            } else {
                last.span++;
            }
        });

        const filteredRows = search
            ? rows.filter(r =>
                r.name.toLowerCase().includes(search) ||
                r.id.toLowerCase().includes(search))
            : rows;

        // Header row 1 — scene groups
        const sceneHeaderCells = groups.map(g =>
            `<th colspan="${g.span}"
                 style="padding:.2rem .4rem;font-size:.72rem;font-weight:700;color:#38bdf8;
                        text-align:center;border-bottom:2px solid rgba(56,189,248,.4);
                        border-left:1px solid rgba(56,189,248,.2)">
                S${g.sceneNum}
            </th>`
        ).join('');

        // Header row 2 — batch labels (vertical text)
        let sceneIdx = -1;
        let prevScene = null;
        const batchHeaderCells = columns.map(col => {
            const first = col.scene !== prevScene;
            prevScene = col.scene;
            return `<th style="min-width:32px;max-width:32px;width:32px;padding:.15rem 0;
                               font-size:.58rem;color:#94a3b8;font-weight:500;text-align:center;
                               white-space:nowrap;writing-mode:vertical-lr;
                               transform:rotate(180deg);height:52px;
                               ${first ? 'border-left:1px solid rgba(56,189,248,.15)' : ''}">
                ${col.label}
            </th>`;
        }).join('');

        // Data rows
        let prevSceneData = null;
        const rowsHtml = filteredRows.map(row => {
            let prevSceneInRow = null;
            const cells = columns.map(col => {
                const first = col.scene !== prevSceneInRow;
                prevSceneInRow = col.scene;
                const val = row.cells[col.batchId] || 0;
                const borderL = first ? 'border-left:1px solid rgba(56,189,248,.06)' : '';
                if (!val) return `<td style="min-width:32px;width:32px;${borderL}"></td>`;
                const c = heatColor(val, maxVal);
                return `<td style="min-width:32px;width:32px;text-align:center;padding:.1rem;
                                   font-size:.72rem;font-weight:700;
                                   font-family:'JetBrains Mono',monospace;
                                   background:${c.bg};color:${c.text};${borderL}">${val}</td>`;
            }).join('');

            return `<tr style="border-bottom:1px solid rgba(255,255,255,.03)">
                <td style="padding:.4rem .75rem;white-space:nowrap;position:sticky;left:0;z-index:2;
                           background:#0f172a;min-width:140px;max-width:140px;width:140px;
                           border-right:1px solid rgba(148,163,184,.08)">
                    <div style="font-size:.8rem;font-weight:600;color:#e2e8f0;
                                overflow:hidden;text-overflow:ellipsis">${row.name}</div>
                    <div style="font-size:.67rem;color:#475569;
                                font-family:'JetBrains Mono',monospace">${row.id}</div>
                </td>
                <td style="text-align:center;padding:.3rem .5rem;
                           font-family:'JetBrains Mono',monospace;font-weight:700;
                           font-size:.9rem;color:#fbbf24;position:sticky;left:140px;z-index:2;
                           background:#0f172a;min-width:60px;width:60px;
                           border-right:1px solid rgba(148,163,184,.08)">${row.total.toLocaleString()}</td>
                ${cells}
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="overflow:auto;max-height:380px">
                <table style="border-collapse:collapse">
                    <thead style="position:sticky;top:0;z-index:3;background:#0f172a">
                        <tr>
                            <th rowspan="2"
                                style="position:sticky;left:0;z-index:5;background:#1e293b;
                                       padding:.5rem .75rem;text-align:left;font-size:.72rem;
                                       color:#94a3b8;white-space:nowrap;min-width:140px;max-width:140px;
                                       border-right:1px solid rgba(148,163,184,.1);
                                       border-bottom:1px solid rgba(148,163,184,.1)">${rowLabel}</th>
                            <th rowspan="2"
                                style="position:sticky;left:140px;z-index:5;background:#1e293b;
                                       padding:.4rem .5rem;font-size:.68rem;color:#fbbf24;
                                       white-space:nowrap;min-width:60px;width:60px;text-align:center;
                                       border-right:1px solid rgba(148,163,184,.1);
                                       border-bottom:1px solid rgba(148,163,184,.1)">${totalLabel}</th>
                            ${sceneHeaderCells}
                        </tr>
                        <tr>${batchHeaderCells}</tr>
                    </thead>
                    <tbody>${rowsHtml || '<tr><td colspan="999" style="padding:1rem;text-align:center;color:#64748b">Không tìm thấy kết quả</td></tr>'}</tbody>
                </table>
            </div>`;
    }

    // ── Render all ────────────────────────────────────────────────────────────

    function renderAll() {
        if (!_matrixData) return;
        const { columns, genRows, toolRows } = _matrixData;
        const search = (document.getElementById('nl-search')?.value || '').toLowerCase().trim();

        const genMax  = Math.max(1, ...genRows.flatMap(r => Object.values(r.cells)));
        const toolMax = Math.max(1, ...toolRows.flatMap(r => Object.values(r.cells)));

        renderMatrix({
            containerId: 'nl-gen-matrix',
            rows: genRows, columns, maxVal: genMax,
            rowLabel: 'Generator Cần Dùng', totalLabel: 'Tổng Lượt Drop', search,
        });
        renderMatrix({
            containerId: 'nl-tool-matrix',
            rows: toolRows, columns, maxVal: toolMax,
            rowLabel: 'Tool Cần Dùng', totalLabel: 'Tổng Lượt Craft', search,
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    function init() {
        if (!window.GameData) return;
        const energyMap = window.ProcessedData?.global?.energyMap || {};
        _matrixData = buildMatrixData(window.GameData, energyMap);
        renderAll();
        document.getElementById('nl-search')?.addEventListener('input', renderAll);
    }

    return { init };

})();
