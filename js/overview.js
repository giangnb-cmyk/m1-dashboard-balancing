/**
 * overview.js — Tab 1: Game Timeline / Overview
 * Hiển thị tổng quan project và timeline scene theo real-time day.
 */
const Overview = (() => {

  function renderTimelineTable(db) {
    const container = document.getElementById('timeline-table-wrap');
    if (!container) return;

    // Build scene summary
    const sceneMap = {};
    db.buildUpGoalData.forEach(row => {
      const t = row.theme; if (!t) return;
      if (!sceneMap[t]) sceneMap[t] = { steps: 0, cost: 0 };
      sceneMap[t].steps++;
      sceneMap[t].cost += parseFloat(row.cost) || 0;
    });

    const batchMap = {};
    const THEME_MAP = { '1': 'Scene_01', '2': 'Scene_02', '3': 'Scene_03', '4': 'Scene_04', '5': 'Scene_05' };
    db.orderSystem.forEach(row => {
      const sn = THEME_MAP[row.themeType];
      if (sn) batchMap[sn] = (batchMap[sn] || 0) + 1;
    });

    const scenes = Object.entries(sceneMap).sort((a, b) => a[0].localeCompare(b[0]));

    // Cumulative days (Mid-core reference)
    let cumDayMC = 0;
    const SESSION_MC = 4;
    const ENERGY_PS  = 20;
    const MINS_PER_ORDER = 3;

    const rows = scenes.map(([name, data], idx) => {
      const bc = batchMap[name] || 0;
      const energyPerDay = SESSION_MC * ENERGY_PS;
      const stepsPerDay  = Math.max(1, energyPerDay * 0.4 / 5);
      const buildDays    = data.cost / (stepsPerDay * 5) || 0;
      const orderMins    = SESSION_MC * 15;
      const batchesPerDay = orderMins / (7 * MINS_PER_ORDER);
      const orderDays    = bc / Math.max(0.1, batchesPerDay);
      const sceneDays    = Math.max(buildDays, orderDays);
      const dayStart     = Math.round(cumDayMC) + 1;
      cumDayMC          += sceneDays;
      const dayEnd       = Math.round(cumDayMC);

      return `<tr>
        <td><span class="tag tag-blue">Scene ${idx + 1}</span></td>
        <td class="primary">${name.replace('_', ' ')}</td>
        <td class="mono">${data.steps}</td>
        <td class="mono accent-gold">${data.cost.toLocaleString()}</td>
        <td class="mono">${bc}</td>
        <td class="mono">${bc * 7}</td>
        <td class="mono" style="color:#38bdf8">Day ${dayStart} – ${dayEnd}</td>
        <td class="mono text-secondary">~${Math.round(sceneDays)}d</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Scene</th><th>Steps</th>
            <th>Total Cost ⭐</th><th>Batches</th><th>Orders</th>
            <th>Timeline (Mid-core)</th><th>Duration</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderTimelineChart(db) {
    const ctx = document.getElementById('timeline-chart');
    if (!ctx) return;
    if (window._timelineChart) window._timelineChart.destroy();

    const sceneMap = {};
    db.buildUpGoalData.forEach(row => {
      const t = row.theme; if (!t) return;
      if (!sceneMap[t]) sceneMap[t] = { steps: 0, cost: 0 };
      sceneMap[t].steps++;
      sceneMap[t].cost += parseFloat(row.cost) || 0;
    });

    const batchMap = {};
    const THEME_MAP = { '1': 'Scene_01', '2': 'Scene_02', '3': 'Scene_03', '4': 'Scene_04', '5': 'Scene_05' };
    db.orderSystem.forEach(row => {
      const sn = THEME_MAP[row.themeType];
      if (sn) batchMap[sn] = (batchMap[sn] || 0) + 1;
    });

    const PROFILES = [
      { label: 'Hardcore', sessions: 8,   color: '#f87171' },
      { label: 'Mid-core', sessions: 4,   color: '#38bdf8' },
      { label: 'Casual',   sessions: 1.5, color: '#a78bfa' },
    ];

    const scenes = Object.keys(sceneMap).sort();

    const calcCumDays = (sessions) => {
      let cum = 0;
      return scenes.map(name => {
        const data = sceneMap[name];
        const bc = batchMap[name] || 0;
        const energyPerDay = sessions * 20;
        const stepsPerDay  = Math.max(1, energyPerDay * 0.4 / 5);
        const buildDays    = data.cost / (stepsPerDay * 5) || 0;
        const batchesPerDay = (sessions * 15) / (7 * 3);
        const orderDays    = bc / Math.max(0.1, batchesPerDay);
        cum += Math.max(buildDays, orderDays);
        return Math.round(cum);
      });
    };

    window._timelineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: scenes.map(s => s.replace('Scene_', 'Scene ')),
        datasets: PROFILES.map(p => ({
          label: `${p.label} (${p.sessions} ses/d)`,
          data: calcCumDays(p.sessions),
          borderColor: p.color,
          backgroundColor: p.color + '18',
          borderWidth: 2,
          pointBackgroundColor: p.color,
          pointRadius: 5,
          fill: false,
          tension: 0.2,
        })),
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: Day ${ctx.parsed.y}` } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: {
            ticks: { color: '#94a3b8', callback: v => `Day ${v}` },
            grid: { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: 'Cumulative Days', color: '#475569' },
          },
        },
      },
    });
  }

  function renderOverviewStats(db) {
    const totalScenes  = new Set(db.buildUpGoalData.map(r => r.theme).filter(Boolean)).size;
    const totalSteps   = db.buildUpGoalData.length;
    const totalCost    = db.buildUpGoalData.reduce((s, r) => s + (parseFloat(r.cost) || 0), 0);
    const totalBatches = db.orderSystem.length;
    const totalOrders  = db.orderDetail.length;
    const totalItems   = db.itemMerge.length + db.itemGenerator.length + db.itemTool.length + db.itemFood.length;

    document.getElementById('ov-scenes').textContent  = totalScenes;
    document.getElementById('ov-steps').textContent   = totalSteps;
    document.getElementById('ov-cost').textContent    = totalCost.toLocaleString();
    document.getElementById('ov-batches').textContent = totalBatches;
    document.getElementById('ov-orders').textContent  = totalOrders;
    document.getElementById('ov-items').textContent   = totalItems.toLocaleString();
  }

  function init(db) {
    renderOverviewStats(db);
    renderTimelineTable(db);
    renderTimelineChart(db);
  }

  return { init };
})();
