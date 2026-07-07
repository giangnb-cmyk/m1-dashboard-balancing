/**
 * economyModel.js — Economy data model: chuẩn hoá currency + tính flow Source→Pool→Sink.
 *
 * Không đụng DOM. Trả về {links, nodeValues, balances, meta} cho economyFlow.js vẽ Sankey.
 * Scope: toàn game | 1 scene | 1 batch (order-level flows theo batch, scene-level flows theo scene).
 * Phụ thuộc: window.GameData, energyMap (ProcessedData.global.energyMap).
 */
const EconomyModel = (() => {

    // Unity EnumBase.MoneyTypes — res_id khi res_type = "Money"
    const MONEY = { 1: 'Gold', 2: 'Diamond', 3: 'Energy', 4: 'Energy', 5: 'Exp', 6: 'SkipTime', 7: 'Star', 8: 'Exchange' };

    /** {res_type,res_id,res_number} → {currency, amount, itemId}. currency=null nếu không hiểu. */
    function resolveRes(resType, resId, resNumber) {
        const amount = parseFloat(resNumber) || 0;
        const t = String(resType || '').trim();
        if (t === 'Item' || t === '2') return { currency: 'Item', amount, itemId: String(resId || '') };
        if (t === 'Money' || t === '1') return { currency: MONEY[parseInt(resId)] || 'Gold', amount };
        return { currency: null, amount };
    }

    // ── Scope helpers ──────────────────────────────────────────────────────────

    function getBatchOrderIds(batch) {
        const ids = [];
        for (let i = 1; i <= 7; i++) {
            const oid = batch[`order${i}_idOrder`];
            if (oid !== '' && oid !== undefined) ids.push(oid);
        }
        return ids;
    }

    function scenes(gd) {
        return [...new Set((gd.orderSystem || []).map(b => b.themeType).filter(Boolean))].sort();
    }

    function batchesOf(gd, scene) {
        return (gd.orderSystem || [])
            .filter(b => !scene || b.themeType === scene)
            .sort((a, b) => parseInt(a.id) - parseInt(b.id));
    }

    /** Tập orderId nằm trong scope (theo scene và/hoặc batch). */
    function scopedOrderIds(gd, scope) {
        const ids = new Set();
        (gd.orderSystem || []).forEach(b => {
            if (scope.scene && b.themeType !== scope.scene) return;
            if (scope.batch && b.id !== scope.batch) return;
            getBatchOrderIds(b).forEach(oid => ids.add(oid));
        });
        return ids;
    }

    function orderEnergy(order, energyMap) {
        let total = 0;
        for (let i = 1; i <= 2; i++) {
            const id = order[`item${i}_id`];
            const amt = parseInt(order[`item${i}_amount`]) || 0;
            if (!id || !amt) continue;
            const e = energyMap[id];
            total += (e ? (e.energy ?? e) : 0) * amt;
        }
        return total;
    }

    // ── Flow computation ────────────────────────────────────────────────────────

    function compute(gd, energyMap, scope) {
        scope = scope || {};
        const sceneFilter = scope.scene || '';
        const links = [];   // {from, to, currency, value}
        const add = (from, to, currency, value) => {
            if (value > 0) links.push({ from, to, currency, value: Math.round(value * 10) / 10 });
        };
        const inScene = row => !sceneFilter || (row.theme_type || row.theme) === sceneFilter;

        // orderDetail lookup
        const orderMap = {};
        (gd.orderDetail || []).forEach(o => { orderMap[o.orderId] = o; });
        const orderIds = scopedOrderIds(gd, scope);

        // ── Sources → Pools ──
        // 1) Order gold (per-order) → Gold
        let goldIn = 0, energyDemand = 0;
        orderIds.forEach(oid => {
            const o = orderMap[oid];
            if (!o) return;
            goldIn += parseFloat(o.gold) || 0;
            energyDemand += orderEnergy(o, energyMap);
        });
        add('order_gold', 'Gold', 'Gold', goldIn);
        add('Energy', 'fulfill', 'Energy', energyDemand);        // Hoàn thành order tiêu Energy

        // Reward/Build là dữ liệu cấp SCENE (không quy về từng batch) → chỉ hiện khi không lọc 1 batch.
        let buildCost = 0;
        (gd.buildUpGoalData || []).forEach(r => {
            if (sceneFilter && r.theme !== sceneFilter) return;
            buildCost += parseFloat(r.cost) || 0;
        });

        // chỉ giữ currency có pool hiển thị (Exp/SkipTime… bị loại nếu không nằm trong POOLS)
        const addReward = (from, resType, resId, resNumber) => {
            const { currency, amount } = resolveRes(resType, resId, resNumber);
            if (currency && POOLS[currency]) add(from, currency, currency, amount);
        };

        if (!scope.batch) {
            // 2) Order-set reward (per scene) → currency
            (gd.orderDetailReward || []).filter(inScene).forEach(r => addReward('order_reward', r.res_type, r.res_id, r.res_number));
            // 3) Batch reward (per scene) → currency (chủ yếu Item)
            (gd.orderSystemReward || []).filter(inScene).forEach(r => addReward('batch_reward', r.res_type, r.res_id, r.res_number));
            // 4) Build reward (per scene) → currency
            (gd.buildUpGoalReward || []).filter(inScene).forEach(r => addReward('build_reward', r.res_type, r.res_id, r.res_number));
            // 5) Build-node item drops (per scene) → Item
            let buildDrops = 0;
            (gd.buildUpGoalData || []).forEach(r => {
                if (sceneFilter && r.theme !== sceneFilter) return;
                if (r.rw_build_up_type === 'Item') buildDrops += parseFloat(r.rw_build_up_number) || 0;
            });
            add('build_drop', 'Item', 'Item', buildDrops);
            // 6) Video / Daily bonus (global) → currency — chỉ ở scope toàn game
            if (!sceneFilter) {
                (gd.iapVideoBonuses || []).forEach(r => addReward('video', r.res_type, r.res_id, r.res_number));
            }
            add('Gold', 'buildup', 'Gold', buildCost);           // Build-Up tiêu Gold (scene-level)
        }

        // Gộp các link trùng (from,to,currency) → 1 ribbon/1 dòng tooltip gọn
        const agg = {};
        links.forEach(l => {
            const k = `${l.from}|${l.to}|${l.currency}`;
            if (!agg[k]) agg[k] = { from: l.from, to: l.to, currency: l.currency, value: 0 };
            agg[k].value += l.value;
        });
        const merged = Object.values(agg).map(l => ({ ...l, value: Math.round(l.value * 10) / 10 }));
        links.length = 0;
        merged.forEach(l => links.push(l));

        // ── Node throughput + balances ──
        const nodeValues = {};
        const inByCur = {}, outByCur = {};
        links.forEach(l => {
            nodeValues[l.from] = (nodeValues[l.from] || 0) + l.value;
            nodeValues[l.to] = (nodeValues[l.to] || 0) + l.value;
            // pool balance: source→pool = in; pool→sink = out
            if (POOLS[l.to]) inByCur[l.to] = (inByCur[l.to] || 0) + l.value;
            if (POOLS[l.from]) outByCur[l.from] = (outByCur[l.from] || 0) + l.value;
        });
        const balances = Object.keys(POOLS)
            .map(c => ({ currency: c, in: inByCur[c] || 0, out: outByCur[c] || 0 }))
            .filter(b => b.in > 0 || b.out > 0);

        return {
            links, nodeValues, balances,
            meta: { scene: sceneFilter, batch: scope.batch || '', orders: orderIds.size, goldIn, energyDemand, buildCost },
        };
    }

    // Node registry (id → {col, label, icon, kind, desc})
    const SOURCES = {
        order_gold:   { label: 'Order Gold',    icon: '📋', desc: 'Gold thưởng trực tiếp mỗi khi hoàn thành 1 order (cột "gold" trong OrderDetail). Là nguồn gold chính người chơi kiếm được.' },
        order_reward: { label: 'Order Reward',  icon: '🎁', desc: 'Thưởng thêm khi hoàn thành cụm order của scene (OrderDetailReward) — chủ yếu là Gold.' },
        batch_reward: { label: 'Batch Reward',  icon: '📦', desc: 'Thưởng khi clear batch (OrderSystemReward) — hầu hết là vật phẩm (generator, tool, booster).' },
        build_reward: { label: 'Build Reward',  icon: '🏅', desc: 'Thưởng khi hoàn tất Build-Up của scene (BuildUpGoalReward) — Energy, Star và vật phẩm.' },
        build_drop:   { label: 'Build Drops',   icon: '🧰', desc: 'Vật phẩm (generator/tool) nhận được khi xây từng step trong Build-Up.' },
        video:        { label: 'Video / Daily', icon: '📹', desc: 'Thưởng xem quảng cáo / daily (VideoBonuses) — Energy, Diamond, Skip. Chỉ tính ở phạm vi toàn game.' },
    };
    const POOLS = {
        Gold:     { label: 'Gold',    icon: '🪙', color: '#fbbf24', desc: 'Tiền mềm chính. Vào từ order + reward, chảy ra để trả chi phí Build-Up.' },
        Energy:   { label: 'Energy',  icon: '⚡', color: '#38bdf8', desc: 'Cổng session. Vào từ reward; ra để sản xuất ra các item mà order yêu cầu.' },
        Diamond:  { label: 'Diamond', icon: '💎', color: '#c084fc', desc: 'Tiền cứng — mua bằng tiền thật hoặc thưởng ads. Dùng để tua nhanh, mua energy.' },
        Star:     { label: 'Star',    icon: '🌟', color: '#5eead4', desc: 'Điểm sao thưởng khi hoàn tất Build-Up của scene.' },
        Item:     { label: 'Item',    icon: '🧩', color: '#34d399', desc: 'Vật phẩm thưởng (không phải currency): generator, tool, booster… đổ thẳng vào board. Gộp từ Batch Reward, Build Reward và Build Drops.' },
    };
    const SINKS = {
        buildup: { label: 'Build-Up',  icon: '🏗️', desc: 'Gold chi để xây từng step trong Build-Up của scene (BuildUpGoalData.cost). Đây là sink Gold lớn nhất.' },
        fulfill: { label: 'Làm Order',  icon: '🍳', desc: 'Energy tiêu để sản xuất ra các item mà order yêu cầu (energy cost × số lượng, truy ngược qua recipe/generator). Sink Energy lớn nhất — chính là "độ khó" của order.' },
    };

    return { compute, scenes, batchesOf, SOURCES, POOLS, SINKS };

})();
