/**
 * iapPackages.js — Tab: IAP Packages
 *
 * Tổng hợp tất cả gói bán (IAP) trong game.
 * Lưu kết quả vào window.ProcessedData.iap để modules khác dùng.
 *
 * Phụ thuộc: TableUtils, window.GameData, window.ProcessedData
 */
const IAPPackages = (() => {

    const { $, setText, badge, fillSelect, bindFilters,
            sortByKey, bindSort, renderRows, initSubTabs } = TableUtils;

    // ── Danh mục các IAP key trong GameData và nhãn hiển thị ────────────────
    const IAP_CATALOG = [
        { key: 'iapGemPack',           label: 'Gem Pack',           icon: '💎' },
        { key: 'iapEnergyPack',        label: 'Energy Pack',        icon: '⚡' },
        { key: 'iapEnergyTrilogyPack', label: 'Energy Trilogy',     icon: '⚡' },
        { key: 'iapStarterPack',       label: 'Starter Pack',       icon: '🎁' },
        { key: 'iapOpenningPack',      label: 'Opening Pack',       icon: '🎁' },
        { key: 'iapFirstPurchase',     label: 'First Purchase',     icon: '🎁' },
        { key: 'iapStepPricePack',     label: 'Step Price Pack',    icon: '📈' },
        { key: 'iapDailyDealsPack',    label: 'Daily Deals',        icon: '📅' },
        { key: 'iapDailyDealsPack2',   label: 'Daily Deals 2',      icon: '📅' },
        { key: 'iapNiceBoostPack',     label: 'Nice Boost Pack',    icon: '🚀' },
        { key: 'iapHappinessExpress',  label: 'Happiness Express',  icon: '😊' },
        { key: 'iapLuxuriousOffer',    label: 'Luxurious Offer',    icon: '👑' },
        { key: 'iapStandardDiamond',   label: 'Standard Diamond',   icon: '💠' },
        { key: 'iapGoldWeeklyPass',    label: 'Gold Weekly Pass',   icon: '🥇' },
        { key: 'iapSilverWeeklyPass',  label: 'Silver Weekly Pass', icon: '🥈' },
        { key: 'iapSupplyChestPack',   label: 'Supply Chest Pack',  icon: '🎁' },
        { key: 'iapPiggyBank',         label: 'Piggy Bank',         icon: '🐷' },
        { key: 'iapVideoBonuses',      label: 'Video Bonuses',      icon: '🎬' },
        { key: 'iapPackDuration',      label: 'Pack Duration',      icon: '⏱️' },
    ];

    // Resource type display map
    const RES_LABEL = {
        'Money': { icon: '💰', label: 'Gold' },
        'Energy': { icon: '⚡', label: 'Energy' },
        'Item': { icon: '📦', label: 'Item' },
        'Gem': { icon: '💎', label: 'Gem' },
    };

    function fmtRes(type, id, num) {
        if (!type || !num || num === '0') return '';
        const info = RES_LABEL[type] || { icon: '📌', label: type };
        return `${info.icon} ${info.label}${id && id !== '0' ? `(${id})` : ''} ×${num}`;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // BUILD ALL PACKS (grouped by unique id per category)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Group rows of a CSV (fill-down applied) into packs.
     * Each pack = unique id → { meta from first row, items: [{ type, id, num }] }
     */
    function groupPackRows(rows) {
        const packs = [];
        const seen  = new Set();
        rows.forEach(row => {
            const packId = row.id;
            if (!packId) return;
            if (!seen.has(packId)) {
                seen.add(packId);
                packs.push({
                    id:            packId,
                    pack_name:     row.pack_name     || '',
                    iap_cost:      parseFloat(row.iap_cost) || 0,
                    purchase_type: row.purchase_type || 'IAP',
                    purchase_count:parseInt(row.purchase_count) || 1,
                    sale:          parseInt(row.sale) || 0,
                    google_id:     row.google_product_id || '',
                    items:         [],
                });
            }
            const pack = packs[packs.length - 1];
            if (row.res_type && row.res_number && row.res_number !== '0') {
                pack.items.push({
                    type: row.res_type,
                    id:   row.res_id   || '',
                    num:  row.res_number,
                });
            }
        });
        return packs;
    }

    /**
     * Merge all IAP catalog entries into one unified list.
     * @returns {Array} flat list of { category, categoryIcon, ...packFields }
     */
    function buildAllPacks(gd) {
        const allPacks = [];
        IAP_CATALOG.forEach(({ key, label, icon }) => {
            const rows = gd[key];
            if (!rows || rows.length === 0) return;
            const packs = groupPackRows(rows);
            packs.forEach(p => allPacks.push({ category: label, categoryIcon: icon, ...p }));
        });
        return allPacks;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 1: PACK OVERVIEW
    // ═════════════════════════════════════════════════════════════════════════

    function buildOverviewRows(allPacks) {
        return allPacks.map(p => {
            const catBadge = badge(
                `${p.categoryIcon} ${p.category}`,
                'rgba(99,102,241,0.1)', '#6366f144', '#818cf8'
            );

            const priceStr = p.iap_cost > 0
                ? `<span class="mono" style="color:var(--gold)">$${p.iap_cost.toFixed(2)}</span>`
                : (p.purchase_type !== 'IAP'
                    ? badge(p.purchase_type, 'rgba(34,197,94,0.1)', '#22c55e44', '#4ade80')
                    : '—');

            const saleBadge = p.sale > 0
                ? badge(`-${p.sale}%`, 'rgba(239,68,68,0.15)', '#ef444488', '#f87171')
                : '';

            const itemsSummary = p.items.slice(0, 3).map(it => fmtRes(it.type, it.id, it.num)).filter(Boolean);
            const moreItems = p.items.length > 3 ? `<span style="color:var(--text-muted)"> +${p.items.length - 3} more</span>` : '';

            return {
                id: parseInt(p.id) || 0,
                category: p.category,
                packName: p.pack_name,
                iap_cost: p.iap_cost,
                itemCount: p.items.length,
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted)">${p.id}</td>
                    <td>${catBadge}</td>
                    <td style="font-size:0.82rem">${p.pack_name}</td>
                    <td>${priceStr} ${saleBadge}</td>
                    <td class="mono" style="color:var(--text-muted)">${p.purchase_count > 1 ? `×${p.purchase_count}` : '1'}</td>
                    <td style="font-size:0.8rem;color:var(--text-muted)">${itemsSummary.join(' · ')}${moreItems}</td>
                </tr>`,
            };
        });
    }

    function initOverview(allPacks) {
        const allRows = buildOverviewRows(allPacks);

        setText('iap-total-packs',    allPacks.length.toLocaleString());
        const priced = allPacks.filter(p => p.iap_cost > 0);
        setText('iap-total-priced',   priced.length.toLocaleString());
        const prices  = priced.map(p => p.iap_cost);
        const minP    = prices.length ? Math.min(...prices) : 0;
        const maxP    = prices.length ? Math.max(...prices) : 0;
        setText('iap-price-range',    prices.length ? `$${minP.toFixed(2)} – $${maxP.toFixed(2)}` : '—');

        const categories = [...new Set(allPacks.map(p => p.category))].sort();
        fillSelect('iap-filter-category', categories);

        let sortKey = 'id', sortAsc = true;

        function render() {
            const search  = ($('iap-search')?.value || '').toLowerCase().trim();
            const catF    = $('iap-filter-category')?.value || '';

            const filtered = allRows.filter(r => {
                if (catF   && r.category !== catF) return false;
                if (search && !r.packName.toLowerCase().includes(search)) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));

            setText('iap-result-count', filtered.length.toLocaleString() + ' packs');
            renderRows('iap-overview-body', filtered, 6);
        }

        bindSort('iap-overview-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['iap-search', 'iap-filter-category'], render);
        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 2: PACK CONTENTS
    // ═════════════════════════════════════════════════════════════════════════

    function buildContentRows(allPacks) {
        const rows = [];
        allPacks.forEach(p => {
            const catBadge = badge(
                `${p.categoryIcon} ${p.category}`,
                'rgba(99,102,241,0.1)', '#6366f144', '#818cf8'
            );
            const priceStr = p.iap_cost > 0 ? `$${p.iap_cost.toFixed(2)}` : p.purchase_type || '—';

            const itemsHtml = p.items.length
                ? p.items.map(it => {
                    const res = RES_LABEL[it.type] || { icon: '📌', label: it.type };
                    return `<div style="white-space:nowrap;font-size:0.8rem;">`
                         + `${res.icon} <span style="color:var(--text-muted)">${it.type}</span>`
                         + (it.id ? ` <span class="mono" style="color:var(--energy);font-size:0.75rem">${it.id}</span>` : '')
                         + ` <span style="color:var(--gold)">×${it.num}</span></div>`;
                }).join('')
                : '<span style="color:var(--text-muted)">—</span>';

            rows.push({
                id: parseInt(p.id) || 0,
                category: p.category,
                packName: p.pack_name,
                iap_cost: p.iap_cost,
                itemCount: p.items.length,
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted)">${p.id}</td>
                    <td>${catBadge}</td>
                    <td style="font-size:0.82rem">${p.pack_name}</td>
                    <td class="mono" style="color:var(--gold)">${priceStr}</td>
                    <td class="mono">${p.items.length}</td>
                    <td>${itemsHtml}</td>
                </tr>`,
            });
        });
        return rows;
    }

    function initContents(allPacks) {
        const allRows = buildContentRows(allPacks);
        const categories = [...new Set(allPacks.map(p => p.category))].sort();
        fillSelect('iap-content-filter-cat', categories);

        let sortKey = 'id', sortAsc = true;

        function render() {
            const catF   = $('iap-content-filter-cat')?.value || '';
            const search = ($('iap-content-search')?.value || '').toLowerCase().trim();

            const filtered = allRows.filter(r => {
                if (catF   && r.category !== catF) return false;
                if (search && !r.packName.toLowerCase().includes(search)) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));

            setText('iap-content-result-count', filtered.length.toLocaleString() + ' packs');
            renderRows('iap-content-body', filtered, 6);
        }

        bindSort('iap-content-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['iap-content-filter-cat', 'iap-content-search'], render);
        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC
    // ═════════════════════════════════════════════════════════════════════════

    function init() {
        if (!window.GameData) return;
        const gd = window.GameData;

        const allPacks = buildAllPacks(gd);

        // Scope sub-tabs to IAP panel
        initSubTabs(document.getElementById('panel-iap'));

        initOverview(allPacks);
        initContents(allPacks);

        // Store processed packs for other modules
        window.ProcessedData.iap = {
            allPacks,
            packByCategory: allPacks.reduce((acc, p) => {
                if (!acc[p.category]) acc[p.category] = [];
                acc[p.category].push(p);
                return acc;
            }, {}),
        };
    }

    return { init };

})();
