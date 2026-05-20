// js/sim/simChart.js
const MERGE_ITEM_TYPES = {
  1001:'Drink Generator',       1002:'Fruit & Sugar Generator', 1003:'Protein Generator',
  1004:'Vegetable Generator',   1005:'Seafood Generator',       1006:'Grain Generator',
  1007:'Alcohol Generator',
  2001:'Juicer',                2002:'Chef Counter',            2003:'Grill',
  2004:'Pan',                   2005:'Oven',
  3001:'Gold',                  3002:'Energy',                  3003:'Diamond',
  4001:'Jam & Yogurt Mix',      4002:'Smoothie & Juice',        4003:'Coffee Drinks',
  4004:'Mixed Grill',           4005:'Stir Fried Dish',         4006:'Salad',
  4007:'Desserts',              4008:'Oven Baked Dishes',
  5001:'Card Plus',             5002:'Sandglass',               5003:'Scissors',
  5004:'Unlimited Energy (Std)',5005:'Unlimited Energy (Upg)',  5006:'Duplicate Camera',
  5007:'Magic Wand',            5008:'Rocket Cracker',          5009:'Animal Timer',
  5010:'Wild Card',             5011:'Speed Boost',
  6001:'Energy Chest',          6002:'Chef Chest',              6003:'Equipment Chest',
  6004:'Assistants Chest',      6005:'Daily Gift',              6006:'Lucky Handbag',
  6007:'Lucky Box',             6008:'Gift',                    6009:'Equipment Box',
  6011:'Coin Box',              6012:'Choice Chest',            6013:'Flush Gift',
  6014:'Trainee Box',
  7001:'Coffee',                7002:'Soft Drinks',             7003:'Dairy Products',
  7004:'Glassware',             7005:'Fruit',                   7006:'Sugar & Candy',
  7007:'Coconut Water Products',7008:'Coconut Shell Products',  7009:'Red Meat',
  7010:'Egg & Poultry',         7011:'Vegetables',              7012:'Leafy Vegetables',
  7013:'Seafood',               7014:'Shellfish'
};

