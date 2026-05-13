/**
 * globalData.js — Global computed data cache
 *
 * Tính toán một lần khi app khởi động, lưu vào ProcessedData.global.
 * Các module khác đọc từ đây thay vì tính lại độc lập.
 *
 * ProcessedData.global = {
 *   energyMap : itemID → { energy, genType, genId, tier, source }
 *   itemMap   : itemID → itemData row
 * }
 */
const GlobalData = (() => {

    // ── Generator level helpers ───────────────────────────────────────────────

    /**
     * Build map: genType → sorted array of gen IDs (ascending = lv4, lv5, lv6…)
     */
    function buildGenLevelMap(rateGenRows) {
        const map = {};
        rateGenRows.forEach(r => {
            if (!r.type || !r.id) return;
            if (!map[r.type]) map[r.type] = new Set();
            map[r.type].add(r.id);
        });
        Object.keys(map).forEach(t => {
            map[t] = [...map[t]].sort((a, b) => parseInt(a) - parseInt(b));
        });
        return map;
    }

    /**
     * Build map: item_id → { energy, genType, genId, rate }
     * energy = cost_energy / (rate/100) for the selected generator level index.
     */
    function buildGenEnergyMap(rateGenRows, genLevelMap, levelIdx) {
        const selectedIds = {};
        Object.entries(genLevelMap).forEach(([type, ids]) => {
            selectedIds[type] = ids[Math.min(levelIdx, ids.length - 1)];
        });

        const genCostEnergy = {};
        rateGenRows.forEach(r => {
            if (!r.type || !r.id || !r.cost_energy) return;
            if (r.id === selectedIds[r.type])
                genCostEnergy[r.type] = parseFloat(r.cost_energy) || 1;
        });

        const map = {};
        rateGenRows.forEach(r => {
            if (!r.item_id || !r.rate || !r.type) return;
            if (r.id !== selectedIds[r.type]) return;
            const rate = parseFloat(r.rate) || 0;
            if (rate <= 0) return;
            const energy = (genCostEnergy[r.type] || 1) / (rate / 100);
            const iid = r.item_id.trim();
            if (map[iid] == null || energy < map[iid].energy)
                map[iid] = { energy, genType: r.type, genId: r.id, rate };
        });
        return map;
    }

    /**
     * Build full energy map at a given generator level index.
     *   Step 1 — Raw items: use itemData.energy_cost (absolute base from CSV)
     *   Step 2 — Level adjustment: scale by ratio vs lv4 baseline
     *   Step 3 — Expand chains: parent.energy + expand.cost_energy, tier-scaled
     *
     * Returns: itemID → { energy, genType, genId, tier, source, sourceDetail }
     */
    function buildFullEnergyMap(itemData, rateGenRows, genLevelMap, levelIdx, itemExpand) {
        const rawItems = itemData.filter(r => r.type === 'Raw');
        const energyMap = {};

        rawItems.forEach(r => {
            const base = parseFloat(r.energy_cost);
            if (!isNaN(base) && base > 0) {
                energyMap[r.itemID] = {
                    energy: base,
                    source: 'generator',
                    sourceDetail: r.name_item || r.itemID,
                    tier: parseInt(r.tier) || 1,
                };
            }
        });

        const genMapBase = buildGenEnergyMap(rateGenRows, genLevelMap, 0);

        if (levelIdx > 0) {
            const genMapSel = buildGenEnergyMap(rateGenRows, genLevelMap, levelIdx);
            rawItems.forEach(r => {
                const iid  = r.itemID;
                const base = genMapBase[iid];
                const sel  = genMapSel[iid];
                if (!base || !sel || !energyMap[iid]) return;
                energyMap[iid] = {
                    ...energyMap[iid],
                    energy:  energyMap[iid].energy * (sel.energy / base.energy),
                    genType: sel.genType,
                    genId:   sel.genId,
                };
            });
        } else {
            rawItems.forEach(r => {
                const g = genMapBase[r.itemID];
                if (g && energyMap[r.itemID]) {
                    energyMap[r.itemID].genType = g.genType;
                    energyMap[r.itemID].genId   = g.genId;
                }
            });
        }

        // Expand chains
        const idToItem = {};
        rawItems.forEach(r => { idToItem[r.itemID] = r; });

        const expandByParent = {};
        (itemExpand || []).forEach(r => {
            const pid = r.itemID || r.id;
            const sid = r.spawn_itemID || r.id_item;
            if (!pid || !sid) return;
            if (!expandByParent[pid]) expandByParent[pid] = [];
            expandByParent[pid].push({ spawnId: sid, costEnergy: parseFloat(r.cost_energy) || 1 });
        });

        Object.entries(expandByParent).forEach(([parentId, spawns]) => {
            const parentEntry = energyMap[parentId];
            if (!parentEntry) return;
            spawns.forEach(({ spawnId, costEnergy }) => {
                const spawnItem = idToItem[spawnId];
                if (!spawnItem) return;
                const expandLv1Energy = parentEntry.energy + costEnergy;
                const lv1Tier = parseInt(spawnItem.tier) || 1;
                rawItems.forEach(r => {
                    if (!energyMap[r.itemID] && r.itemID.startsWith(spawnId.slice(0, 4))) {
                        const tierN = parseInt(r.tier) || 1;
                        energyMap[r.itemID] = {
                            energy:       expandLv1Energy * Math.pow(2, tierN - lv1Tier),
                            source:       'expand',
                            sourceDetail: `Expand từ ${parentId}`,
                            tier:         tierN,
                            genType:      parentEntry.genType,
                            genId:        parentEntry.genId,
                        };
                    }
                });
            });
        });

        return energyMap;
    }

    /**
     * Tính energy cost cho mỗi recipe result = tổng energy của các nguyên liệu.
     * Merge vào energyMap (raw) để mọi module tra cứu một chỗ.
     * Chạy sau buildFullEnergyMap vì recipes phụ thuộc raw item energies.
     */
    function mergeRecipeEnergy(recipes, energyMap) {
        recipes.forEach(r => {
            const resultId = r.ResultId || r.itemID;
            if (!resultId || energyMap[resultId]) return; // đừng overwrite raw entries

            const ingIds = [r['Ingredient1Id'], r['Ingredient2Id'],
                            r['Ingredient3Id'], r['Ingredient4Id']].filter(Boolean);
            if (ingIds.length === 0) return;

            let total = 0, hasUnknown = false;
            ingIds.forEach(id => {
                const e = energyMap[id]?.energy ?? null;
                if (e != null) total += e;
                else hasUnknown = true;
            });

            if (total > 0) {
                energyMap[resultId] = {
                    energy:       total,
                    source:       hasUnknown ? 'recipe-partial' : 'recipe',
                    sourceDetail: r.tool || r.TypeTool || '',
                    tier:         0,
                };
            }
        });
    }

    // ── Public init ──────────────────────────────────────────────────────────

    function init() {
        if (!window.GameData) return;
        const gd = window.GameData;

        const itemData    = gd.itemData       || [];
        const rateGenRows = gd.rateGenerator  || [];
        const itemExpand  = gd.itemExpand     || [];
        const recipes     = gd.formuaRecipes  || [];

        const genLevelMap = buildGenLevelMap(rateGenRows);

        // itemMap: itemID → row  (also index by numeric id for order lookups)
        const itemMap = {};
        itemData.forEach(r => {
            if (r.itemID) itemMap[r.itemID] = r;
            if (r.id)     itemMap[r.id]     = r;
        });

        // energyMap: raw items at base level (gen lv4), then recipe results merged in
        const energyMap = buildFullEnergyMap(itemData, rateGenRows, genLevelMap, 0, itemExpand);
        mergeRecipeEnergy(recipes, energyMap);

        // Fallback: include any itemData entry with energy_cost > 0 not yet mapped
        // (covers Food/Tool/etc. types that have pre-computed energy_cost in CSV)
        itemData.forEach(r => {
            if (!r.itemID || energyMap[r.itemID]) return;
            const e = parseFloat(r.energy_cost);
            if (!isNaN(e) && e > 0) {
                energyMap[r.itemID] = {
                    energy:       e,
                    source:       r.type || 'direct',
                    sourceDetail: r.name_item || r.itemID,
                    tier:         parseInt(r.tier) || 0,
                };
            }
        });

        window.ProcessedData.global = { energyMap, itemMap, genLevelMap };
    }

    return { init, buildGenLevelMap, buildGenEnergyMap, buildFullEnergyMap };

})();
