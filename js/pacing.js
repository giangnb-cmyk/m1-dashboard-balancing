/**
 * pacing.js — Tab 2: Progression Pacing
 *
 * Tính toán real-time day → scene → step build → batch order
 * theo 3 profile: Hardcore (8 sessions/day), Mid-core (4), Casual (1.5)
 *
 * Assumptions:
 *  - 1 session = 20 energy
 *  - 1 build step costs ~1 energy (Star cost dùng riêng cho build)
 *  - 1 batch = 7 orders; mỗi order trung bình 3 phút play
 *  - Energy regen: 1 energy/5 min (12/hour)
 */
const PacingEngine = (() => {

  const PROFILES = {
    hardcore: { label: 'Hardcore', sessions: 8,   color: '#f87171',  colorAlpha: 'rgba(248,113,113,0.15)' },
    midcore:  { label: 'Mid-core', sessions: 4,   color: '#38bdf8',  colorAlpha: 'rgba(56,189,248,0.15)'  },
    casual:   { label: 'Casual',   sessions: 1.5, color: '#a78bfa',  colorAlpha: 'rgba(167,139,250,0.15)' },
  };

  const ENERGY_PER_SESSION = 20;
  const MINS_PER_ORDER     = 3;
  const ORDERS_PER_BATCH   = 7;

  // --- Data helpers ---

  function buildSceneSummary(buildUpGoalData) {
    const scenes = {};
    buildUpGoalData.forEach(row => {
      const theme = row.theme;
      if (!theme) return;
      if (!scenes[theme]) scenes[theme] = { theme, steps: 0, totalCost: 0, rows: [] };
      const cost = parseFloat(row.cost) || 0;
      scenes[theme].steps++;
      scenes[theme].totalCost += cost;
      scenes[theme].rows.push({ id: parseInt(row.id) || 0, cost });
    });
    return Object.values(scenes).sort((a, b) => a.theme.localeCompare(b.theme));
  }

  function buildBatchSummary(orderSystem) {
    const batches = {};
    orderSystem.forEach(row => {
      const theme = row.themeType;
      if (!batches[theme]) batches[theme] = 0;
      batches[theme]++;
    });
    // Map themeType int → scene name
    const THEME_MAP = { '0': 'Tutorial', '1': 'Scene_01', '2': 'Scene_02', '3': 'Scene_03', '4': 'Scene_04', '5': 'Scene_05' };
    return Object.entries(batches).map(([k, count]) => ({
      themeKey: k,
      sceneName: THEME_MAP[k] || `Theme_${k}`,
      batchCount: count,
    })).sort((a, b) => parseInt(a.themeKey) - parseInt(b.themeKey));
  }

  /**
   * Tính số ngày cần để clear 1 scene theo từng profile.
   * Công thức đơn giản:
   *   energyPerDay = sessions * ENERGY_PER_SESSION
   *   stepsPerDay  = energyPerDay (1 step = 1 energy)
   *   orderMinsPerDay = sessions * 15 (15 min play per session trừ build)
   *   batchesPerDay = orderMinsPerDay / (ORDERS_PER_BATCH * MINS_PER_ORDER)
   */
  function calcDaysForScene(scene, batchCount, sessionsPerDay) {
    const energyPerDay  = sessionsPerDay * ENERGY_PER_SESSION;
    const stepsPerDay   = Math.max(1, energyPerDay * 0.4); // 40% energy → build
    const buildDays     = scene.totalCost / (stepsPerDay * 5); // cost unit ≠ energy, scale

    const orderMinsPerDay  = sessionsPerDay * 15;
    const batchesPerDay    = orderMinsPerDay / (ORDERS_PER_BATCH * MINS_PER_ORDER);
    const orderDays        = batchCount / Math.max(0.1, batchesPerDay);

    return Math.max(buildDays, orderDays);
  }

  // --- Render ---

  function renderSceneCards(scenes, batchSummary, db) {
    const container = document.getElementById('scene-cards');
    if (!container) return;

    container.innerHTML = '';
    scenes.forEach(scene => {
      const batchInfo = batchSummary.find(b => b.sceneName === scene.theme);
      const batchCount = batchInfo ? batchInfo.batchCount : 0;

      const daysHC = calcDaysForScene(scene, batchCount, PROFILES.hardcore.sessions).toFixed(1);
      const daysMC = calcDaysForScene(scene, batchCount, PROFILES.midcore.sessions).toFixed(1);
      const daysCA = calcDaysForScene(scene, batchCount, PROFILES.casual.sessions).toFixed(1);

      const card = document.createElement('div');
      card.className = 'scene-card glass';
      card.dataset.scene = scene.theme;
      card.innerHTML = `
        <div class="scene-name">${scene.theme.replace('_', ' ')}</div>
        <div class="scene-stats">
          <div class="scene-stat-row"><span>Steps</span><span>${scene.steps}</span></div>
          <div class="scene-stat-row"><span>Total Cost</span><span>${scene.totalCost.toLocaleString()} ⭐</span></div>
          <div class="scene-stat-row"><span>Batches</span><span>${batchCount}</span></div>
          <div class="scene-stat-row" style="margin-top:8px; font-size:11px; color:#f87171"><span>🔴 HC</span><span>~${daysHC}d</span></div>
          <div class="scene-stat-row" style="font-size:11px; color:#38bdf8"><span>🔵 MC</span><span>~${daysMC}d</span></div>
          <div class="scene-stat-row" style="font-size:11px; color:#a78bfa"><span>🟣 CA</span><span>~${daysCA}d</span></div>
        </div>
      `;
      card.addEventListener('click', () => {
        document.querySelectorAll('.scene-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        renderStepTable(scene, db);
      });
      container.appendChild(card);
    });

    // Auto-select first scene
    if (scenes.length) {
      container.querySelector('.scene-card').classList.add('active');
      renderStepTable(scenes[0], db);
    }
  }

  function renderStepTable(scene, db) {
    const wrap = document.getElementById('step-table-wrap');
    if (!wrap) return;

    const rows = scene.rows;
    let cumCost = 0;
    const tableRows = rows.map(r => {
      cumCost += r.cost;
      return `<tr>
        <td class="mono">${r.id}</td>
        <td class="mono accent-gold">${r.cost}</td>
        <td class="mono">${cumCost.toLocaleString()}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="panel glass">
        <div class="panel-header">
          <span class="panel-title">Step Detail — ${scene.theme.replace('_', ' ')}</span>
          <span class="panel-badge">${rows.length} steps</span>
        </div>
        <div class="table-container" style="max-height:340px;overflow-y:auto">
          <table class="data-table">
            <thead><tr>
              <th>Step</th><th>Cost ⭐</th><th>Cumulative ⭐</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderPacingChart(scenes, batchSummary) {
    const ctx = document.getElementById('pacing-chart');
    if (!ctx) return;
    if (window._pacingChart) window._pacingChart.destroy();

    const labels = scenes.map(s => s.theme.replace('Scene_', 'S'));

    const makeData = (sessions) => scenes.map(s => {
      const bi = batchSummary.find(b => b.sceneName === s.theme);
      return parseFloat(calcDaysForScene(s, bi ? bi.batchCount : 0, sessions).toFixed(1));
    });

    window._pacingChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Hardcore (8 ses/d)',
            data: makeData(8),
            backgroundColor: 'rgba(248,113,113,0.25)',
            borderColor: '#f87171',
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'Mid-core (4 ses/d)',
            data: makeData(4),
            backgroundColor: 'rgba(56,189,248,0.25)',
            borderColor: '#38bdf8',
            borderWidth: 1.5,
            borderRadius: 6,
          },
          {
            label: 'Casual (1.5 ses/d)',
            data: makeData(1.5),
            backgroundColor: 'rgba(167,139,250,0.25)',
            borderColor: '#a78bfa',
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ~${ctx.parsed.y} days` } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' }, title: { display: true, text: 'Days', color: '#475569' } },
        },
      },
    });
  }

  function renderCostChart(scenes) {
    const ctx = document.getElementById('cost-chart');
    if (!ctx) return;
    if (window._costChart) window._costChart.destroy();

    window._costChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: scenes.map(s => s.theme.replace('Scene_', 'S')),
        datasets: [{
          label: 'Total Build Cost ⭐',
          data: scenes.map(s => s.totalCost),
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.08)',
          borderWidth: 2,
          pointBackgroundColor: '#fbbf24',
          pointRadius: 5,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  function renderSummaryStats(scenes, batchSummary) {
    const totalSteps  = scenes.reduce((s, sc) => s + sc.steps, 0);
    const totalCost   = scenes.reduce((s, sc) => s + sc.totalCost, 0);
    const totalBatch  = batchSummary.reduce((s, b) => s + b.batchCount, 0);
    const totalOrders = totalBatch * ORDERS_PER_BATCH;

    document.getElementById('stat-total-scenes').textContent  = scenes.length;
    document.getElementById('stat-total-steps').textContent   = totalSteps;
    document.getElementById('stat-total-cost').textContent    = totalCost.toLocaleString();
    document.getElementById('stat-total-batches').textContent = totalBatch;
    document.getElementById('stat-total-orders').textContent  = totalOrders;

    // Cumulative days per profile
    let cumHC = 0, cumMC = 0, cumCA = 0;
    scenes.forEach(sc => {
      const bi = batchSummary.find(b => b.sceneName === sc.theme);
      const bc = bi ? bi.batchCount : 0;
      cumHC += calcDaysForScene(sc, bc, 8);
      cumMC += calcDaysForScene(sc, bc, 4);
      cumCA += calcDaysForScene(sc, bc, 1.5);
    });
    document.getElementById('stat-days-hc').textContent = `~${Math.round(cumHC)}d`;
    document.getElementById('stat-days-mc').textContent = `~${Math.round(cumMC)}d`;
    document.getElementById('stat-days-ca').textContent = `~${Math.round(cumCA)}d`;
  }

  function init(db) {
    const scenes       = buildSceneSummary(db.buildUpGoalData);
    const batchSummary = buildBatchSummary(db.orderSystem);

    renderSummaryStats(scenes, batchSummary);
    renderSceneCards(scenes, batchSummary, db);
    renderPacingChart(scenes, batchSummary);
    renderCostChart(scenes);
  }

  return { init };
})();