const SimChart = (() => {
  const BOARD_CAPACITY = 63;

  let _chart = null;
  let _catalogs = null;
  let _tick = null;
  let _playInterval = null;
  let _speedMs = 200;

  // Per-profile day-by-day snapshots + event logs
  let _snapshots  = [];
  let _eventLogs  = [];
  let _profileNames = [];
  let _activeProfileIdx = 0;
  let _viewIdx = 0;
  let _scrubbing = false;
  // Active log filter types (all on by default)
  const ALL_LOG_TYPES = ['gold_earn','gold_spend','board_full','gem_receive','gem_spend','gen_receive','tool','energy_reward','energy_spend','level_up','cook'];
  let _logFilter = new Set(ALL_LOG_TYPES);

  function init(catalogs) {
    _catalogs = catalogs;
    _bindMainTabs();
    _bindPlaybackControls();
    _bindSpeedButtons();
    _bindScrubber();
    _bindChartSlider();
    _bindLogModal();
  }

  function _bindMainTabs() {
    const nav = document.querySelector('.psim-main-tabs-nav');
    if (!nav) return;
    nav.addEventListener('click', e => {
      const btn = e.target.closest('.psim-main-tab');
      if (!btn) return;
      const panelId = btn.dataset.panel;
      nav.querySelectorAll('.psim-main-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.psim-main-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
    });
  }

  function _colors() {
    return (typeof SimConfig !== 'undefined' && SimConfig.getColors)
      ? SimConfig.getColors()
      : ['#38bdf8', '#f87171', '#a78bfa', '#34d399'];
  }

  // ── Chart ───────────────────────────────────────────────────────────────
  function buildChart(profileNames) {
    const ctx = document.getElementById('psim-chart');
    if (!ctx) return;
    if (_chart) _chart.destroy();
    const colors = _colors();

    _chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: profileNames.map((name, i) => ({
          label: name,
          data: [],
          borderColor:     colors[i % colors.length],
          backgroundColor: colors[i % colors.length] + '22',
          borderWidth: 2.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3
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
            title: { display: true, text: 'Orders Completed', color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            min: 0,
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => `Day ${items[0].parsed.x}`,
              label: item => `${item.dataset.label}: ${item.parsed.y} orders`
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

  // ── Comparison tables ───────────────────────────────────────────────────
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
      <div class="psim-section-header"><span>Scene Milestones</span></div>
      <div class="table-container psim-table-wrap">
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
      <div class="psim-section-header"><span>Economy Summary</span></div>
      <div class="table-container psim-table-wrap">
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Snapshot capture ────────────────────────────────────────────────────
  function _takeSnapshot(state, day) {
    const scenes = (_catalogs && _catalogs.sceneCatalog) || [];
    const idx = Math.max(0, Math.min(state.progress.sceneIndex, scenes.length - 1));
    const scene = scenes[idx];
    const b = state.board || {};
    const eco = state.economy || {};

    return {
      day,
      level: state.progress.level || 0,
      sceneIndex: state.progress.sceneIndex,
      sceneName: scene ? scene.name.replace('Scene_', 'Scene ') : `Scene ${idx}`,
      buildStepsDone: state.progress.buildStepsDone || 0,
      totalBuildSteps: scene ? scene.buildSteps.length : 0,
      goldBank: state.progress.goldBank || 0,
      goldReceived:    (eco.gold   || {}).received || 0,
      goldSpent:       (eco.gold   || {}).spent    || 0,
      ordersCompleted: state.progress.completedOrderIds ? state.progress.completedOrderIds.size : 0,
      gemsHeld:        state.gems || 0,
      gemsReceived:    (eco.gems   || {}).received || 0,
      gemsSpent:       (eco.gems   || {}).spent    || 0,
      energyReceived:  (eco.energy || {}).received || 0,
      energySpent:     (eco.energy || {}).spent    || 0,
      stats: state.stats ? {
        generated: Object.assign({}, state.stats.generated),
        cooked:    Object.assign({}, state.stats.cooked),
        merged:    Object.assign({}, state.stats.merged)
      } : null,
      boardItems:        Object.assign({}, (state.board || {}).boardItems || {}),
      inventoryItems:    Object.assign({}, (state.board || {}).inventoryItems || {}),
      completedOrderIds: state.progress.completedOrderIds ? [...state.progress.completedOrderIds] : [],
      sceneIndex:        state.progress.sceneIndex,
      board: {
        generators: (b.generators || []).map(g => ({ genId: g.genId, pool: g.pool })),
        tools: (b.tools || []).map(t => ({
          toolType: t.toolType,
          itemId: t.itemId || null,
          cookingId: t.cooking ? t.cooking.resultId : null
        })),
        boardItems: Object.assign({}, b.boardItems || {}),
        inventoryItems: Object.assign({}, b.inventoryItems || {}),
        boardItemCount: b.boardItemCount || 0,
        inventoryCount: b.inventoryCount || 0,
        inventoryCapacity: b.inventoryCapacity || 15
      }
    };
  }

  // ── Profile tabs ────────────────────────────────────────────────────────
  function _renderTabs(profileNames) {
    const el = document.getElementById('psim-profile-tabs');
    if (!el) return;
    const colors = _colors();
    el.innerHTML = profileNames.map((name, i) => `
      <button class="psim-tab ${i === _activeProfileIdx ? 'active' : ''}" data-idx="${i}">
        <span class="psim-tab-dot" style="background:${colors[i % colors.length]}"></span>
        <span class="psim-tab-name">${name}</span>
      </button>
    `).join('');
    el.querySelectorAll('.psim-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeProfileIdx = parseInt(btn.dataset.idx) || 0;
        el.querySelectorAll('.psim-tab').forEach(b => b.classList.toggle('active',
          parseInt(b.dataset.idx) === _activeProfileIdx));
        // Switching profile: jump scrubber to latest of new profile
        const snaps = _snapshots[_activeProfileIdx] || [];
        _viewIdx = Math.max(0, snaps.length - 1);
        _renderActiveProfile();
      });
    });
  }

  // ── KPI strip + board + scrubber render ─────────────────────────────────
  const EVENT_META = {
    gold_earn:     { icon: '💰', label: 'Gold Earn',  cls: 'psim-log-gold_earn' },
    gold_spend:    { icon: '🔨', label: 'Build Step', cls: 'psim-log-gold_spend' },
    board_full:    { icon: '📦', label: 'Board Full', cls: 'psim-log-board_full' },
    gem_receive:   { icon: '💎', label: 'Gem Earn',   cls: 'psim-log-gem_receive' },
    gem_spend:     { icon: '💸', label: 'Gem Spend',  cls: 'psim-log-gem_spend' },
    gen_receive:   { icon: '⚙️', label: 'Generator',  cls: 'psim-log-gen_receive' },
    tool:          { icon: '🔧', label: 'Tool',       cls: 'psim-log-tool' },
    energy_reward: { icon: '⚡', label: 'Energy +',    cls: 'psim-log-energy_reward' },
    energy_spend:  { icon: '⚡', label: 'Energy −',    cls: 'psim-log-energy_spend' },
    level_up:      { icon: '⭐', label: 'Level Up',   cls: 'psim-log-level_up' },
    cook:          { icon: '🍳', label: 'Cooking',    cls: 'psim-log-cook' }
  };

  function _renderKPIs(snap) {
    const el = document.getElementById('psim-kpis');
    if (!el) return;
    if (!snap) {
      el.innerHTML = '<div class="psim-kpi-empty">Run simulation to populate.</div>';
      return;
    }
    const used = snap.board.generators.length + snap.board.tools.length + snap.board.boardItemCount;
    const ignoreCapacity = _activeProfileIgnoresCapacity();

    // Find the last scene_debug event for this profile up to the current view day
    const lastStallEvent = (_eventLogs[_activeProfileIdx] || [])
      .filter(e => e.type === 'scene_debug' && e.day <= snap.day)
      .slice(-1)[0] || null;
    const stallHtml = lastStallEvent
      ? `<div class="psim-scene-progress">Build ${lastStallEvent.buildStepsDone}/${lastStallEvent.totalBuildSteps} steps · Batches ${lastStallEvent.batchesDoneCount}/${lastStallEvent.totalBatches} done</div>`
      : '';

    const primary = [
      { k: 'Day',       v: snap.day,                              cls: 'kpi-day' },
      { k: 'Level',     v: `Lv${snap.level}`,                    cls: 'kpi-level' },
      { k: snap.sceneName, v: `${snap.buildStepsDone}/${snap.totalBuildSteps}${stallHtml}`, cls: 'kpi-scene' },
      ignoreCapacity ? null : { k: 'Board',     v: `${used}/${BOARD_CAPACITY}`,           cls: 'kpi-board' },
      ignoreCapacity ? null : { k: 'Inventory', v: `${snap.board.inventoryCount}/${snap.board.inventoryCapacity}`, cls: 'kpi-inv' }
    ].filter(Boolean);

    // Build generator summary: group by type → list levels
    const cat = (_catalogs && _catalogs.generatorCatalog) || {};
    const genGroups = {};
    (snap.board.generators || []).forEach(g => {
      const def = cat[g.genId] || {};
      const type = def.type || g.genId;
      const lv = `Lv${def.gameTier || def.level || '?'}`;
      if (!genGroups[type]) genGroups[type] = {};
      genGroups[type][lv] = (genGroups[type][lv] || 0) + 1;
    });
    // Also include low-level generator items (tier 1-3) from boardItems / inventoryItems
    const genItemIds = _catalogs && _catalogs.generatorItemIds;
    const itemTierMap = (_catalogs && _catalogs.itemTierMap) || {};
    if (genItemIds) {
      const allBoardItems = { ...snap.board.boardItems };
      Object.entries(snap.board.inventoryItems || {}).forEach(([id, n]) => {
        allBoardItems[id] = (allBoardItems[id] || 0) + n;
      });
      Object.entries(allBoardItems).forEach(([itemId, count]) => {
        if (!count || !genItemIds.has(itemId)) return;
        const tierInfo = itemTierMap[itemId];
        if (!tierInfo) return;
        // Find type name from catalog (any catalog entry with same family prefix)
        const catalogEntry = Object.values(cat).find(g => g.id.startsWith(tierInfo.family));
        const type = catalogEntry ? catalogEntry.type : itemId;
        const lv = `Lv${tierInfo.tier}`;
        if (!genGroups[type]) genGroups[type] = {};
        genGroups[type][lv] = (genGroups[type][lv] || 0) + count;
      });
    }

    const genLines = Object.entries(genGroups).map(([type, lvs]) =>
      `${type}: ${Object.entries(lvs).sort((a,b) => parseInt(a[0].slice(2)) - parseInt(b[0].slice(2))).map(([lv, n]) => n > 1 ? `${lv}×${n}` : lv).join(', ')}`
    );

    const toolCat      = (_catalogs && _catalogs.toolCatalog)  || {};
    const itemTierMap2 = (_catalogs && _catalogs.itemTierMap)  || {};
    // Group tools by type, preserving the level from the first slot of that type
    const toolGroups = {};
    (snap.board.tools || []).forEach(t => {
      if (!toolGroups[t.toolType]) {
        const tier = t.itemId && itemTierMap2[t.itemId] ? itemTierMap2[t.itemId].tier : null;
        toolGroups[t.toolType] = { count: 0, tier };
      }
      toolGroups[t.toolType].count++;
    });
    const toolLines = Object.entries(toolGroups).map(([type, { count, tier }]) => {
      const name  = (toolCat[type] && toolCat[type].name) || type;
      const lvTag = tier ? ` Lv${tier}` : '';
      return count > 1 ? `${name}${lvTag} ×${count}` : `${name}${lvTag}`;
    });

    const bullets = [
      { icon: '💰', label: 'Gold',       rows: [`Current: ${snap.goldBank.toLocaleString()}`, `Earned: +${snap.goldReceived.toLocaleString()}`, `Spent: −${snap.goldSpent.toLocaleString()}`] },
      { icon: '⚡', label: 'Energy',     rows: [`Earned: +${snap.energyReceived.toLocaleString()}`, `Spent: −${snap.energySpent.toLocaleString()}`] },
      { icon: '💎', label: 'Gems',       rows: [`Current: ${snap.gemsHeld}`, `Earned: +${snap.gemsReceived}`, `Spent: −${snap.gemsSpent}`] },
      { icon: '📋', label: 'Orders',     rows: [`Completed: ${snap.ordersCompleted}`] },
      genLines.length  ? { icon: '⚙️', label: 'Generators', rows: genLines,  multiRow: true } : null,
      toolLines.length ? { icon: '🔧', label: 'Tools',      rows: toolLines, multiRow: true } : null
    ].filter(Boolean);

    const kpiCard = it => `<div class="psim-kpi ${it.cls}"><div class="psim-kpi-key">${it.k}</div><div class="psim-kpi-val">${it.v}</div></div>`;
    const bulletRow = b => {
      let valsHtml;
      if (b.multiRow) {
        valsHtml = `<div class="psim-detail-val-list">${b.rows.map(r => `<div>${r}</div>`).join('')}</div>`;
      } else {
        const styledRows = b.rows.map(r => {
          if (/^Earned/.test(r)) return `<span class="psim-val-earn">${r}</span>`;
          if (/^Spent/.test(r))  return `<span class="psim-val-spent">${r}</span>`;
          return r;
        });
        valsHtml = `<span class="psim-detail-vals">${styledRows.join(' · ')}</span>`;
      }
      return `<div class="psim-detail-bullet${b.multiRow ? ' psim-detail-multirow' : ''}">
        <span class="psim-detail-icon">${b.icon}</span>
        <span class="psim-detail-label">${b.label}</span>
        ${valsHtml}
      </div>`;
    };

    const wasExpanded = el.classList.contains('details-open');
    el.innerHTML = `
      <div class="psim-kpi-primary">
        ${primary.map(kpiCard).join('')}
        <button class="psim-kpi-toggle">${wasExpanded ? '▲ Less' : '▼ Details'}</button>
      </div>
      <div class="psim-kpi-secondary ${wasExpanded ? 'open' : ''}">
        ${bullets.map(bulletRow).join('')}
      </div>`;
    if (wasExpanded) el.classList.add('details-open');

    el.querySelector('.psim-kpi-toggle').addEventListener('click', () => {
      const open = el.classList.toggle('details-open');
      el.querySelector('.psim-kpi-secondary').classList.toggle('open', open);
      el.querySelector('.psim-kpi-toggle').textContent = open ? '▲ Less' : '▼ Details';
    });
  }

  function _renderFilterBar(barId, includeModal) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    bar.innerHTML = Object.entries(EVENT_META).map(([type, m]) =>
      `<button class="psim-log-filter-chip ${_logFilter.has(type) ? 'on' : ''}" data-type="${type}">${m.icon} ${m.label}</button>`
    ).join('');
    bar.querySelectorAll('.psim-log-filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.type;
        if (_logFilter.has(t)) _logFilter.delete(t); else _logFilter.add(t);
        const snap = (_snapshots[_activeProfileIdx] || [])[_viewIdx];
        const day = snap ? snap.day : 0;
        _renderLogFilters();   // sync both bars
        _renderEventLog(_activeProfileIdx, day);
        _renderEventLogModal(_activeProfileIdx, day);
      });
    });
  }

  function _renderLogFilters() {
    _renderFilterBar('psim-log-filter-bar');
    _renderFilterBar('psim-log-modal-filter-bar');
  }

  function _logTableHtml(log) {
    if (!log.length) return '<div class="psim-gemlog-empty">No matching events up to this day.</div>';
    return `<table class="psim-gemlog-table">
      <thead><tr><th>Day</th><th>Scene</th><th>Event</th><th>Detail</th></tr></thead>
      <tbody>${log.map(e => {
        const m = EVENT_META[e.type] || { icon: '•', cls: '' };
        const amtCls = (e.amount || 0) >= 0 ? 'psim-log-pos' : 'psim-log-neg';
        const amtTxt = (e.amount || 0) >= 0 ? `+${e.amount}` : `${e.amount}`;
        return `<tr class="${m.cls}">
          <td>Day ${e.day}</td>
          <td>${(e.scene || '').replace('Scene_0', 'S').replace('Scene_', 'S')}</td>
          <td>${m.icon} <span class="${amtCls}">${amtTxt}</span></td>
          <td>${e.detail || ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  function _renderEventLog(profileIdx, upToDay) {
    const el = document.getElementById('psim-gem-log');
    if (!el) return;
    const log = (_eventLogs[profileIdx] || []).filter(e => e.day <= upToDay && _logFilter.has(e.type));
    el.innerHTML = _logTableHtml(log);
  }

  function _renderEventLogModal(profileIdx, upToDay) {
    const modal = document.getElementById('psim-log-modal');
    if (!modal || modal.style.display === 'none') return;
    const el = document.getElementById('psim-gem-log-modal');
    if (!el) return;
    const log = (_eventLogs[profileIdx] || []).filter(e => e.day <= upToDay && _logFilter.has(e.type));
    el.innerHTML = _logTableHtml(log);
  }

  function _buildBoardCells(snap) {
    if (!snap) return [];
    const cat = (_catalogs && _catalogs.generatorCatalog) || {};
    const cells = [];

    // Generators
    const gens = (snap.board.generators || []).map(g => {
      const def = cat[g.genId] || {};
      return { genId: g.genId, type: def.type || g.genId, level: def.gameTier || def.level || 0, pool: g.pool, maxPool: def.maxPool || 0 };
    }).sort((a, b) => (a.type || '').localeCompare(b.type || '') || a.level - b.level);
    gens.forEach(g => cells.push({
      kind: 'gen', type: g.type, level: g.level, pool: g.pool, maxPool: g.maxPool,
      title: `${g.genId} · ${g.type} Lv${g.level} · pool ${g.pool}/${g.maxPool}`
    }));

    // Tools
    const toolCat2      = ((_catalogs && _catalogs.toolCatalog) || {});
    const itemTierMap3  = ((_catalogs && _catalogs.itemTierMap)  || {});
    const tools = (snap.board.tools || []).slice().sort((a, b) => (a.toolType || '').localeCompare(b.toolType || ''));
    tools.forEach(t => {
      const toolName = (toolCat2[t.toolType] && toolCat2[t.toolType].name) || t.toolType;
      const tier     = t.itemId && itemTierMap3[t.itemId] ? itemTierMap3[t.itemId].tier : null;
      cells.push({
        kind: 'tool', toolType: t.toolType, toolName, tier, cooking: !!t.cookingId,
        title: `${toolName}${tier ? ' Lv' + tier : ''}${t.cookingId ? ' · cooking ' + t.cookingId : ''}`
      });
    });

    // Items
    Object.entries(snap.board.boardItems || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .forEach(([id, n]) => cells.push({ kind: 'item', id, count: n, title: `Item ${id} · ${n}` }));

    while (cells.length < BOARD_CAPACITY) cells.push({ kind: 'empty' });
    if (cells.length > BOARD_CAPACITY) cells.length = BOARD_CAPACITY;
    return cells;
  }

  function _activeProfileIgnoresCapacity() {
    const profiles = (typeof SimConfig !== 'undefined' && SimConfig.getProfiles) ? SimConfig.getProfiles() : [];
    return !!(profiles[_activeProfileIdx] && profiles[_activeProfileIdx].ignoreCapacity);
  }

  function _renderBoard(snap) {
    const el = document.getElementById('psim-board');
    if (!el) return;
    if (_activeProfileIgnoresCapacity()) {
      el.innerHTML = '';
      return;
    }
    const cells = _buildBoardCells(snap);
    el.innerHTML = cells.map(c => {
      if (c.kind === 'empty') return `<div class="psim-cell psim-cell-empty"></div>`;
      if (c.kind === 'gen') {
        return `<div class="psim-cell psim-cell-gen" title="${c.title}">
          <span class="psim-cell-type">${c.type}</span>
          <span class="psim-cell-level">L${c.level}</span>
          <span class="psim-cell-sub">${c.pool}/${c.maxPool}</span>
        </div>`;
      }
      if (c.kind === 'tool') {
        return `<div class="psim-cell psim-cell-tool ${c.cooking ? 'is-cooking' : ''}" title="${c.title}">
          <span class="psim-cell-type">${c.toolName || c.toolType}</span>
          <span class="psim-cell-level">${c.tier ? 'Lv' + c.tier : ''}</span>
          ${c.cooking ? '<span class="psim-cell-sub">🔥</span>' : ''}
        </div>`;
      }
      // item
      return `<div class="psim-cell psim-cell-item" title="${c.title}">
        <span class="psim-cell-sub">${c.id}</span>
        <span class="psim-cell-count">×${c.count}</span>
      </div>`;
    }).join('');
  }

  function _renderScrubber(snaps) {
    const slider = document.getElementById('psim-scrubber');
    const lblNow = document.getElementById('psim-scrub-now');
    const lblMax = document.getElementById('psim-scrub-max');
    if (!slider) return;
    const n = snaps.length;
    slider.disabled = n <= 1;
    slider.min = 0;
    slider.max = Math.max(0, n - 1);
    slider.value = Math.max(0, Math.min(_viewIdx, n - 1));
    const cur = snaps[_viewIdx];
    if (lblNow) lblNow.textContent = cur ? `Day ${cur.day}` : 'Day 0';
    if (lblMax) lblMax.textContent = n > 0 ? `Day ${snaps[n - 1].day}` : '—';
  }

  function _renderItemStats(profileIdx) {
    const el = document.getElementById('psim-item-stats');
    if (!el || !_catalogs) return;
    const snaps = _snapshots[profileIdx] || [];
    const latest = snaps[snaps.length - 1];
    const stats  = (latest && latest.stats) || null;
    if (!stats) {
      el.innerHTML = '<div class="psim-gemlog-empty">Run simulation to populate.</div>';
      return;
    }

    const itemNames = _catalogs.itemNames || {};
    const cat       = _catalogs.generatorCatalog || {};

    function _nameOf(itemId) { return itemNames[itemId] || itemId; }

    function _statRows(map, sorter) {
      const entries = Object.entries(map).filter(([, n]) => n > 0);
      if (!entries.length) return '<tr><td colspan="2" class="psim-gemlog-empty" style="padding:6px 12px">—</td></tr>';
      return entries.sort(sorter || ((a, b) => b[1] - a[1]))
        .map(([id, n]) => `<tr><td>${_nameOf(id)}</td><td class="psim-log-pos">${n}</td></tr>`)
        .join('');
    }

    function _inventoryGrouped(items) {
      const groups = {};
      Object.entries(items).filter(([, n]) => n > 0).forEach(([id, n]) => {
        const typeId = parseInt(String(id).slice(0, 4));
        const label  = MERGE_ITEM_TYPES[typeId] || `Type ${typeId}`;
        if (!groups[label]) groups[label] = { typeId, rows: [] };
        groups[label].rows.push([id, n]);
      });
      if (!Object.keys(groups).length) return '<div class="psim-gemlog-empty" style="padding:6px 12px">—</div>';
      return Object.entries(groups)
        .sort(([, a], [, b]) => a.typeId - b.typeId)
        .map(([label, { rows }]) => {
          const total = rows.reduce((s, [, n]) => s + n, 0);
          const trs   = rows.sort((a, b) => b[1] - a[1])
            .map(([id, n]) => `<tr><td>${_nameOf(id)}</td><td class="psim-log-pos">${n}</td></tr>`)
            .join('');
          return `<details class="psim-inv-group">
            <summary class="psim-inv-group-header">
              <span class="psim-inv-group-name">${label}</span>
              <span class="psim-inv-group-count">${total}</span>
            </summary>
            <table class="psim-gemlog-table psim-inv-group-table">
              <thead><tr><th>Item</th><th>Count</th></tr></thead>
              <tbody>${trs}</tbody>
            </table>
          </details>`;
        }).join('');
    }

    function _section(title, icon, rows) {
      return `<div class="psim-itemstats-section">
        <div class="psim-gemlog-header" style="padding:6px 12px 4px"><span class="psim-gemlog-title">${icon} ${title}</span></div>
        <table class="psim-gemlog-table"><thead><tr><th>Item</th><th>Count</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
    }

    // ── Current Inventory section ─────────────────────────────────────────
    const boardItems     = latest.boardItems     || {};
    const inventoryItems = latest.inventoryItems || {};
    const allItems = {};
    Object.entries(boardItems).forEach(([id, n])     => { allItems[id] = (allItems[id] || 0) + n; });
    Object.entries(inventoryItems).forEach(([id, n]) => { allItems[id] = (allItems[id] || 0) + n; });

    function _groupedSection(title, icon, map) {
      return `<div class="psim-itemstats-section">
        <div class="psim-gemlog-header" style="padding:6px 12px 4px">
          <span class="psim-gemlog-title">${icon} ${title}</span>
        </div>
        ${_inventoryGrouped(map)}
      </div>`;
    }

    // ── Pending Orders — grouped by batch ────────────────────────────────
    const si           = latest.sceneIndex || 0;
    const currentScene = (_catalogs.sceneCatalog || [])[si];
    const completedSet = new Set(latest.completedOrderIds || []);
    const batchPending = {};

    if (currentScene) {
      currentScene.batchIds.forEach(batchId => {
        const batch = (_catalogs.batchMap || {})[batchId];
        if (!batch) return;
        const bRows = [];
        batch.orderIds.forEach(orderId => {
          if (completedSet.has(String(orderId))) return;
          const detail = (_catalogs.orderDetailMap || {})[orderId];
          if (!detail) return;
          detail.items.forEach(({ itemId, qty }) => {
            const have = allItems[itemId] || 0;
            const name = (_catalogs.itemNames || {})[itemId] || itemId;
            const ok   = have >= qty;
            bRows.push(`<tr>
              <td class="psim-mono">${orderId}</td><td>${name}</td>
              <td class="psim-mono">${qty}</td><td class="psim-mono">${have}</td>
              <td class="${ok ? 'psim-stat-ok' : 'psim-stat-gap'}">${ok ? '✓' : `✗ -${qty - have}`}</td>
            </tr>`);
          });
        });
        if (bRows.length) batchPending[batchId] = bRows;
      });
    }

    const pendingHtml = Object.keys(batchPending).length
      ? Object.entries(batchPending).map(([batchId, bRows]) =>
          `<details class="psim-inv-group">
            <summary class="psim-inv-group-header">
              <span class="psim-inv-group-name">Batch ${batchId}</span>
              <span class="psim-inv-group-count">${bRows.length}</span>
            </summary>
            <table class="psim-gemlog-table psim-pending-table psim-inv-group-table">
              <thead><tr><th>Order</th><th>Item</th><th>Need</th><th>Have</th><th>Status</th></tr></thead>
              <tbody>${bRows.join('')}</tbody>
            </table>
          </details>`
        ).join('')
      : `<div class="psim-no-purchases">All orders in current scene complete ✓</div>`;

    const pendingSection =
      `<div class="psim-itemstats-section">
         <div class="psim-gemlog-header" style="padding:6px 12px 4px">
           <span class="psim-gemlog-title">📋 Pending Orders</span>
         </div>
         ${pendingHtml}
       </div>`;

    el.innerHTML =
      _groupedSection('Generated by Generators', '⚙️', stats.generated) +
      _groupedSection('Merged Items',             '🔀', stats.merged) +
      _section('Cooked by Tools',                 '🍳', _statRows(stats.cooked)) +
      _groupedSection('Current Inventory',        '🎒', allItems) +
      pendingSection;
  }

  function _renderOrderSummary(profileIdx, upToDay) {
    const el = document.getElementById('psim-order-summary');
    if (!el || !_catalogs) return;
    const orderDetailMap = _catalogs.orderDetailMap || {};
    const itemNames      = _catalogs.itemNames      || {};
    const batchMap       = _catalogs.batchMap       || {};

    // Keep natural event log order (simulation order = batch/order completion order)
    const events = (_eventLogs[profileIdx] || [])
      .filter(e => e.type === 'gold_earn' && e.orderId && e.day <= upToDay);

    if (!events.length) {
      el.innerHTML = '<div class="psim-gemlog-empty">No completed orders up to this day.</div>';
      return;
    }

    const rows = events.map(e => {
      const detail  = orderDetailMap[e.orderId] || {};
      const items   = (detail.items || []).map(({ itemId, qty }) => {
        const name = itemNames[itemId] || itemId;
        return qty > 1 ? `${name} ×${qty}` : name;
      }).join('<br>');
      const scene   = (e.scene || '').replace('Scene_0', 'S').replace('Scene_', 'S');
      // Derive batch from batchMap
      const batchEntry = Object.values(batchMap).find(b => b.orderIds && b.orderIds.includes(String(e.orderId)));
      const batch  = batchEntry ? `Batch ${batchEntry.id}` : '—';
      return `<tr>
        <td>Day ${e.day}</td>
        <td>${scene}</td>
        <td>${batch}</td>
        <td>${e.orderId}</td>
        <td class="psim-ordsum-items">${items || '—'}</td>
        <td class="psim-log-pos">+${e.amount || 0}g</td>
      </tr>`;
    }).join('');

    el.innerHTML = `<table class="psim-gemlog-table">
      <thead><tr><th>Day</th><th>Scene</th><th>Batch</th><th>Order</th><th>Items Required</th><th>Gold</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function _renderActiveProfile() {
    const snaps = _snapshots[_activeProfileIdx] || [];
    if (_viewIdx > snaps.length - 1) _viewIdx = Math.max(0, snaps.length - 1);
    const snap = snaps[_viewIdx] || null;
    _renderKPIs(snap);
    _renderBoard(snap);
    _renderScrubber(snaps);
    const day = snap ? snap.day : 0;
    _renderEventLog(_activeProfileIdx, day);
    _renderEventLogModal(_activeProfileIdx, day);
    _renderOrderSummary(_activeProfileIdx, day);
    _renderItemStats(_activeProfileIdx);
  }

  function _bindScrubber() {
    const slider = document.getElementById('psim-scrubber');
    if (!slider) return;
    slider.addEventListener('input', () => {
      _scrubbing = true;
      _viewIdx = parseInt(slider.value) || 0;
      _renderActiveProfile();
    });
    slider.addEventListener('change', () => { _scrubbing = false; });
  }

  function _resetProfileView() {
    _snapshots  = [];
    _eventLogs  = [];
    _profileNames = [];
    _activeProfileIdx = 0;
    _logFilter  = new Set(ALL_LOG_TYPES);
    _viewIdx = 0;
    _scrubbing = false;
    const filterBar = document.getElementById('psim-log-filter-bar');
    if (filterBar) filterBar.innerHTML = '';
    const tabs = document.getElementById('psim-profile-tabs');
    const kpis = document.getElementById('psim-kpis');
    const board = document.getElementById('psim-board');
    const slider = document.getElementById('psim-scrubber');
    const lblNow = document.getElementById('psim-scrub-now');
    const lblMax = document.getElementById('psim-scrub-max');
    const ordsum   = document.getElementById('psim-order-summary');
    const itemstats = document.getElementById('psim-item-stats');
    if (tabs)   tabs.innerHTML   = '';
    if (kpis)   kpis.innerHTML   = '<div class="psim-kpi-empty">Run simulation to populate.</div>';
    if (board)  board.innerHTML  = '';
    if (ordsum)    ordsum.innerHTML    = '<div class="psim-gemlog-empty">No completed orders.</div>';
    if (itemstats) itemstats.innerHTML = '<div class="psim-gemlog-empty">Run simulation to populate.</div>';
    if (slider) { slider.value = 0; slider.max = 0; slider.disabled = true; }
    if (lblNow) lblNow.textContent = 'Day 0';
    if (lblMax) lblMax.textContent = '—';
  }

  // ── Playback ────────────────────────────────────────────────────────────
  function _bindChartSlider() {
    const slider = document.getElementById('psim-chart-slider');
    const label  = document.getElementById('psim-chart-slider-label');
    if (!slider) return;
    slider.addEventListener('input', () => {
      const v = parseInt(slider.value) || 0;
      if (label) label.textContent = `Day ${v}`;
      if (_chart) {
        _chart.options.scales.x.max = v;
        _chart.update('none');
      }
    });
  }

  function _updateChartSlider(maxDay) {
    const slider = document.getElementById('psim-chart-slider');
    const label  = document.getElementById('psim-chart-slider-label');
    if (!slider) return;
    slider.disabled = false;
    slider.max   = maxDay;
    slider.value = maxDay;
    if (label) label.textContent = `Day ${maxDay}`;
  }

  function _showOrderSummaryModal(profileIdx = _activeProfileIdx) {
    const existing = document.querySelector('.psim-modal.psim-order-modal');
    if (existing) existing.remove();
    if (!_catalogs) return;

    const orderDetailMap = _catalogs.orderDetailMap || {};
    const itemNames      = _catalogs.itemNames      || {};
    const batchMap       = _catalogs.batchMap       || {};
    const sceneCatalog   = _catalogs.sceneCatalog   || [];

    // Index completed orders by orderId
    const doneMap = {};
    (_eventLogs[profileIdx] || []).filter(e => e.type === 'gold_earn' && e.orderId)
      .forEach(e => { doneMap[String(e.orderId)] = e; });

    // Current inventory from last snapshot (board + inventory merged)
    const snaps  = _snapshots[profileIdx] || [];
    const latest = snaps[snaps.length - 1];
    const allItems = {};
    if (latest) {
      Object.entries(latest.boardItems     || {}).forEach(([id, n]) => { allItems[id] = (allItems[id] || 0) + n; });
      Object.entries(latest.inventoryItems || {}).forEach(([id, n]) => { allItems[id] = (allItems[id] || 0) + n; });
    }

    const rows = [];
    let orderCount = 0;
    sceneCatalog.forEach(scene => {
      const sLabel = scene.name.replace('Scene_0', 'S').replace('Scene_', 'S');
      (scene.batchIds || []).forEach(batchId => {
        const batch = batchMap[batchId];
        if (!batch) return;
        (batch.orderIds || []).forEach(orderId => {
          orderCount++;
          const ev     = doneMap[String(orderId)];
          const detail = orderDetailMap[String(orderId)];
          const items  = detail?.items || [];
          // rowspan attr string — only set when order has multiple items
          const rs     = items.length > 1 ? ` rowspan="${items.length}"` : '';

          if (ev) {
            const evScene = (ev.scene || '').replace('Scene_0', 'S').replace('Scene_', 'S');
            if (!items.length) {
              rows.push(`<tr>
                <td>Day ${ev.day}</td><td>${evScene}</td><td>Batch ${batchId}</td>
                <td>${orderId}</td><td>—</td>
                <td class="psim-log-pos">+${ev.amount || 0}g</td>
                <td class="psim-stat-ok psim-ordsum-status">✓</td>
              </tr>`);
            } else {
              items.forEach(({ itemId, qty }, i) => {
                const name = (itemNames[itemId] || itemId) + (qty > 1 ? ` ×${qty}` : '');
                if (i === 0) {
                  rows.push(`<tr>
                    <td${rs}>Day ${ev.day}</td><td${rs}>${evScene}</td><td${rs}>Batch ${batchId}</td>
                    <td${rs}>${orderId}</td><td>${name}</td>
                    <td class="psim-log-pos"${rs}>+${ev.amount || 0}g</td>
                    <td class="psim-stat-ok psim-ordsum-status"${rs}>✓</td>
                  </tr>`);
                } else {
                  rows.push(`<tr class="psim-ord-cont"><td>${name}</td></tr>`);
                }
              });
            }
          } else {
            if (!items.length) {
              rows.push(`<tr class="psim-ord-pending-row">
                <td class="psim-muted">—</td><td>${sLabel}</td><td>Batch ${batchId}</td>
                <td>${orderId}</td><td>—</td><td>—</td>
                <td class="psim-stat-gap psim-ordsum-status">⏳</td>
              </tr>`);
            } else {
              items.forEach(({ itemId, qty }, i) => {
                const name = (itemNames[itemId] || itemId) + (qty > 1 ? ` ×${qty}` : '');
                const have = allItems[itemId] || 0;
                const cls  = have >= qty ? 'psim-stat-ok' : 'psim-stat-gap';
                const haveCell = `<td class="psim-ordsum-have"><span class="${cls}">${have}/${qty}</span></td>`;
                if (i === 0) {
                  rows.push(`<tr class="psim-ord-pending-row">
                    <td class="psim-muted"${rs}>—</td><td${rs}>${sLabel}</td><td${rs}>Batch ${batchId}</td>
                    <td${rs}>${orderId}</td><td>${name}</td>${haveCell}
                    <td class="psim-stat-gap psim-ordsum-status"${rs}>⏳</td>
                  </tr>`);
                } else {
                  rows.push(`<tr class="psim-ord-pending-row psim-ord-cont"><td>${name}</td>${haveCell}</tr>`);
                }
              });
            }
          }
        });
      });
    });

    const doneCount  = Object.keys(doneMap).length;
    const totalCount = orderCount;
    const bodyHtml = rows.length
      ? `<table class="psim-gemlog-table psim-ordsum-modal-table">
           <thead><tr><th>Day</th><th>Scene</th><th>Batch</th><th>Order</th><th>Items Required</th><th>Have/Need</th><th></th></tr></thead>
           <tbody>${rows.join('')}</tbody>
         </table>`
      : '<div class="psim-gemlog-empty">No orders found in catalog.</div>';

    const profileName = _profileNames[profileIdx] || `Profile ${profileIdx}`;
    const modal = document.createElement('div');
    modal.className = 'psim-modal psim-order-modal';
    modal.innerHTML = `
      <div class="psim-modal-backdrop"></div>
      <div class="psim-modal-box">
        <div class="psim-modal-header">
          <span class="psim-modal-title">📦 Order Summary — ${profileName}
            <span class="psim-ordsum-count">${doneCount} / ${totalCount} completed</span>
          </span>
          <button class="psim-modal-close">✕</button>
        </div>
        <div class="psim-modal-body psim-gem-log" style="overflow-y:auto;padding:0.75rem 1rem;">
          ${bodyHtml}
        </div>
      </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.psim-modal-close').addEventListener('click', close);
    modal.querySelector('.psim-modal-backdrop').addEventListener('click', close);
  }

  function _bindLogModal() {
    const openBtn  = document.getElementById('psim-log-expand-btn');
    const modal    = document.getElementById('psim-log-modal');
    const closeBtn = document.getElementById('psim-log-modal-close');
    const backdrop = modal && modal.querySelector('.psim-modal-backdrop');
    if (!openBtn || !modal) return;

    openBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
      const snap = (_snapshots[_activeProfileIdx] || [])[_viewIdx];
      const day = snap ? snap.day : 0;
      _renderFilterBar('psim-log-modal-filter-bar');
      _renderEventLogModal(_activeProfileIdx, day);
    });
    const close = () => { modal.style.display = 'none'; };
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  function _renderChartToggles(profileNames) {
    const el = document.getElementById('psim-chart-toggles');
    if (!el) return;
    const colors = _colors();
    el.innerHTML = profileNames.map((name, i) => `
      <label class="psim-toggle-chip on" data-idx="${i}">
        <input type="checkbox" checked>
        <span class="psim-toggle-chip-dot" style="background:${colors[i % colors.length]}"></span>
        <span>${name}</span>
      </label>
    `).join('');
    el.querySelectorAll('.psim-toggle-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = parseInt(chip.dataset.idx);
        const isOn = chip.classList.toggle('on');
        if (_chart && _chart.data.datasets[idx] !== undefined) {
          _chart.data.datasets[idx].hidden = !isOn;
          _chart.update('none');
        }
      });
    });
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

    const names = profiles.map(p => p.name);
    buildChart(names);
    _profileNames     = names;
    _snapshots        = profiles.map(() => []);
    _eventLogs        = profiles.map(() => []);
    _activeProfileIdx = Math.min(Math.max(0, _activeProfileIdx), names.length - 1);
    _viewIdx          = 0;
    _renderTabs(names);
    _renderChartToggles(names);
    _renderLogFilters();
    _renderActiveProfile();

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
          const snap = _takeSnapshot(state, dayLog.day);
          _snapshots[i].push(snap);
          _eventLogs[i] = state.eventLog || [];
          _pushDataPoint(i, dayLog.day, snap.ordersCompleted);
          _updateDayLabel(dayLog.day);
          _updateChartSlider(dayLog.day);
          if (i === _activeProfileIdx && !_scrubbing) {
            _viewIdx = _snapshots[i].length - 1;
            _renderActiveProfile();
          }
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
    const togglesEl = document.getElementById('psim-chart-toggles');
    if (togglesEl) togglesEl.innerHTML = '';
    const chartSlider = document.getElementById('psim-chart-slider');
    const chartLabel  = document.getElementById('psim-chart-slider-label');
    if (chartSlider) { chartSlider.value = 100; chartSlider.disabled = true; }
    if (chartLabel)  chartLabel.textContent = 'Day 100';
    _resetProfileView();
    const playBtn = document.getElementById('psim-play-btn');
    if (playBtn) playBtn.disabled = false;
  }

  return { init, buildChart, renderStats, renderEconomy, showOrderSummaryModal: _showOrderSummaryModal };
})();

// ── Entry point wired into app.js ──────────────────────────────────────────
const PlayerSim = (() => {
  function init() {
    const catalogs = SimDataLoader.build(window.GameData);
    SimConfig.render(catalogs.iapCatalog);
    SimChart.init(catalogs);
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-expand="order-summary"]');
      if (!btn) return;
      // Use _activeProfileIdx (exposed via showOrderSummaryModal default) — btn.dataset.profile
      // is always "0" (static HTML attribute) so we never read it here.
      SimChart.showOrderSummaryModal();
    });
  }
  return { init };
})();
