/**
 * businessModel.js — Tab Business Model.
 *
 * Tái hiện tài liệu BusinessModel_en.pdf ở cấp dashboard:
 *  A) Revenue model + Monetize Loop (Energy · Board · Skip Time) + Revenue axis
 *  B) Ad Placements (11 điểm rewarded video)
 *  C) Shop Packages — lấy TỪ GAME DATA (bảng iap*), gộp theo nhóm + so sánh Flambé
 * Phụ thuộc: window.GameData, TableUtils.
 */
const BusinessModel = (() => {

    const MONEY = { 1: 'Gold', 2: 'Diamond', 3: 'Energy', 4: 'Energy', 5: 'Exp', 6: 'SkipTime', 7: 'Star' };
    const CUR_ICON = { Gold: '🪙', Diamond: '💎', Energy: '⚡', Star: '🌟', SkipTime: '⏩', Exp: '✨', Item: '🧩' };

    // ── A. Monetize loop (demand-chain triangle) ────────────────────────────────
    const LOOP = [
        { id: 'energy', icon: '⚡', title: 'Energy', color: '#38bdf8', desc: 'Nhiên liệu cho mọi hành động. Cạn → game khựng → áp lực nạp.' },
        { id: 'board',  icon: '🧩', title: 'Board & Inventory', color: '#34d399', desc: 'Slot giới hạn → board tắc → ép merge → cần energy.' },
        { id: 'skip',   icon: '⏩', title: 'Skip Time', color: '#fb923c', desc: 'Cooldown dồn lại → skip bằng ads / IAP.' },
    ];

    const REVENUE_AXIS = [
        { axis: 'Rewarded Video (IAA)', status: 'Active — mọi placement', cls: 'ok', role: 'Cho non-payer tiến bộ + đòn bẩy giảm giá gói shop.' },
        { axis: 'IAP (gems, energy, pack, pass)', status: 'Active — trục chính', cls: 'ok', role: 'Doanh thu chính từ payer; sẽ đào sâu theo Flambé.' },
        { axis: 'Interstitial Ads', status: 'Chưa bật — A/B sau', cls: 'warn', role: 'Dự phòng: test theo segment sau khi ổn định nếu CPI cho phép.' },
        { axis: 'Banner / MRec', status: 'Không dùng', cls: 'off', role: '—' },
    ];

    // ── B. Ad placements (rewarded video) ───────────────────────────────────────
    const AD_GROUPS = {
        resource: { label: 'Resource boost', color: '#34d399' },
        skip:     { label: 'Skip wait time', color: '#fb923c' },
        discount: { label: 'Shop discount',  color: '#c084fc' },
    };
    const AD_PLACEMENTS = [
        { n: 1,  feat: 'Daily Reward', sub: 'Nhân đôi thưởng đăng nhập', recv: '×2 daily reward', freq: '1×/ngày', g: 'resource' },
        { n: 2,  feat: 'Energy Refill', sub: 'Buy Currency', recv: 'Energy', freq: 'Nhiều lần/session', g: 'resource' },
        { n: 3,  feat: 'Video Bonuses', sub: 'Popup thưởng video', recv: 'Nguyên liệu / item', freq: 'Nhiều lần/ngày', g: 'resource' },
        { n: 4,  feat: 'Daily Shop Refresh', sub: 'Làm mới daily deal', recv: 'Refresh gói daily', freq: '1×/ngày', g: 'discount' },
        { n: 5,  feat: 'Recharge Generator', sub: 'Skip cooldown gen', recv: 'Skip cooldown, gen ra item kế', freq: 'Nhiều lần trong ván', g: 'skip' },
        { n: 6,  feat: 'Skip Cooking', sub: 'Skip timer nấu', recv: 'Hoàn thành nấu tức thì', freq: 'Nhiều lần trong ván', g: 'skip' },
        { n: 7,  feat: 'Happiness Express', sub: 'Offer gói energy', recv: 'Energy + bonus', freq: 'Time-gated offer', g: 'discount' },
        { n: 8,  feat: 'Open Star Chest', sub: '', recv: 'Chest reward', freq: 'Mỗi lần unlock', g: 'resource' },
        { n: 9,  feat: 'Cooldown Chest', sub: 'Skip cooldown chest', recv: 'Skip chest cooldown', freq: 'Mỗi lần unlock', g: 'skip' },
        { n: 10, feat: 'Cooldown-to-Open Item', sub: 'Mở item sớm', recv: 'Mở item, bỏ chờ', freq: 'Mỗi lần unlock', g: 'skip' },
        { n: 11, feat: 'Shop Discount Packages', sub: 'Gói giảm giá qua ads', recv: 'Mua gói giá giảm / nửa giá', freq: 'Theo loại gói', g: 'discount' },
    ];

    // ── C. Shop package meta (map bảng game data → nhóm PDF) ─────────────────────
    const PKG_GROUPS = [
        ['currency',  'Currency & Resources'],
        ['combo',     'Combo / Special Bundles'],
        ['newplayer', 'New Players'],
        ['pass',      'Pass / Subscription'],
        ['progress',  'Progress / Time-based'],
        ['rotating',  'Rotating Offers'],
        ['other',     'Khác'],
    ];
    const PKG_META = {
        iapGemPack:          { g: 'currency', label: 'Gem Pack', desc: 'Gems (hard currency), nhiều mức giá' },
        iapEnergyPack:       { g: 'currency', label: 'Energy Pack', desc: 'Energy, mua lẻ' },
        iapEnergyTrilogyPack:{ g: 'currency', label: 'Energy Trilogy', desc: 'Bộ 3 gói energy theo tier' },
        iapStandardDiamond:  { g: 'currency', label: 'Standard Diamond', desc: 'Gói kim cương chuẩn' },
        iapFirstPurchase:    { g: 'combo', label: 'First Purchase Pack', desc: 'Mua lần đầu — one-time, giá trị cao' },
        iapLuxuriousOffer:   { g: 'combo', label: 'Luxurious Offer', desc: 'Premium (gems + item độc quyền)' },
        iapSupplyChestPack:  { g: 'combo', label: 'Supply Chest Pack', desc: 'Rương tiếp tế giá trị cao' },
        iapNiceBoostPack:    { g: 'combo', label: 'Nice Boost Pack', desc: 'Booster + tài nguyên' },
        iapStarterPack:      { g: 'newplayer', label: 'Starter Pack', desc: 'Gói khởi đầu — giới hạn sau khi tạo account' },
        iapOpenningPack:     { g: 'newplayer', label: 'Opening Pack', desc: 'Mở khi hoàn thành 1 scene' },
        iapGoldWeeklyPass:   { g: 'pass', label: 'Weekly Pass — Gold', desc: 'Vé tuần tier Gold' },
        iapSilverWeeklyPass: { g: 'pass', label: 'Weekly Pass — Silver', desc: 'Vé tuần tier Silver' },
        iapPiggyBank:        { g: 'progress', label: 'Piggy Bank', desc: 'Tích điểm trong game, mở bằng 1 lần mua' },
        iapInfinityPack:     { g: 'pass', label: 'Infinity Pack', desc: '"Unlimited" — sinh tài nguyên liên tục trong thời gian cố định' },
        iapStepPricePack:    { g: 'progress', label: 'Speed / Step Package', desc: 'Boost + tài nguyên, giá bậc thang' },
        iapDailyDealsPack:   { g: 'rotating', label: 'Daily Deals Pack 1', desc: 'Daily deals, refresh qua ads', ads: true },
        iapDailyDealsPack2:  { g: 'rotating', label: 'Daily Deals Pack 2', desc: 'Daily deals, refresh qua ads', ads: true },
        iapHappinessExpress: { g: 'rotating', label: 'Happiness Express', desc: 'Offer trong game, tốn energy kích hoạt', ads: true },
    };

    const COMPARE = [
        { axis: 'Business model', ts: 'IAP + IAA hybrid', fl: 'Pure IAP, 0 ads', note: 'Tasty giữ doanh thu từ non-payer qua rewarded' },
        { axis: 'Monetization timing', ts: 'Day 1 — IAA + IAP song song', fl: 'd60–d90+ qua events / live-ops', note: 'Tasty tạo doanh thu sớm, ít phụ thuộc retention dài' },
        { axis: 'Package system', ts: 'Merge-cooking → chuyển sang Flambé', fl: 'IAP-centric, gói leo thang', note: 'Roadmap hội tụ về độ sâu IAP của Flambé' },
        { axis: 'Rewarded ad cho energy', ts: 'Có', fl: 'Không', note: 'Tasty thân thiện hơn với non-payer' },
        { axis: 'Ad để skip timer', ts: 'Có — nhiều placement', fl: 'Không', note: 'Flambé dùng wait-timer làm áp lực chi tiêu' },
        { axis: 'Interstitial / banner', ts: 'Chưa bật — A/B sau', fl: 'Không', note: 'Tasty có thể bật theo segment nếu CPI cho phép' },
        { axis: 'Energy', ts: '1/2min · cap 100 · ~3h20m', fl: '1/2min · cap 100 · ~3h20m', note: 'Giống Flambé — đúng chuẩn thể loại' },
    ];

    // ── Helpers ──────────────────────────────────────────────────────────────────

    let _gd = null;

    /** Tổng hợp 1 bảng iap*: {priceMin,priceMax, tiers, sells:Set, ads?} */
    function summarize(key, rows) {
        const prices = [];
        const sells = new Set();
        rows.forEach(r => {
            const c = parseFloat(r.iap_cost);
            if (!isNaN(c) && c > 0) prices.push(c);
            const t = String(r.res_type || '').trim(), rid = String(r.res_id || '').trim();
            if (t === 'Money' && MONEY[rid]) sells.add(MONEY[rid]);
            else if (t === 'Item') sells.add('Item');
        });
        const tiers = new Set(rows.map(r => r.pack_name || r.id)).size;
        return { priceMin: prices.length ? Math.min(...prices) : null, priceMax: prices.length ? Math.max(...prices) : null, tiers, sells };
    }

    function priceLabel(s) {
        if (s.priceMin == null) return '<span class="bm-free">Ads / free</span>';
        const f = v => '$' + v.toFixed(2);
        return s.priceMin === s.priceMax ? f(s.priceMin) : `${f(s.priceMin)} – ${f(s.priceMax)}`;
    }

    // ── Renderers ────────────────────────────────────────────────────────────────

    function renderTriangle() {
        const el = document.getElementById('bm-triangle');
        if (!el) return;
        // vị trí 3 đỉnh (% của khung). Khung có aspect-ratio khớp viewBox 160×90 → không méo.
        const pos = { energy: [50, 21], skip: [15, 80], board: [85, 80] };
        const card = n => {
            const [x, y] = pos[n.id];
            return `<div class="bm-tri-node" style="left:${x}%;top:${y}%;--c:${n.color}">
                <div class="bm-tri-ic">${n.icon}</div>
                <div class="bm-tri-title">${n.title}</div>
                <div class="bm-tri-desc">${n.desc}</div>
            </div>`;
        };
        el.innerHTML = `
            <svg class="bm-tri-svg" viewBox="0 0 160 90" preserveAspectRatio="none">
                <defs><marker id="bm-arrow" markerWidth="3" markerHeight="3" refX="2.1" refY="1.5" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L3,1.5 L0,3 Z" fill="#e07b3e"/></marker></defs>
                <line x1="36" y1="64" x2="69" y2="29" stroke="#c2703a" stroke-width="1.2" vector-effect="non-scaling-stroke" marker-end="url(#bm-arrow)"/>
                <line x1="91" y1="29" x2="124" y2="64" stroke="#c2703a" stroke-width="1.2" vector-effect="non-scaling-stroke" marker-end="url(#bm-arrow)"/>
                <line x1="124" y1="77" x2="36" y2="77" stroke="#c2703a" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" marker-end="url(#bm-arrow)"/>
            </svg>
            <div class="bm-tri-core"><span>MONETIZE LOOP</span><b>Deliberate Imbalance</b></div>
            ${LOOP.map(card).join('')}`;
    }

    function renderRevenueAxis() {
        const el = document.getElementById('bm-revenue-axis');
        if (!el) return;
        el.innerHTML = REVENUE_AXIS.map(r => `<tr>
            <td class="bm-strong">${r.axis}</td>
            <td><span class="bm-badge bm-${r.cls}">${r.status}</span></td>
            <td class="bm-muted">${r.role}</td></tr>`).join('');
    }

    function renderAdPlacements() {
        const el = document.getElementById('bm-ad-body');
        if (!el) return;
        el.innerHTML = AD_PLACEMENTS.map(a => {
            const g = AD_GROUPS[a.g];
            return `<tr>
                <td class="mono bm-muted">${a.n}</td>
                <td><span class="bm-strong">${a.feat}</span>${a.sub ? `<div class="bm-sub">${a.sub}</div>` : ''}</td>
                <td>${a.recv}</td>
                <td class="bm-muted">${a.freq}</td>
                <td><span class="bm-tag" style="color:${g.color};border-color:${g.color}55">${g.label}</span></td>
            </tr>`;
        }).join('');
    }

    function renderPackages() {
        const el = document.getElementById('bm-packages');
        if (!el) return;
        const rows = [];
        Object.keys(PKG_META).forEach(key => {
            const meta = PKG_META[key];
            const data = _gd[key];
            if (!Array.isArray(data) || !data.length) return;
            rows.push({ key, meta, s: summarize(key, data) });
        });
        const html = PKG_GROUPS.map(([gid, glabel]) => {
            const items = rows.filter(r => r.meta.g === gid);
            if (!items.length) return '';
            const body = items.map(({ meta, s }) => {
                const chips = [...s.sells].map(c => `<span class="bm-cur">${CUR_ICON[c] || ''} ${c}</span>`).join('');
                const ads = meta.ads ? `<span class="bm-ads">★ ads</span>` : '';
                return `<tr>
                    <td><span class="bm-strong">${meta.label}</span> ${ads}<div class="bm-sub">${meta.desc}</div></td>
                    <td class="mono">${priceLabel(s)}</td>
                    <td class="mono bm-muted">${s.tiers}</td>
                    <td>${chips || '<span class="bm-muted">—</span>'}</td>
                </tr>`;
            }).join('');
            return `<div class="bm-pkg-group">
                <div class="bm-pkg-glabel">${glabel} <span class="bm-pkg-n">${items.length}</span></div>
                <div class="table-container"><table class="data-table bm-table bm-pkg-table">
                    <colgroup><col style="width:42%"><col style="width:22%"><col style="width:10%"><col style="width:26%"></colgroup>
                    <thead><tr><th>Package</th><th>Giá (USD)</th><th>Tiers</th><th>Bán gì</th></tr></thead>
                    <tbody>${body}</tbody></table></div>
            </div>`;
        }).join('');
        el.innerHTML = html;
    }

    function renderCompare() {
        const el = document.getElementById('bm-compare-body');
        if (!el) return;
        el.innerHTML = COMPARE.map(c => `<tr>
            <td class="bm-strong">${c.axis}</td>
            <td><span class="bm-badge bm-ok">${c.ts}</span></td>
            <td><span class="bm-badge bm-off">${c.fl}</span></td>
            <td class="bm-muted">${c.note}</td></tr>`).join('');
    }

    function init() {
        if (!window.GameData) return;
        _gd = window.GameData;
        renderTriangle();
        renderRevenueAxis();
        renderAdPlacements();
        renderPackages();
        renderCompare();
    }

    return { init };

})();
