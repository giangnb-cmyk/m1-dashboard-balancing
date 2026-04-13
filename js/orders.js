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

    function buildItemLabelMap(gd) {
        const map = {};
        [...(gd.itemRaw || []), ...(gd.itemFood || []),
         ...(gd.itemTool || []), ...(gd.itemGenerator || []),
         ...(gd.itemBooster || []), ...(gd.itemCurrency || [])].forEach(r => {
            if (r.id && r.name_item) map[r.id] = r.name_item;
        });
        return map;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUB-TAB 1: ORDER DETAILS
    // ═════════════════════════════════════════════════════════════════════════

    function buildOrderDetailRows(orderDetail, nameMap) {
        return orderDetail.map(row => {
            const item1 = row.item1_type
                ? `<div><span style="color:var(--accent);font-size:0.78rem">${row.item1_type}</span> `
                + `<span class="mono" style="color:var(--energy);font-size:0.78rem">${row.item1_id}</span>`
                + `<br><span style="font-size:0.8rem">${nameMap[row.item1_id] || row.item1_name || ''}</span>`
                + (row.item1_amount > 1 ? ` <span style="color:var(--gold)">×${row.item1_amount}</span>` : '')
                + `</div>` : '—';

            const item2 = row.item2_type
                ? `<div><span style="color:var(--accent);font-size:0.78rem">${row.item2_type}</span> `
                + `<span class="mono" style="color:var(--energy);font-size:0.78rem">${row.item2_id}</span>`
                + `<br><span style="font-size:0.8rem">${nameMap[row.item2_id] || row.item2_name || ''}</span>`
                + (row.item2_amount > 1 ? ` <span style="color:var(--gold)">×${row.item2_amount}</span>` : '')
                + `</div>` : '—';

            const rewards = [1,2,3].map(i => {
                const rt = row[`reward${i}_resType`], rid = row[`reward${i}_resId`], rn = row[`reward${i}_resNumber`];
                return resLabel(rt, rid, rn);
            }).filter(Boolean).join('<br>');

            const npc = row.idNPC || '';
            const npcBadge = npc
                ? badge(`NPC ${npc}`, 'rgba(99,102,241,0.12)', '#6366f188', '#818cf8')
                : '';

            return {
                orderId: parseInt(row.orderId) || 0,
                npc: parseInt(npc) || 0,
                item1Type: row.item1_type || '',
                item1Name: nameMap[row.item1_id] || row.item1_name || '',
                has2Items: !!(row.item2_type),
                html: `<tr>
                    <td class="mono" style="color:var(--text-muted)">${row.orderId}</td>
                    <td>${npcBadge}</td>
                    <td style="font-size:0.85rem">${item1}</td>
                    <td style="font-size:0.85rem">${item2}</td>
                    <td style="font-size:0.82rem;line-height:1.8">${rewards || '—'}</td>
                </tr>`,
            };
        });
    }

    function initOrderDetails(orderDetail, nameMap) {
        const allRows = buildOrderDetailRows(orderDetail, nameMap);

        setText('order-total-count', allRows.length.toLocaleString());

        const npcValues = [...new Set(orderDetail.map(r => r.idNPC).filter(Boolean))]
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(v => `NPC ${v}`);
        fillSelect('order-filter-npc', npcValues);

        const types = [...new Set(orderDetail.map(r => r.item1_type).filter(Boolean))].sort();
        fillSelect('order-filter-type', types);

        let sortKey = 'orderId', sortAsc = true;

        function render() {
            const search  = ($('order-search')?.value || '').toLowerCase().trim();
            const npcF    = $('order-filter-npc')?.value || '';
            const typeF   = $('order-filter-type')?.value || '';
            const twoF    = $('order-filter-2item')?.value || '';

            const filtered = allRows.filter(r => {
                if (npcF  && `NPC ${r.npc}` !== npcF) return false;
                if (typeF && r.item1Type !== typeF)    return false;
                if (twoF === 'yes' && !r.has2Items)    return false;
                if (twoF === 'no'  &&  r.has2Items)    return false;
                if (search && !r.item1Name.toLowerCase().includes(search)
                           && !String(r.orderId).includes(search)) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));

            setText('order-result-count', filtered.length.toLocaleString() + ' orders');
            renderRows('order-detail-body', filtered, 5);
        }

        bindSort('order-detail-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['order-search', 'order-filter-npc', 'order-filter-type', 'order-filter-2item'], render);
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
    // SUB-TAB 3: TOP DEMAND
    // ═════════════════════════════════════════════════════════════════════════

    function calcDemand(orderDetail, nameMap) {
        const demand = {};
        orderDetail.forEach(row => {
            for (let i = 1; i <= 2; i++) {
                const type = row[`item${i}_type`];
                const id   = row[`item${i}_id`];
                const amt  = parseInt(row[`item${i}_amount`]) || 0;
                if (!type || !id || amt === 0) continue;
                const key = `${type}__${id}`;
                if (!demand[key]) demand[key] = { type, id, name: nameMap[id] || id, count: 0, totalAmt: 0 };
                demand[key].count++;
                demand[key].totalAmt += amt;
            }
        });
        return Object.values(demand).sort((a, b) => b.count - a.count);
    }

    function buildDemandRows(demand) {
        return demand.map((d, i) => ({
            rank: i + 1, count: d.count, totalAmt: d.totalAmt,
            name: d.name, type: d.type,
            html: `<tr>
                <td class="mono" style="color:var(--text-muted);text-align:center">${i + 1}</td>
                <td style="color:var(--accent);font-size:0.78rem">${d.type}</td>
                <td>${d.name}</td>
                <td class="mono" style="color:var(--energy);font-weight:700">${d.count}</td>
                <td class="mono" style="color:var(--gold)">${d.totalAmt}</td>
            </tr>`,
        }));
    }

    function renderDemandChart(demand) {
        const ctx = $('demand-chart');
        if (!ctx) return;
        if (window._demandChart) window._demandChart.destroy();
        const top12 = demand.slice(0, 12);
        window._demandChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top12.map(d => d.name.length > 16 ? d.name.slice(0, 16) + '…' : d.name),
                datasets: [{
                    label: 'Order Count',
                    data: top12.map(d => d.count),
                    backgroundColor: top12.map((_, i) => `hsl(${200 + i * 10}, 70%, 58%)`),
                    borderRadius: 6, borderWidth: 0,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c => ` ${c.parsed.x} orders` } },
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
                },
            },
        });
    }

    function initTopDemand(orderDetail, nameMap) {
        const demand  = calcDemand(orderDetail, nameMap);
        const allRows = buildDemandRows(demand);

        setText('demand-total-items', demand.length.toLocaleString());

        let sortKey = 'rank', sortAsc = true;

        function render() {
            const search = ($('demand-search')?.value || '').toLowerCase().trim();
            const filtered = allRows.filter(r => {
                if (search && !r.name.toLowerCase().includes(search) && !r.type.toLowerCase().includes(search)) return false;
                return true;
            }).sort((a, b) => sortByKey(a, b, sortKey, sortAsc));
            renderRows('demand-body', filtered, 5);
        }

        bindSort('demand-table', () => ({ key: sortKey, asc: sortAsc }),
            (k, a) => { sortKey = k; sortAsc = a; }, render);
        bindFilters(['demand-search'], render);
        render();
        renderDemandChart(demand);

        // Store processed demand for other modules
        window.ProcessedData.orders.demandMap = Object.fromEntries(
            demand.map(d => [d.id, { type: d.type, name: d.name, count: d.count, totalAmt: d.totalAmt }])
        );
    }

    // ═════════════════════════════════════════════════════════════════════════
    // STATS
    // ═════════════════════════════════════════════════════════════════════════

    function updateStats(orderDetail, orderSystem) {
        const twoItem = orderDetail.filter(r => r.item2_type && r.item2_type !== '').length;
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
        const nameMap     = buildItemLabelMap(gd);
        const orderDetail = gd.orderDetail  || [];
        const orderSystem = gd.orderSystem  || [];

        // Scope sub-tabs to orders panel
        initSubTabs(document.getElementById('panel-orders'));

        updateStats(orderDetail, orderSystem);
        initOrderDetails(orderDetail, nameMap);
        initOrderBatches(orderSystem);
        initTopDemand(orderDetail, nameMap);

        // Store processed rows in shared store
        window.ProcessedData.orders = {
            ...(window.ProcessedData.orders || {}),
            orderDetail,
            orderSystem,
            nameMap,
        };
    }

    return { init };

})();
