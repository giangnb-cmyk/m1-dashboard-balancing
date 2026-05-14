// js/sim/simChart.js
const SimChart = (() => {
  let _chart = null;
  let _catalogs = null;
  let _tick = null;
  let _playInterval = null;
  let _speedMs = 200;

  function init(catalogs) {
    _catalogs = catalogs;
    _bindPlaybackControls();
    _bindSpeedButtons();
  }

  function _colors() {
    return (typeof SimConfig !== 'undefined' && SimConfig.getColors)
      ? SimConfig.getColors()
      : ['#38bdf8', '#f87171', '#a78bfa', '#34d399'];
  }

  function buildChart(profileNames) {
    const ctx = document.getElementById('psim-chart');
    if (!ctx) return;
    if (_chart) _chart.destroy();
    const sceneCnt = (_catalogs && _catalogs.sceneCatalog) ? _catalogs.sceneCatalog.length : 5;
    const sceneLabels = (_catalogs && _catalogs.sceneCatalog || [])
      .map(s => s.name.replace('Scene_', 'S'));
    const colors = _colors();

    _chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: profileNames.map((name, i) => ({
          label: name,
          data: [],
          borderColor: colors[i % colors.length],
          backgroundColor: colors[i % colors.length] + '18',
          borderWidth: 2,
          pointRadius: 0,
          stepped: 'before',
          tension: 0
        }))
      },
      options: {
        responsive: true,
        animation: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Day', color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid:  { color: 'rgba(255,255,255,0.05)' }
          },
          y: {
            title: { display: true, text: 'Scene', color: '#94a3b8' },
            ticks: { color: '#94a3b8', callback: v => sceneLabels[v] || `S${v}` },
            min: -0.3,
            max: Math.max(2, sceneCnt),
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `Day ${items[0].parsed.x}`,
              label: item => {
                const s = sceneLabels[Math.floor(item.parsed.y)] || `Scene ${item.parsed.y}`;
                return `${item.dataset.label}: ${s}`;
              }
            }
          }
        }
      }
    });
    _renderLegend(profileNames);
  }

  function _renderLegend(profileNames) {
    const el = document.getElementById('psim-legend');
    if (!el) return;
    const colors = _colors();
    el.innerHTML = profileNames.map((name, i) =>
      `<div class="psim-legend-item">
        <div class="psim-legend-dot" style="background:${colors[i % colors.length]}"></div>
        <span>${name}</span>
      </div>`
    ).join('');
  }

  function _pushDataPoint(profileIdx, day, sceneIndex) {
    if (!_chart || profileIdx >= _chart.data.datasets.length) return;
    _chart.data.datasets[profileIdx].data.push({ x: day, y: sceneIndex });
    _chart.update('none');
  }

  function _updateDayLabel(day) {
    const el = document.getElementById('psim-day-label');
    if (el) el.textContent = `Day ${day}`;
  }

  function renderStats(profiles, allLogs) {
    const el = document.getElementById('psim-stats');
    if (!el || !_catalogs) return;
    const scenes = (_catalogs.sceneCatalog || []);
    const headers = ['Profile', ...scenes.map(s => s.name.replace('Scene_', 'S')), 'Sim End'];

    const rows = profiles.map((p, i) => {
      const logs = allLogs[i] || [];
      const sceneDays = scenes.map((s, si) => {
        const first = logs.find(l => l.sceneIndex > si);
        return first ? `Day ${first.day}` : '—';
      });
      const last = logs[logs.length - 1];
      return [p.name, ...sceneDays, last ? `Day ${last.day}` : '—'];
    });

    el.innerHTML = `
      <div class="panel-header" style="margin-bottom:0.75rem">
        <span class="panel-title">Scene Milestones</span>
      </div>
      <div class="table-container" style="overflow-x:auto">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function renderEconomy(profiles, allFinalStates) {
    const el = document.getElementById('psim-economy');
    if (!el) return;
    const headers = ['Profile', 'Energy rcv', 'Energy spent', 'Gems rcv', 'Gems spent', 'Gold rcv', 'Gold spent'];

    const rows = profiles.map((p, i) => {
      const eco = (allFinalStates[i] || {}).economy || {};
      const en = eco.energy || {}, ge = eco.gems || {}, go = eco.gold || {};
      return [p.name,
        (en.received || 0).toLocaleString(), (en.spent || 0).toLocaleString(),
        (ge.received || 0).toLocaleString(), (ge.spent  || 0).toLocaleString(),
        (go.received || 0).toLocaleString(), (go.spent  || 0).toLocaleString()
      ];
    });

    el.innerHTML = `
      <div class="panel-header" style="margin-bottom:0.75rem">
        <span class="panel-title">Economy Summary</span>
      </div>
      <div class="table-container" style="overflow-x:auto">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  function _bindPlaybackControls() {
    const playBtn  = document.getElementById('psim-play-btn');
    const pauseBtn = document.getElementById('psim-pause-btn');
    const resetBtn = document.getElementById('psim-reset-btn');
    if (playBtn)  playBtn.addEventListener('click',  _startPlayback);
    if (pauseBtn) pauseBtn.addEventListener('click',  _pausePlayback);
    if (resetBtn) resetBtn.addEventListener('click',  _resetPlayback);
  }

  function _bindSpeedButtons() {
    document.querySelectorAll('.psim-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.psim-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _speedMs = parseInt(btn.dataset.ms) || 200;
        if (_playInterval) {
          clearInterval(_playInterval);
          _playInterval = setInterval(_tick, _speedMs);
        }
      });
    });
  }

  function _startPlayback() {
    const profiles = SimConfig.getProfiles();
    if (!profiles.length || !_catalogs) return;
    const targetDays = parseInt(document.getElementById('psim-target-days').value) || 100;

    buildChart(profiles.map(p => p.name));
    const finalStates = profiles.map(() => null);
    const allLogs     = profiles.map(() => []);
    const iterators   = profiles.map(p => SimRunner.createStepIterator(_catalogs, p, targetDays));

    const playBtn  = document.getElementById('psim-play-btn');
    const pauseBtn = document.getElementById('psim-pause-btn');
    if (playBtn)  playBtn.disabled  = true;
    if (pauseBtn) pauseBtn.disabled = false;

    _tick = function() {
      let allDone = true;
      try {
        iterators.forEach((iter, i) => {
          if (!iter) return;
          const result = iter.next();
          if (result.done) { iterators[i] = null; return; }
          allDone = false;
          const { dayLog, state } = result.value;
          allLogs[i].push(dayLog);
          finalStates[i] = state;
          _pushDataPoint(i, dayLog.day, dayLog.sceneIndex);
          _updateDayLabel(dayLog.day);
        });
      } catch (err) {
        clearInterval(_playInterval);
        _playInterval = null;
        const el = document.getElementById('psim-day-label');
        if (el) el.textContent = '⚠ Error: ' + err.message;
        console.error('[PlayerSim] tick error:', err);
        if (playBtn) playBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
        return;
      }

      if (allDone) {
        clearInterval(_playInterval);
        _playInterval = null;
        _tick = null;
        if (playBtn)  playBtn.disabled  = false;
        if (pauseBtn) pauseBtn.disabled = true;
        renderStats(profiles, allLogs);
        renderEconomy(profiles, finalStates);
      }
    };

    _playInterval = setInterval(_tick, _speedMs);
  }

  function _pausePlayback() {
    if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
    const playBtn  = document.getElementById('psim-play-btn');
    const pauseBtn = document.getElementById('psim-pause-btn');
    if (playBtn)  playBtn.disabled  = false;
    if (pauseBtn) pauseBtn.disabled = true;
  }

  function _resetPlayback() {
    _pausePlayback();
    _tick = null;
    if (_chart) { _chart.data.datasets.forEach(d => { d.data = []; }); _chart.update('none'); }
    _updateDayLabel(0);
    const statsEl   = document.getElementById('psim-stats');
    const economyEl = document.getElementById('psim-economy');
    const legendEl  = document.getElementById('psim-legend');
    if (statsEl)   statsEl.innerHTML   = '';
    if (economyEl) economyEl.innerHTML = '';
    if (legendEl)  legendEl.innerHTML  = '';
    const playBtn = document.getElementById('psim-play-btn');
    if (playBtn) playBtn.disabled = false;
  }

  return { init, buildChart, renderStats, renderEconomy };
})();

// ── Entry point wired into app.js ──────────────────────────────────────────
const PlayerSim = (() => {
  function init() {
    const catalogs = SimDataLoader.build(window.GameData);
    SimConfig.render(catalogs.iapCatalog);
    SimChart.init(catalogs);
  }
  return { init };
})();
