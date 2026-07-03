/**
 * orderPreview.js — Unity-style batch/order preview cards for Order Analysis.
 *
 * Tái hiện panel "Preview" của OrderBatchGenerator (Unity Editor): mỗi order là 1 card
 * với icon item lớn, phương trình recipe [nguyên liệu]+[tool]=[món], chip tier Dễ/TB/Khó,
 * icon energy + số, và hàng "Generator sử dụng".
 *
 * Icon lấy từ assets/items/{id}.png (id = full item id, trùng order item id).
 * Phụ thuộc: window.IconManifest (js/data-icons.js), window.GameData, energyMap.
 */
const OrderPreview = (() => {

    const M        = window.IconManifest || { items: {}, toolReps: {}, genReps: {} };
    const ITEM_DIR = 'assets/items/';

    const hasIcon = id => Object.prototype.hasOwnProperty.call(M.items, String(id));

    // ── Icon <img> builders ────────────────────────────────────────────────────

    function itemImg(id, sizeClass) {
        const sid = String(id);
        if (!hasIcon(sid)) return `<span class="op-ph ${sizeClass}"></span>`;
        return `<img class="op-ic ${sizeClass}" src="${ITEM_DIR}${sid}.png" loading="lazy" alt="">`;
    }

    // Dùng emoji ⚡ cho đồng bộ với phần còn lại của dashboard (stat card, chart legend...)
    function energyBadge(value, cls) {
        const v = value > 0 ? (value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString()) : '—';
        return `<span class="${cls}">${v} <span class="op-energy-em">⚡</span></span>`;
    }

    function goldBadge(value) {
        const g = parseInt(value) || 0;
        return g > 0 ? `<span class="op-order-gold">${g.toLocaleString()} <span class="op-gold-em">🪙</span></span>` : '';
    }

    const TIER_LABEL = { easy: 'Dễ', medium: 'TB', hard: 'Khó' };
    function tierChip(tier) {
        return `<span class="op-tier op-tier-${tier}">${TIER_LABEL[tier]}</span>`;
    }

    // ── Context: recipe / generator / name / tier lookups ──────────────────────

    /** ingredients "700501,700507,700507" → [{id,count}] giữ thứ tự, gộp trùng = số lượng. */
    function parseIngredients(str) {
        const order = [], count = {};
        String(str || '').split(',').map(s => s.trim()).filter(Boolean).forEach(id => {
            if (count[id] === undefined) { count[id] = 0; order.push(id); }
            count[id]++;
        });
        return order.map(id => ({ id, count: count[id] }));
    }

    function buildContext(gd, energyMap) {
        const itemData = gd.itemData      || [];
        const recipes  = gd.formuaRecipes || [];
        const gens     = gd.itemGenerator || gd.rateGenerator || [];

        const itemById = {};
        itemData.forEach(r => { if (r.itemID) itemById[r.itemID] = r; });

        // resultId → { toolName, toolIcon, ings:[{id,count}] }
        const recipeMap = {};
        recipes.forEach(r => {
            const rid = r.ResultId || r.itemID;
            if (!rid) return;
            const toolName = r.TypeTool || r.tool || '';
            const toolKey  = toolName.replace(/\s+/g, '');   // "Chef Counter" → "ChefCounter"
            const toolRep  = hasIcon(r.toolId) ? r.toolId : (M.toolReps[toolKey] || null);
            recipeMap[rid] = { toolName, toolIcon: toolRep, ings: parseIngredients(r.ingredients) };
        });

        // rawItemId → genId (máy sản xuất ra item raw đó)
        const rawToGen = {};
        gens.forEach(g => { if (g.item_id && !rawToGen[g.item_id]) rawToGen[g.item_id] = g.id; });

        const genName = genId =>
            (itemById[genId] && itemById[genId].name_item) || `Generator ${genId}`;

        const itemName = id => {
            const r = itemById[id];
            return (r && r.name_item) || String(id);
        };

        const energyOf = id => {
            const e = energyMap[id];
            const v = e ? (e.energy ?? e) : 0;
            return typeof v === 'number' ? v : 0;
        };

        // tier theo tercile năng lượng của toàn bộ order item (thích ứng theo data)
        const all = [];
        Object.keys(energyMap).forEach(id => { const v = energyOf(id); if (v > 0) all.push(v); });
        all.sort((a, b) => a - b);
        const q = p => all.length ? all[Math.min(all.length - 1, Math.floor(all.length * p))] : 0;
        const t1 = q(0.34), t2 = q(0.67);
        const tierOf = energy => (energy <= 0 ? 'easy' : energy < t1 ? 'easy' : energy < t2 ? 'medium' : 'hard');

        // gom generator dùng cho 1 item (đệ quy qua nguyên liệu recipe), dedup theo tên
        function collectGens(id, out, seen) {
            if (seen.has(id) || seen.size > 40) return;
            seen.add(id);
            const rc = recipeMap[id];
            if (rc) { rc.ings.forEach(ing => collectGens(ing.id, out, seen)); return; }
            const g = rawToGen[id];
            if (g) out[genName(g)] = g; // name → representative genId
        }
        const gensForOrder = itemIds => {
            const out = {};
            itemIds.forEach(id => collectGens(id, out, new Set()));
            return Object.entries(out).map(([name, genId]) => ({ name, genId }));
        };

        return { recipeMap, itemName, energyOf, tierOf, gensForOrder };
    }

    // ── Row rendering ──────────────────────────────────────────────────────────

    function recipeRowHtml(resultId, amount, ctx) {
        const rc = ctx.recipeMap[resultId];
        const parts = [];
        rc.ings.forEach((ing, i) => {
            if (i > 0) parts.push(`<span class="op-eq-op">+</span>`);
            parts.push(itemImg(ing.id, 'op-ic-sm'));
            if (ing.count > 1) parts.push(`<span class="op-mult">×${ing.count}</span>`);
        });
        if (rc.toolIcon) {
            parts.push(`<span class="op-eq-op">+</span>`);
            parts.push(itemImg(rc.toolIcon, 'op-ic-sm'));
        }
        parts.push(`<span class="op-eq-op">=</span>`);
        parts.push(itemImg(resultId, 'op-ic-lg'));
        return `<div class="op-eq">${parts.join('')}</div>`;
    }

    function itemRowHtml(id, amount, ctx) {
        const energy = ctx.energyOf(id);
        const tier   = ctx.tierOf(energy);
        const visual = ctx.recipeMap[id]
            ? recipeRowHtml(id, amount, ctx)
            : itemImg(id, 'op-ic-lg');
        const amt = amount > 1 ? ` <span class="op-mult">× ${amount}</span>` : '';
        return `
            <div class="op-item-row">
                ${visual}
                <span class="op-item-name">${ctx.itemName(id)}${amt}</span>
                ${energyBadge(energy, 'op-energy-sm')}
                ${tierChip(tier)}
            </div>`;
    }

    function orderCardHtml(oid, order, ctx, orderEnergy, getItemIds) {
        const ids   = getItemIds(order);
        const total = orderEnergy(order);
        const tier  = ctx.tierOf(ids.reduce((mx, id) => Math.max(mx, ctx.energyOf(id)), 0));
        const npc   = order.idNPC ? `<span class="op-npc">NPC ${order.idNPC}</span>` : '';

        const rows = ids.map(id => {
            const amt = orderItemAmount(order, id);
            return itemRowHtml(id, amt, ctx);
        }).join('');

        const gens = ctx.gensForOrder(ids);
        const genRow = gens.length ? `
            <div class="op-gen-row">
                <span class="op-gen-label">Generator sử dụng:</span>
                ${gens.map(g => `<span class="op-gen-chip">${itemImg(g.genId, 'op-ic-gen')}${g.name}</span>`).join('')}
            </div>` : '';

        return `
            <div class="op-order-card">
                <div class="op-order-head">
                    <span class="op-order-title">Order #${oid}</span>
                    ${npc}
                    ${tierChip(tier)}
                    <span class="op-order-meta">
                        ${goldBadge(order.gold)}
                        ${energyBadge(total, 'op-order-energy')}
                    </span>
                </div>
                ${rows}
                ${genRow}
            </div>`;
    }

    // amount cho từng item id trong order (order lưu item1/item2)
    function orderItemAmount(order, id) {
        for (let i = 1; i <= 2; i++) {
            if (order[`item${i}_id`] === id) return parseInt(order[`item${i}_amount`]) || 1;
        }
        return 1;
    }

    /**
     * Render toàn bộ vùng batch/order cards.
     * @param {HTMLElement} container
     * @param {Array} batches      orderSystem đã lọc
     * @param {Object} orderMap    orderId → order
     * @param {Object} ctx         từ buildContext
     * @param {Object} api         { getItemIds(batch), getOrderIds(batch), orderEnergy(order), palette, avgEnergy(batch) }
     */
    function render(container, batches, orderMap, ctx, api) {
        container.innerHTML = batches.map((batch, bi) => {
            const color = api.palette[bi % api.palette.length];
            const oids  = api.getOrderIds(batch);
            const avg   = api.avgEnergy(oids);
            const canRew = batch.canReceiveReward === '1'
                ? `<span class="op-reward-ok">✓ Reward</span>`
                : `<span class="op-reward-no">✗ No reward</span>`;

            const cards = oids.map(oid => {
                const order = orderMap[oid];
                if (!order) return '';
                return orderCardHtml(oid, order, ctx, api.orderEnergy, api.getItemIds);
            }).join('');

            return `
                <div class="op-batch">
                    <div class="op-batch-head" style="border-left:3px solid ${color}">
                        <span class="op-batch-dot" style="background:${color}"></span>
                        <span class="op-batch-id">#${batch.id}</span>
                        <span class="op-batch-theme" style="color:${color}">${batch.themeType}</span>
                        ${canRew}
                        <span class="op-batch-meta">${oids.length} orders · avg <span class="mono" style="color:var(--energy)">${avg} ⚡</span></span>
                    </div>
                    <div class="op-orders">${cards}</div>
                </div>`;
        }).join('');
    }

    return { buildContext, render };

})();
