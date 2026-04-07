/**
 * economy.js — Tab 5: Economy Flow (Source / Sink)
 * Hiển thị sơ đồ dòng tiền Sources → Pools → Sinks
 * và bảng chi tiết từng currency.
 */
const EconomyEngine = (() => {

  const CURRENCIES = [
    { key: 'gold',     label: 'Gold ⭐',    color: '#fbbf24', icon: '⭐', enum: 1 },
    { key: 'diamond',  label: 'Diamond 💎', color: '#c084fc', icon: '💎', enum: 2 },
    { key: 'energy',   label: 'Energy ⚡',  color: '#60a5fa', icon: '⚡', enum: 3 },
    { key: 'star',     label: 'Star 🌟',    color: '#38bdf8', icon: '🌟', enum: 7 },
  ];

  const FLOW_DATA = {
    sources: [
      { id: 'gen',    label: 'Generator',    icon: '🏭', desc: 'Item raw sinh ra từ generator theo cấp độ', currency: ['item'] },
      { id: 'order',  label: 'Order Reward', icon: '📋', desc: 'Hoàn thành order → Gold, Star, Item', currency: ['gold','star','item'] },
      { id: 'batch',  label: 'Batch Reward', icon: '📦', desc: 'Clear batch → Tool, Chest, Generator', currency: ['item'] },
      { id: 'daily',  label: 'Daily Gift',   icon: '🎁', desc: 'Daily login reward — Generator, Energy', currency: ['energy','item'] },
      { id: 'video',  label: 'Video Bonus',  icon: '📹', desc: 'Xem ads → Currency hoặc Item', currency: ['energy','gold'] },
      { id: 'chest',  label: 'Chest / Box',  icon: '🎀', desc: 'Mở chest → Generator hoặc Item drop', currency: ['item'] },
    ],
    pools: [
      { id: 'item_pool',   label: 'Item Pool',     icon: '🗃️', desc: 'Board items: Raw, Food, Tool, Booster' },
      { id: 'gold_pool',   label: 'Gold',           icon: '⭐', desc: 'Soft currency — build, recipe cost' },
      { id: 'energy_pool', label: 'Energy',         icon: '⚡', desc: 'Session gate — tap generator, cook' },
      { id: 'diamond_pool',label: 'Diamond',        icon: '💎', desc: 'Hard currency — skip time, buy energy' },
    ],
    sinks: [
      { id: 'build',   label: 'Build Up',    icon: '🏗️', desc: 'Tốn Star để xây từng step scene', currency: ['star'] },
      { id: 'cook',    label: 'Recipe Cook', icon: '🍳', desc: 'Tốn time + item raw → Food', currency: ['item','time'] },
      { id: 'skip',    label: 'Skip Time',   icon: '⏩', desc: 'Dùng Diamond/SkipTime để skip thời gian nấu', currency: ['diamond'] },
      { id: 'energy_s',label: 'Energy Use',  icon: '⚡', desc: 'Tap generator, ItemExpand tốn Energy', currency: ['energy'] },
      { id: 'iap',     label: 'IAP / Shop',  icon: '💳', desc: 'Buy Energy, Diamond, BuyCurrency package', currency: ['real_money'] },
    ],
  };

  // --- Render Flow Diagram ---

  function renderFlowDiagram() {
    const container = document.getElementById('economy-flow');
    if (!container) return;

    const makeNodes = (list, cssClass) => list.map(n => `
      <div class="flow-node ${cssClass}" title="${n.desc}">
        <span>${n.icon}</span>
        <div>
          <div style="font-weight:600;font-size:12px">${n.label}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">${n.desc}</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 60px 1fr 60px 1fr;gap:16px;align-items:start">
        <!-- Sources -->
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#34d399;margin-bottom:12px">▼ SOURCES</div>
          <div style="display:flex;flex-direction:column;gap:8px">${makeNodes(FLOW_DATA.sources, 'flow-node-source')}</div>
        </div>
        <!-- Arrow -->
        <div style="display:flex;align-items:center;justify-content:center;margin-top:40px">
          <div style="color:#475569;font-size:22px">→</div>
        </div>
        <!-- Pools -->
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#38bdf8;margin-bottom:12px">◆ POOLS</div>
          <div style="display:flex;flex-direction:column;gap:8px">${makeNodes(FLOW_DATA.pools, 'flow-node-pool')}</div>
        </div>
        <!-- Arrow -->
        <div style="display:flex;align-items:center;justify-content:center;margin-top:40px">
          <div style="color:#475569;font-size:22px">→</div>
        </div>
        <!-- Sinks -->
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f87171;margin-bottom:12px">▲ SINKS</div>
          <div style="display:flex;flex-direction:column;gap:8px">${makeNodes(FLOW_DATA.sinks, 'flow-node-sink')}</div>
        </div>
      </div>
    `;
  }

  // --- Render Currency Detail Table ---

  function renderCurrencyTable(db) {
    const container = document.getElementById('currency-table-wrap');
    if (!container) return;

    // Đếm order rewards theo loại currency
    const orderRewardCount = { 1: 0, 2: 0, 3: 0, 7: 0 };
    db.orderSystem.forEach(row => {
      for (let i = 1; i <= 7; i++) {
        const rtype = parseInt(row[`reward${i}_resType`]) || 0;
        if (orderRewardCount[rtype] !== undefined) orderRewardCount[rtype]++;
      }
    });

    const rows = CURRENCIES.map(c => `
      <tr>
        <td class="primary">${c.icon} ${c.label}</td>
        <td><span class="tag tag-green">Orders, Batches, Daily, Video</span></td>
        <td><span class="tag tag-red">Build Up, Energy, Skip Time</span></td>
        <td class="mono" style="color:${c.color}">${orderRewardCount[c.enum] || '—'} order batches</td>
        <td><span class="tag tag-gray">${c.key === 'diamond' ? 'Hard (IAP)' : c.key === 'energy' ? 'Session gate' : 'Soft'}</span></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead><tr>
            <th>Currency</th><th>Sources</th><th>Sinks</th><th>Batch Rewards</th><th>Type</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // --- Render Pinch Points ---

  function renderPinchPoints(db) {
    const container = document.getElementById('pinch-points');
    if (!container) return;

    // Tính item có sum_merge cao nhất (bottleneck merge chain)
    const deepItems = db.itemMerge
      .filter(r => parseInt(r.sum_merge) > 100)
      .sort((a, b) => parseInt(b.sum_merge) - parseInt(a.sum_merge))
      .slice(0, 8);

    const rows = deepItems.map(r => `
      <tr>
        <td class="primary">${r.name_item || '—'}</td>
        <td class="mono accent-blue">${r.type}</td>
        <td class="mono accent-gold">${parseInt(r.sum_merge).toLocaleString()}</td>
        <td><span class="tag tag-red">Merge bottleneck</span></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Item</th><th>Type</th><th>Sum Merges</th><th>Pinch Type</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // --- Render Source/Sink Chart ---

  function renderEconomyChart(db) {
    const ctx = document.getElementById('economy-chart');
    if (!ctx) return;
    if (window._economyChart) window._economyChart.destroy();

    // Đếm reward types trong OrderSystem
    const rewardCounts = {};
    db.orderSystem.forEach(row => {
      for (let i = 1; i <= 7; i++) {
        const rt = row[`reward${i}_resType`];
        const rn = parseInt(row[`reward${i}_resNumber`]) || 0;
        if (rt && rn > 0) {
          const LABEL_MAP = { '1': 'Gold ⭐', '2': 'Item 📦', '3': 'Energy ⚡', '5': 'Exp', '7': 'Star 🌟', '13': 'Energy Pack', '17': 'Booster' };
          const label = LABEL_MAP[rt] || `Type ${rt}`;
          rewardCounts[label] = (rewardCounts[label] || 0) + rn;
        }
      }
    });

    const entries = Object.entries(rewardCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    window._economyChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{
          data: entries.map(e => e[1]),
          backgroundColor: ['#fbbf24','#38bdf8','#60a5fa','#a78bfa','#c084fc','#34d399','#f87171','#fb923c'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 } },
          title: { display: true, text: 'Batch Reward Distribution', color: '#94a3b8', font: { family: 'Outfit', size: 13 } },
        },
      },
    });
  }

  function init(db) {
    renderFlowDiagram();
    renderCurrencyTable(db);
    renderPinchPoints(db);
    renderEconomyChart(db);
  }

  return { init };
})();
