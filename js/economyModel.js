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

    // Gói bán KHÔNG có thật trong game (không nằm trong docs/BusinessModel_en.pdf) — rác từ CSV project khác.
    // Loại khỏi số liệu IAP kể cả khi data-iap.js chưa được regenerate. Nguồn gốc chuẩn: generate_data.py load_iap().
    const IAP_IGNORE = new Set(['iapCoinPack', 'iapBattlePassPack', 'iapLuckySpinPack', 'iapRemoveAdsPack', 'iapBundlePack', 'iapChainPack']);

    // Tên gói bán (hiển thị) cho bảng liệt kê chi tiết — khớp nhãn ở iapPackages.js.
    const IAP_LABEL = {
        iapGemPack: 'Gem Pack', iapEnergyPack: 'Energy Pack', iapEnergyTrilogyPack: 'Energy Trilogy',
        iapStarterPack: 'Starter Pack', iapOpenningPack: 'Opening Pack', iapFirstPurchase: 'First Purchase',
        iapStepPricePack: 'Step Price Pack', iapDailyDealsPack: 'Daily Deals', iapDailyDealsPack2: 'Daily Deals 2',
        iapNiceBoostPack: 'Nice Boost Pack', iapHappinessExpress: 'Happiness Express', iapLuxuriousOffer: 'Luxurious Offer',
        iapStandardDiamond: 'Standard Diamond', iapGoldWeeklyPass: 'Gold Weekly Pass', iapSilverWeeklyPass: 'Silver Weekly Pass',
        iapSupplyChestPack: 'Supply Chest Pack', iapPiggyBank: 'Piggy Bank',
    };

    /** {res_type,res_id,res_number} → {currency, amount, itemId}. currency=null nếu không hiểu. */
    function resolveRes(resType, resId, resNumber) {
        const amount = parseFloat(resNumber) || 0;
        const t = String(resType || '').trim();
        if (t === 'Item' || t === '2') return { currency: 'Item', amount, itemId: String(resId || '') };
        // res_id lạ (không có trong enum MoneyTypes, vd 11/13) KHÔNG được mặc định thành Gold —
        // đó là currency chưa mô hình hoá; trả null để bỏ qua thay vì đội lốt Gold (xưa dùng `|| 'Gold'` gây phồng gold).
        if (t === 'Money' || t === '1') return { currency: MONEY[parseInt(resId)] || null, amount };
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

        // 2) Item thưởng kèm khi xong order (rw_item trong OrderDetail) → Item — scope theo order
        let orderItems = 0;
        orderIds.forEach(oid => {
            const o = orderMap[oid];
            if (o && o.rw_item_id) orderItems += parseInt(o.rw_item_number) || 0;
        });
        add('order_item', 'Item', 'Item', orderItems);

        if (!scope.batch) {
            // 3) Batch reward (per scene) → currency (chủ yếu Item)
            (gd.orderSystemReward || []).filter(inScene).forEach(r => addReward('batch_reward', r.res_type, r.res_id, r.res_number));
            // 4) Build reward (per scene) → currency
            (gd.buildUpGoalReward || []).filter(inScene).forEach(r => addReward('build_reward', r.res_type, r.res_id, r.res_number));
            // 4b) Build bonus (BuildUpGoalRewardBonus — thưởng thêm mỗi step) → currency; cột scene là "type"
            (gd.buildUpGoalRewardBonus || []).forEach(r => {
                if (sceneFilter && r.type !== sceneFilter) return;
                addReward('build_bonus', r.res_type, r.res_id, r.res_number);
            });
            // 5) Build-node item drops (per scene) → Item
            let buildDrops = 0;
            (gd.buildUpGoalData || []).forEach(r => {
                if (sceneFilter && r.theme !== sceneFilter) return;
                if (r.rw_build_up_type === 'Item') buildDrops += parseFloat(r.rw_build_up_number) || 0;
            });
            add('build_drop', 'Item', 'Item', buildDrops);

            // Nguồn toàn game (không quy theo scene): chỉ hiện ở phạm vi toàn game
            if (!sceneFilter) {
                // 6) Video Bonus → currency (VideoBonuses.csv — reward xem quảng cáo)
                (gd.iapVideoBonuses || []).forEach(r => addReward('video', r.res_type, r.res_id, r.res_number));
                // 6b) Daily Reward → currency (DailyReward.csv — chu kỳ login 7 ngày)
                (gd.dailyReward || []).forEach(r => addReward('daily_reward', r.res_type, r.res_id, r.res_number));

                // 7) Energy tự hồi: restore_value mỗi restore_time giây → quy ra /ngày
                const gc = (gd.generalConfig || [])[0];
                if (gc) {
                    const rv = parseFloat(gc.restore_energy_value) || 0;
                    const rt = parseFloat(gc.restore_energy_time) || 0;
                    if (rv > 0 && rt > 0) add('energy_regen', 'Energy', 'Energy', rv * 86400 / rt);
                }

                // 7b) Order milestone (OrderGold.csv): mỗi N order xong → box/item
                (gd.orderGold || []).forEach(r => addReward('order_milestone', r.res_type, r.res_id, r.res_number));

                // 7c) Buy Currency (BuyCurrency.csv): mua energy bằng ads (rate/ngày) & bằng diamond (1 lượt thang giá)
                const bc = gd.buyCurrency || [];
                const adsMax = parseFloat((bc.find(r => r.max_ads_per_day) || {}).max_ads_per_day) || 0;
                const adsPer = parseFloat((bc.find(r => r.type_buy === 'Ads') || {}).amount) || 0;
                if (adsMax && adsPer) add('ads_energy', 'Energy', 'Energy', adsMax * adsPer);
                let gemCost = 0, gemEnergy = 0;
                bc.filter(r => r.type_buy === 'Diamonds').forEach(r => {
                    gemCost += parseFloat(r.cost) || 0;
                    gemEnergy += parseFloat(r.amount) || 0;
                });
                add('buy_energy', 'Energy', 'Energy', gemEnergy);      // energy nhận được
                add('Diamond', 'gem_buy_energy', 'Diamond', gemCost);  // diamond tiêu

                // 8) IAP packs (gói bán) → currency — tổng nếu mua mỗi gói 1 lần
                Object.keys(gd).forEach(key => {
                    if (!key.startsWith('iap') || !Array.isArray(gd[key])) return;
                    if (IAP_IGNORE.has(key)) return; // gói không có thật — xem IAP_IGNORE
                    gd[key].forEach(r => addReward('iap', r.res_type, r.res_id, r.res_number));
                });

                // 9) Starting gift / default (tutorial): generator/tool đặt sẵn trên board + gold khởi đầu
                const board = gd.boardDefault || [];
                if (board.length) add('start_gift', 'Item', 'Item', board.length);
                const gc0 = (gd.generalConfig || [])[0];
                if (gc0) addReward('start_gift', gc0.res_type, gc0.res_id, gc0.res_number);
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
        order_gold:   { label: 'Order Gold',    icon: '📋', desc: 'Gold trả NGAY mỗi khi hoàn thành 1 order lẻ (faucet gold chính). Nguồn: Core/Order/OrderDetail.csv — cột res_number của dòng đầu mỗi order (res_type=Money, res_id=1=Gold). Số hiển thị = cộng dồn gold của mọi order trong phạm vi đang xem.' },
        order_item:   { label: 'Order Item Reward', icon: '🎀', desc: 'Vật phẩm tặng kèm khi hoàn thành order (custom_value trong OrderDetail.csv).' },
        order_milestone: { label: 'Order Milestone', icon: '🏆', desc: 'Thưởng mốc số order đã hoàn thành (OrderGold.csv) — mỗi N order xong nhận 1 box/item.' },
        batch_reward: { label: 'Batch Reward',  icon: '📦', desc: 'Thưởng khi clear batch (OrderSystemReward) — hầu hết là vật phẩm (generator, tool, booster).' },
        build_reward: { label: 'Build Reward',  icon: '🏅', desc: 'Thưởng khi hoàn tất Build-Up của scene (BuildUpGoalReward) — Energy, Star và vật phẩm.' },
        build_bonus:  { label: 'Build Bonus',   icon: '🎖️', desc: 'Thưởng THÊM theo từng step Build-Up (BuildUpGoalRewardBonus.csv) — chủ yếu Star và Energy.' },
        build_drop:   { label: 'Build Drops',   icon: '🧰', desc: 'Vật phẩm (generator/tool) nhận được khi xây từng step trong Build-Up.' },
        video:        { label: 'Video Bonus',  icon: '📹', desc: 'Thưởng xem quảng cáo (VideoBonuses.csv) — Energy, Diamond, Skip Time. Chỉ tính ở phạm vi toàn game.' },
        daily_reward: { label: 'Daily Reward', icon: '📅', desc: 'Thưởng đăng nhập hằng ngày (DailyReward.csv) — tổng của 1 chu kỳ 7 ngày: Diamond, Energy, Skip Time, Gold và item. Chỉ tính ở phạm vi toàn game.' },
        start_gift:   { label: 'Starting Gift',  icon: '🌱', desc: 'Tài nguyên tặng lúc bắt đầu (tutorial / default): generator & tool đặt sẵn trên board (BoardDefault) + gold khởi đầu.' },
        energy_regen: { label: 'Energy Regen',  icon: '🔋', desc: 'Energy tự hồi miễn phí: 1 mỗi 2 phút → ~720/ngày (max 100). Đây là RATE theo ngày, khác với các con số tổng — cho thấy energy free chỉ nhỏ giọt so với nhu cầu.' },
        ads_energy:   { label: 'Energy Refill (Ads)', icon: '📺', desc: 'Mua energy bằng xem ads (BuyCurrency.csv): 25 energy/lần, tối đa 5 lần/ngày → 125/ngày. Đây là RATE theo ngày.' },
        buy_energy:   { label: 'Buy Energy (Diamond)', icon: '🔁', desc: 'Energy nhận được khi mua bằng Diamond (BuyCurrency.csv) — tính 1 lượt hết thang giá 10→160 Diamond, mỗi bậc +100 energy. Diamond tiêu tương ứng nằm ở sink cùng tên.' },
        iap:          { label: 'IAP Packs',     icon: '💳', desc: 'Currency bán qua các gói IAP (tổng nếu mua mỗi gói 1 lần). Bơm bằng tiền thật.' },
    };
    const POOLS = {
        Gold:     { label: 'Gold',    icon: '🪙', color: '#fbbf24', desc: 'Tiền mềm chính. Vào từ order + reward, chảy ra để trả chi phí Build-Up.' },
        Energy:   { label: 'Energy',  icon: '⚡', color: '#38bdf8', desc: 'Cổng session. Vào từ reward; ra để sản xuất ra các item mà order yêu cầu.' },
        Diamond:  { label: 'Diamond', icon: '💎', color: '#c084fc', desc: 'Tiền cứng — mua bằng tiền thật hoặc thưởng ads. Dùng để tua nhanh, mua energy.' },
        Star:     { label: 'Star',    icon: '🌟', color: '#5eead4', desc: 'Điểm sao thưởng khi hoàn tất Build-Up của scene.' },
        Item:     { label: 'Item',    icon: '🧩', color: '#34d399', desc: 'Vật phẩm thưởng (không phải currency): generator, tool, booster… đổ thẳng vào board. Gộp từ Batch Reward, Build Reward và Build Drops.' },
        SkipTime: { label: 'Skip Time', icon: '⏩', color: '#fb923c', desc: 'Token tua nhanh thời gian nấu/cooldown. Nhận từ Video/Daily và các gói IAP.' },
    };
    const SINKS = {
        buildup: { label: 'Build-Up',  icon: '🏗️', desc: 'Gold chi để xây từng step trong Build-Up của scene (BuildUpGoalData.cost). Đây là sink Gold lớn nhất.' },
        fulfill: { label: 'Làm Order',  icon: '🍳', desc: 'Energy tiêu để sản xuất ra các item mà order yêu cầu (energy cost × số lượng, truy ngược qua recipe/generator). Sink Energy lớn nhất — chính là "độ khó" của order.' },
        gem_buy_energy: { label: 'Buy Energy (Diamond)', icon: '🔁', desc: 'Diamond tiêu khi mua energy (BuyCurrency.csv) — 1 lượt hết thang giá 10+20+40+80+160 = 310 Diamond đổi 500 energy.' },
    };

    /**
     * Chi tiết line-item cho tab "Nguồn & Sink" (nhóm theo currency, tên chính xác).
     * Mỗi dòng = {currency, role:'source'|'sink', label, icon, value}.
     * IAP tách theo TỪNG gói bán (không gộp 'IAP Packs'); VideoBonuses tính 1 lần ở feature 'Video / Daily'
     * (bỏ khỏi danh sách gói để tránh đếm trùng); PackDuration là config nên bỏ.
     * @param {object} model  kết quả compute() (dùng lại, không tính lại)
     */
    function breakdown(model, gd, scope) {
        const items = [];
        model.links.forEach(l => {
            if (SOURCES[l.from] && l.from !== 'iap')
                items.push({ currency: l.currency, role: 'source', label: SOURCES[l.from].label, icon: SOURCES[l.from].icon, value: l.value });
            if (SINKS[l.to])
                items.push({ currency: l.currency, role: 'sink', label: SINKS[l.to].label, icon: SINKS[l.to].icon, value: l.value });
        });
        // IAP theo từng gói — chỉ ở phạm vi toàn game (khớp điều kiện của compute).
        if (!scope.scene && !scope.batch) {
            Object.keys(gd).forEach(key => {
                if (!key.startsWith('iap') || !Array.isArray(gd[key])) return;
                if (IAP_IGNORE.has(key) || key === 'iapVideoBonuses' || key === 'iapPackDuration') return;
                const sums = {};
                gd[key].forEach(r => {
                    const { currency, amount } = resolveRes(r.res_type, r.res_id, r.res_number);
                    if (currency && POOLS[currency]) sums[currency] = (sums[currency] || 0) + amount;
                });
                Object.keys(sums).forEach(cur =>
                    items.push({ currency: cur, role: 'source', label: IAP_LABEL[key] || key, icon: '💳', value: sums[cur] }));
            });
        }
        return items;
    }

    return { compute, breakdown, scenes, batchesOf, SOURCES, POOLS, SINKS };

})();
