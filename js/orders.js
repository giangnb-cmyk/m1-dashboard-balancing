/**
 * orders.js — Tab: Orders
 *
 * Hiển thị toàn bộ order data: Order Details, Order Batches, Top Demand.
 * Lưu kết quả xử lý vào window.ProcessedData.orders để các module khác dùng.
 *
 * Phụ thuộc: TableUtils, window.GameData, window.ProcessedData
 */
const OrdersTab = (() => {

    const { $, setText, badge, fillSelect, bindFilters,
            sortByKey, bindSort, renderRows, initSubTabs } = TableUtils;

    // Resource type display map
    const RES_LABEL = {
        'Money': '💰 Gold', 'Item': '📦 Item',
        'Energy': '⚡ Energy', 'Gem': '💎 Gem',
    };

    function resLabel(type, id, num) {
        if (!type || !num) return '';
        const label = RES_LABEL[type] || type;
        return `<span style="white-space:nowrap">${label} <span class="mono" style="color:var(--gold)">×${num}</span></span>`;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // BUILD ITEM LABEL MAP
    // ═════════════════════════════════════════════════════════════════════════

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 1: ORDER DETAILS
    // ═════════════════════════════════════════════════════════════════════════

    function itemCell(id, name, amount) {
        if (!id) return '—';
        return `<div>`
            + `<span class="mono" style="color:var(--energy);font-size:0.78rem">${id}</span>`
            + `<br><span style="font-size:0.8rem">${name || ''}</span>`
            + (parseInt(amount) > 1 ? ` <span style="color:var(--gold)">×${amount}</span>` : '')
            + `</div>`;
    }

    function buildOrderDetailRows(orderDetail) {
        return orderDetail.map(row => {
            const npc = row.idNPC || '';
            const npcBadge = npc
                ? badge(`NPC ${npc}`, 'rgba(99,102,241,0.12)', '#6366f188', '#818cf8')
                : '';
            const gold = parseInt(row.gold) || 0;
            const goldCell = gold
                ? `<span class="mono" style="color:var(--gold)">${gold} 💰</span>`
                : '—';

            return {
                orderId:   parseInt(row.orderId) || 0,
                npc:       parseInt(npc) || 0,
                item1Name: row.item1_name || row.item1_id || '',
                has2Items: !!(row.item2_id),
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted)">${row.orderId}</td>
                    <td>${npcBadge}</td>
                    <td style="font-size:0.85rem">${itemCell(row.item1_id, row.item1_name, row.item1_amount)}</td>
                    <td style="font-size:0.85rem">${itemCell(row.item2_id, row.item2_name, row.item2_amount)}</td>
                    <td style="font-size:0.82rem">${goldCell}</td>
                </tr>`,
            };
        });
    }

    function initOrderDetails(orderDetail) {
        const allRows = buildOrderDetailRows(orderDetail);
        setText('order-total-count', allRows.length.toLocaleString());

        const npcValues = [...new Set(orderDetail.map(r => r.idNPC).filter(Boolean))]
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(v => `NPC ${v}`);
        fillSelect('order-filter-npc', npcValues);

        let sortKey = 'orderId', sortAsc = true;

        function render() {
            const search = ($('order-search')?.value || '').toLowerCase().trim();
            const npcF   = $('order-filter-npc')?.value || '';
            const twoF   = $('order-filter-2item')?.value || '';

            const filtered = allRows.filter(r => {
                if (npcF && `NPC ${r.npc}` !== npcF)   return false;
                if (twoF === 'yes' && !r.has2Items)      return false;
                if (twoF === 'no'  &&  r.has2Items)      return false;
                if (search && !r.item1Name.toLowerCase().includes(search)
                           && !String(r.orderId).includes(search)) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));

            setText('order-result-count', filtered.length.toLocaleString() + ' orders');
            renderRows('order-detail-body', filtered, 5);
        }

        bindSort('order-detail-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['order-search', 'order-filter-npc', 'order-filter-2item'], render);
        render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 2: ORDER BATCHES (OrderSystem)
    // ═════════════════════════════════════════════════════════════════════════

    function buildBatchRows(orderSystem) {
        return orderSystem.map(row => {
            const theme = row.themeType || row.id;
            const themeBadge = badge(theme, 'rgba(56,189,248,0.1)', '#38bdf844', '#38bdf8');

            const canRew = row.canReceiveReward === '1'
                ? badge('✓ Yes', 'rgba(34,197,94,0.12)', '#22c55e44', '#4ade80')
                : badge('✗ No',  'rgba(239,68,68,0.12)', '#ef444444', '#f87171');

            // Count orders in batch
            let orderCount = 0;
            for (let i = 1; i <= 7; i++) {
                if (row[`order${i}_idOrder`] !== '' && row[`order${i}_idOrder`] !== undefined) orderCount++;
            }

            const rewards = [1,2,3,4,5,6,7].map(i => {
                const rt = row[`reward${i}_resType`], rn = row[`reward${i}_resNumber`];
                if (!rt || !rn || parseInt(rn) === 0) return '';
                return resLabel(rt, row[`reward${i}_resId`], rn);
            }).filter(Boolean).join(' · ');

            return {
                batchId: parseInt(row.id) || 0,
                theme: theme,
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted)">${row.id}</td>
                    <td>${themeBadge}</td>
                    <td>${canRew}</td>
                    <td class="mono" style="color:var(--accent)">${orderCount}</td>
                    <td style="font-size:0.82rem">${rewards || '—'}</td>
                </tr>`,
            };
        });
    }

    function initOrderBatches(orderSystem) {
        const allRows = buildBatchRows(orderSystem);
        setText('batch-total-count', allRows.length.toLocaleString());

        const themes = [...new Set(orderSystem.map(r => r.themeType).filter(Boolean))].sort();
        fillSelect('batch-filter-theme', themes);

        let sortKey = 'batchId', sortAsc = true;

        function render() {
            const themeF = $('batch-filter-theme')?.value || '';
            const filtered = allRows.filter(r => {
                if (themeF && r.theme !== themeF) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            setText('batch-result-count', filtered.length.toLocaleString() + ' batches');
            renderRows('batch-body', filtered, 5);
        }

        bindSort('batch-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['batch-filter-theme'], render);
        render();
    }


    // ═════════════════════════════════════════════════════════════════════════
    // STATS
    // ═════════════════════════════════════════════════════════════════════════

    function updateStats(orderDetail, orderSystem) {
        const twoItem = orderDetail.filter(r => r.item2_id && r.item2_id !== '').length;
        setText('stat-order-total',   orderDetail.length.toLocaleString());
        setText('stat-order-2item',   twoItem.toLocaleString());
        setText('stat-order-batches', orderSystem.length.toLocaleString());
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PUBLIC
    // ═════════════════════════════════════════════════════════════════════════

    function init() {
        if (!window.GameData) return;
        const gd = window.GameData;
        const orderDetail = gd.orderDetail  || [];
        const orderSystem = gd.orderSystem  || [];

        initSubTabs(document.getElementById('panel-orders'));

        updateStats(orderDetail, orderSystem);
        initOrderDetails(orderDetail);
        initOrderBatches(orderSystem);

        // Store processed rows in shared store
        window.ProcessedData.orders = {
            ...(window.ProcessedData.orders || {}),
            orderDetail,
            orderSystem,
        };
    }

    return { init };

})();
