/**
 * orders.js — Tab 6: Order & Demand Analysis
 * Phân tích demand: item nào được order nhiều nhất, difficulty curve theo batch.
 */
const OrdersEngine = (() => {

  const ITEM_LABELS = {};  // sẽ fill từ itemMerge + itemFood

  function buildItemLabelMap(db) {
    [...db.itemMerge, ...db.itemFood, ...db.itemTool, ...db.itemGenerator].forEach(row => {
      if (row.id && row.name_item) ITEM_LABELS[row.id] = row.name_item;
    });
  }

  // --- Demand Analysis: top items by order frequency ---

  function calcItemDemand(orderDetail) {
    const demand = {};
    orderDetail.forEach(row => {
      for (let i = 1; i <= 2; i++) {
        const type = row[`item${i}_type`];
        const id   = row[`item${i}_id`];
        const amt  = parseInt(row[`item${i}_amount`]) || 0;
        if (!type || !id || amt === 0) continue;
        const key  = `${type}__${id}`;
        if (!demand[key]) demand[key] = { type, id, name: ITEM_LABELS[id] || id, count: 0, totalAmt: 0 };
        demand[key].count++;
        demand[key].totalAmt += amt;
      }
    });
    return Object.values(demand).sort((a, b) => b.count - a.count);
  }

  function renderDemandTable(demand) {
    const tbody = document.getElementById('demand-tbody');
    if (!tbody) return;

    tbody.innerHTML = demand.slice(0, 30).map((d, i) => `
      <tr>
        <td class="mono text-muted">${i + 1}</td>
        <td class="primary">${d.name}</td>
        <td class="text-secondary text-sm">${d.type}</td>
        <td class="mono accent-blue">${d.count}</td>
        <td class="mono accent-gold">${d.totalAmt}</td>
      </tr>
    `).join('');
  }

  function renderDemandChart(demand) {
    const ctx = document.getElementById('demand-chart');
    if (!ctx) return;
    if (window._demandChart) window._demandChart.destroy();

    const top15 = demand.slice(0, 15);
    window._demandChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top15.map(d => d.name.length > 14 ? d.name.slice(0, 14) + '…' : d.name),
        datasets: [{
          label: 'Order Count',
          data: top15.map(d => d.count),
          backgroundColor: top15.map((_, i) => `hsl(${200 + i * 8}, 70%, 60%)`),
          borderRadius: 6,
          borderWidth: 0,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} orders` } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  // --- Batch reward summary ---

  function renderBatchRewardTable(orderSystem) {
    const tbody = document.getElementById('batch-reward-tbody');
    if (!tbody) return;

    const THEME_MAP = { '0': 'Tutorial', '1': 'Scene 1', '2': 'Scene 2', '3': 'Scene 3', '4': 'Scene 4', '5': 'Scene 5' };
    const RES_MAP   = { '1': '⭐ Gold', '2': '📦 Item', '3': '⚡ Energy', '5': 'Exp', '7': '🌟 Star', '13': 'Energy Pack', '17': 'Booster', '20': 'Seafood', '74': 'Chest L1', '75': 'Chest L2', '76': 'Chest L3', '77': 'Chest L4', '78': 'Chest L5', '134': 'ItemChest', '141': 'Gift' };

    tbody.innerHTML = orderSystem.slice(0, 20).map(row => {
      const rewards = [];
      for (let i = 1; i <= 7; i++) {
        const rt = row[`reward${i}_resType`];
        const rn = row[`reward${i}_resNumber`];
        if (rt && rn && parseInt(rn) > 0) rewards.push(`${RES_MAP[rt] || rt} ×${rn}`);
      }
      return `<tr>
        <td class="mono accent-blue">${row.id}</td>
        <td><span class="tag tag-blue">${THEME_MAP[row.themeType] || row.themeType}</span></td>
        <td class="mono text-xs">${row.canReceiveReward === '1' ? '<span class="tag tag-green">Yes</span>' : '<span class="tag tag-gray">No</span>'}</td>
        <td class="text-secondary text-xs">${rewards.join(' · ') || '—'}</td>
      </tr>`;
    }).join('');
  }

  function renderOrderStats(orderDetail, orderSystem) {
    const twoItemOrders = orderDetail.filter(r => r.item2_type && r.item2_type !== '').length;
    document.getElementById('stat-orders-total').textContent  = orderDetail.length;
    document.getElementById('stat-orders-2item').textContent  = twoItemOrders;
    document.getElementById('stat-batches-total').textContent = orderSystem.length;
  }

  function init(db) {
    buildItemLabelMap(db);
    const demand = calcItemDemand(db.orderDetail);
    renderOrderStats(db.orderDetail, db.orderSystem);
    renderDemandTable(demand);
    renderDemandChart(demand);
    renderBatchRewardTable(db.orderSystem);
  }

  return { init };
})();
