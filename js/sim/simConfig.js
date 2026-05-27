// js/sim/simConfig.js
const SimConfig = (() => {
  const PROFILE_COLORS = ['#38bdf8', '#f87171', '#a78bfa', '#34d399'];
  const STORAGE_KEY = 'psim_config_v1';

  const GEM_DEFAULTS = { gemEnergyBuysPerDay: 5, gemGenResetsPerDay: 5, gemInstantCooksPerDay: 3 };

  const DEFAULT_PROFILES = [
    { name: 'Hardcore',  sessionMode: 'sessionsPerDay', sessionsPerDay: 8,  intervalHours: 3,  playerType: 'f2p', ignoreCapacity: false, enabled: true, ...GEM_DEFAULTS },
    { name: 'Mid-core',  sessionMode: 'interval',       sessionsPerDay: 4,  intervalHours: 6,  playerType: 'f2p', ignoreCapacity: false, enabled: true, ...GEM_DEFAULTS },
    { name: 'Casual',    sessionMode: 'interval',       sessionsPerDay: 2,  intervalHours: 12, playerType: 'f2p', ignoreCapacity: false, enabled: true, ...GEM_DEFAULTS },
  ];

  let _profiles          = DEFAULT_PROFILES.map((p, i) => ({ ...p, purchases: [], color: PROFILE_COLORS[i] }));
  let _globalRegen       = 5; // minutes per 1 energy (UI unit); regenPerMin = 1/_globalRegen
  let _globalCap         = 100;
  let _globalStartEnergy = 100;
  let _globalStartGems   = 0;
  let _globalNoCooldown    = false; // generators refill instantly after pool empties
  let _globalInstantCook   = false; // cooking completes within the same session
  let _globalDirectEnergy  = false; // skip generator sim — pay energy cost per item directly
  let _iapCatalog  = {};
  let _eventsReady = false;

  // ── Persistence ─────────────────────────────────────────────────────────
  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        profiles: _profiles,
        regen: _globalRegen,
        cap: _globalCap,
        startEnergy:  _globalStartEnergy,
        startGems:    _globalStartGems,
        noCooldown:     _globalNoCooldown,
        instantCook:    _globalInstantCook,
        directEnergy:   _globalDirectEnergy
      }));
    } catch (_) {}
  }

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.profiles && Array.isArray(data.profiles)) {
        _profiles = data.profiles.map((p, i) => ({
          ...GEM_DEFAULTS, ...p,
          purchases: p.purchases || [],
          color: p.color || PROFILE_COLORS[i % PROFILE_COLORS.length],
          ignoreCapacity: p.ignoreCapacity || false
        }));
      }
      if (data.regen        != null) _globalRegen       = data.regen;
      if (data.cap          != null) _globalCap         = data.cap;
      if (data.startEnergy  != null) _globalStartEnergy = data.startEnergy;
      if (data.startGems    != null) _globalStartGems   = data.startGems;
      if (data.noCooldown   != null) _globalNoCooldown   = !!data.noCooldown;
      if (data.instantCook  != null) _globalInstantCook  = !!data.instantCook;
      if (data.directEnergy != null) _globalDirectEnergy = !!data.directEnergy;
    } catch (_) {}
  }

  // ── Option helpers ───────────────────────────────────────────────────────
  function getIAPOptions(iapCatalog) {
    const seen = new Set();
    const opts = [];
    Object.entries(iapCatalog).forEach(([key, packs]) => {
      (packs || []).forEach(p => {
        const value = `${key}::${p.id}`;
        if (!seen.has(value)) {
          seen.add(value);
          opts.push({ value, label: p.name || key });
        }
      });
    });
    return opts;
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function _renderPurchaseRow(purchase, profileIdx, purchaseIdx) {
    const iapOptions = getIAPOptions(_iapCatalog);
    const currentVal = `${purchase.packageKey || ''}::${purchase.packageId || ''}`;
    const selectedOpt = iapOptions.find(o => o.value === currentVal);
    const btnLabel = selectedOpt ? selectedOpt.label : '— Select Package —';

    const optItems = iapOptions.map(o =>
      `<div class="psim-pkg-opt${o.value === currentVal ? ' selected' : ''}" data-value="${o.value}">${o.label}</div>`
    ).join('');

    return `
      <div class="psim-purchase-row" data-profile="${profileIdx}" data-purchase="${purchaseIdx}">
        <span class="psim-purchase-label">Day</span>
        <input type="number" class="psim-cfg-input psim-purchase-day" value="${purchase.day || 1}" min="1" max="365">
        <div class="psim-pkg-dd">
          <button type="button" class="psim-pkg-btn">
            <span class="psim-pkg-btn-label">${btnLabel}</span>
            <span class="psim-pkg-arrow">▾</span>
          </button>
          <div class="psim-pkg-panel">
            <input type="text" class="psim-pkg-search psim-cfg-input" placeholder="Search package…" autocomplete="off">
            <div class="psim-pkg-list">${optItems}</div>
          </div>
        </div>
        <span class="psim-purchase-label">×</span>
        <input type="number" class="psim-cfg-input psim-purchase-qty" value="${purchase.quantity || 1}" min="1" max="99">
        <button type="button" class="psim-remove-purchase psim-btn-danger">Remove</button>
      </div>`;
  }

  function _renderProfileCard(profile, idx) {
    const color = profile.color || PROFILE_COLORS[idx % PROFILE_COLORS.length];
    const rows = profile.purchases.map((p, pi) => _renderPurchaseRow(p, idx, pi)).join('');
    const canRemove = _profiles.length > 1;
    const typeLabel = profile.playerType === 'spender' ? '💎 Spender' : '🆓 F2P';
    return `
      <details class="psim-cfg-card" data-profile="${idx}" style="border-left:3px solid ${color}" open>
        <summary class="psim-cfg-card-summary">
          <span class="psim-cfg-card-dot" style="background:${color}"></span>
          <span class="psim-cfg-card-name">${profile.name || 'Profile'}</span>
          <span class="psim-cfg-card-badge">${typeLabel}</span>
        </summary>

        <div class="psim-cfg-card-body">
          <div class="psim-cfg-compact-row">
            <input type="color" class="psim-profile-color psim-color-picker" value="${color}" title="Profile color">
            <input type="text" class="psim-cfg-input psim-cfg-name psim-profile-name" value="${profile.name}" placeholder="Name">
            <select class="psim-cfg-select psim-profile-type">
              <option value="f2p"     ${profile.playerType === 'f2p'     ? 'selected' : ''}>🆓 F2P</option>
              <option value="spender" ${profile.playerType === 'spender' ? 'selected' : ''}>💎 Spender</option>
            </select>
            <span class="psim-cfg-row-divider"></span>
            <label class="psim-cfg-check psim-has-tip"
                   data-tip="Include this profile when running the simulation.\nUncheck to temporarily disable without deleting.">
              <input type="checkbox" class="psim-profile-enabled" ${profile.enabled ? 'checked' : ''}>
              <span>Enabled</span>
            </label>
            <label class="psim-cfg-check psim-has-tip"
                   data-tip="Ignore board &amp; inventory capacity limits.\nItems are always placed regardless of how full the board is.">
              <input type="checkbox" class="psim-profile-ignore-capacity" ${profile.ignoreCapacity ? 'checked' : ''}>
              <span>Ignore Full</span>
            </label>
            ${canRemove ? `<button type="button" class="psim-remove-profile psim-btn-danger psim-btn-sm" data-profile="${idx}" style="margin-left:auto">✕</button>` : ''}
          </div>

          <div class="psim-cfg-compact-row psim-cfg-session-row">
            <span class="psim-cfg-sublabel psim-has-tip"
                  data-tip="How session timing is defined:\n• Interval (h) — opens game every N hours\n• Sessions/day — opens game N times per day at equal intervals">
              🕐 Session
            </span>
            <select class="psim-cfg-select psim-session-mode">
              <option value="interval"       ${profile.sessionMode === 'interval'       ? 'selected' : ''}>Interval (h)</option>
              <option value="sessionsPerDay" ${profile.sessionMode === 'sessionsPerDay' ? 'selected' : ''}>Sessions/day</option>
            </select>
            <label class="psim-session-param psim-has-tip ${profile.sessionMode !== 'interval' ? 'psim-dim' : ''}"
                   data-tip="Hours between each play session.\nExample: 6h → 4 sessions/day">
              <span class="psim-cfg-unit">Every</span>
              <input type="number" class="psim-cfg-input psim-cfg-num psim-session-interval" value="${profile.intervalHours}" min="0.5" max="24" step="0.5">
              <span class="psim-cfg-unit">h</span>
            </label>
            <label class="psim-session-param psim-has-tip ${profile.sessionMode !== 'sessionsPerDay' ? 'psim-dim' : ''}"
                   data-tip="Total play sessions per day, spread evenly across 24h.\nExample: 8 sessions → plays every 3 hours">
              <input type="number" class="psim-cfg-input psim-cfg-num psim-session-count" value="${profile.sessionsPerDay}" min="1" max="24">
              <span class="psim-cfg-unit">sess/day</span>
            </label>
          </div>
        </div>

        <details class="psim-cfg-props-group">
          <summary class="psim-cfg-props-summary">🔧 Properties</summary>
          <div class="psim-cfg-gem-limits">
            <span class="psim-cfg-gem-title">💎 Gem limits / day</span>
            <div class="psim-cfg-gem-row">
              <label class="psim-cfg-gem-item psim-has-tip"
                     data-tip="Max times to buy energy per day with gems.\nCost: 10→20→40→80→160 💎 per 100 energy.\n0 = never buy energy.">
                <span class="psim-cfg-unit">⚡ Energy buys</span>
                <input type="number" class="psim-cfg-input psim-cfg-num psim-gem-energy-limit" value="${profile.gemEnergyBuysPerDay ?? 5}" min="0" max="5">
              </label>
              <label class="psim-cfg-gem-item psim-has-tip"
                     data-tip="Max generator cooldown resets per day.\nCost varies per generator type.\n0 = never reset generators.">
                <span class="psim-cfg-unit">🔄 Gen resets</span>
                <input type="number" class="psim-cfg-input psim-cfg-num psim-gem-reset-limit" value="${profile.gemGenResetsPerDay ?? 5}" min="0" max="50">
              </label>
              <label class="psim-cfg-gem-item psim-has-tip"
                     data-tip="Max instant cooking completions per day.\nCost: 1💎 per 60s of cook time.\n0 = never skip cooking.">
                <span class="psim-cfg-unit">🍳 Instant cooks</span>
                <input type="number" class="psim-cfg-input psim-cfg-num psim-gem-cook-limit" value="${profile.gemInstantCooksPerDay ?? 3}" min="0" max="50">
              </label>
            </div>
          </div>
        </details>

        <div class="psim-purchases">
          ${rows || '<div class="psim-no-purchases">No purchases scheduled</div>'}
          <button type="button" class="psim-add-purchase psim-btn-add" data-profile="${idx}">+ Add Purchase</button>
        </div>
      </details>`;
  }

  // ── Render (DOM only — no event binding) ────────────────────────────────
  function render(iapCatalog) {
    _iapCatalog = iapCatalog || _iapCatalog;
    const container = document.getElementById('psim-config');
    if (!container) return;

    container.innerHTML = `
      <div class="psim-cfg-global-wrap">
        <div class="psim-cfg-global-title">⚙️ Simulation Settings</div>
        <div class="psim-cfg-global">
          <div class="psim-cfg-global-params">
            <div class="psim-cfg-field">
              <span class="psim-cfg-label">⚡ Regen</span>
              <input id="psim-regen" type="number" class="psim-cfg-input" value="${_globalRegen}" step="1" min="1">
              <span class="psim-cfg-unit">min/⚡</span>
            </div>
            <div class="psim-cfg-field">
              <span class="psim-cfg-label">🔋 Cap</span>
              <input id="psim-cap" type="number" class="psim-cfg-input" value="${_globalCap}" min="20" max="500">
            </div>
            <div class="psim-cfg-field">
              <span class="psim-cfg-label">⚡ Start</span>
              <input id="psim-start-energy" type="number" class="psim-cfg-input" value="${_globalStartEnergy}" min="0" max="9999">
            </div>
            <div class="psim-cfg-field">
              <span class="psim-cfg-label">💎 Start</span>
              <input id="psim-start-gems" type="number" class="psim-cfg-input" value="${_globalStartGems}" min="0" max="99999">
            </div>
          </div>
          <div class="psim-cfg-global-flags">
            <label class="psim-cfg-check psim-has-tip" data-tip="Generators refill instantly after pool empties — skip cooldown timer">
              <input id="psim-no-cooldown" type="checkbox" ${_globalNoCooldown ? 'checked' : ''}>
              <span>🔄 No Cooldown</span>
            </label>
            <label class="psim-cfg-check psim-has-tip" data-tip="Cooking completes instantly within the same session">
              <input id="psim-instant-cook" type="checkbox" ${_globalInstantCook ? 'checked' : ''}>
              <span>⚡ Instant Cook</span>
            </label>
            <label class="psim-cfg-check psim-has-tip" data-tip="Skip generator simulation — deduct energy cost per order directly from Game Data">
              <input id="psim-direct-energy" type="checkbox" ${_globalDirectEnergy ? 'checked' : ''}>
              <span>⚡ Direct Energy</span>
            </label>
          </div>
        </div>
      </div>
      <div id="psim-profiles">
        ${_profiles.map((p, i) => _renderProfileCard(p, i)).join('')}
      </div>
      <button type="button" id="psim-add-profile-btn" class="psim-btn-add psim-btn-add-profile">+ Add Profile</button>`;

    // Bind events only once — after first render DOM is ready
    if (!_eventsReady) {
      _bindEvents();
      _eventsReady = true;
    }
  }

  // ── Dropdown helpers ─────────────────────────────────────────────────────
  // Portal: track which panel is currently open and its original parent
  let _portalPanel = null;
  let _portalOrigin = null;

  function _closePanels(except) {
    // Return portal panel to its original slot if closing
    if (_portalPanel && _portalPanel !== except) {
      _portalPanel.classList.remove('open');
      _portalPanel.style.cssText = '';
      if (_portalOrigin) _portalOrigin.appendChild(_portalPanel);
      _portalPanel = null;
      _portalOrigin = null;
    }
  }

  function _openPanel(panel, btn) {
    _closePanels(null); // close any previously open panel first

    // Portal: move panel to <body> so it's unaffected by ancestor overflow/transform
    _portalOrigin = panel.parentElement;
    _portalPanel  = panel;
    document.body.appendChild(panel);

    const rect = btn.getBoundingClientRect();
    const panelW = Math.max(rect.width, 260);
    // Clamp so it doesn't overflow the right edge of viewport
    const left = Math.min(rect.left, window.innerWidth - panelW - 8);
    panel.style.position = 'fixed';
    panel.style.top      = (rect.bottom + 4) + 'px';
    panel.style.left     = Math.max(8, left) + 'px';
    panel.style.width    = panelW + 'px';
    panel.style.maxWidth = '380px';
    panel.classList.add('open');

    const search = panel.querySelector('.psim-pkg-search');
    if (search) {
      search.value = '';
      panel.querySelectorAll('.psim-pkg-opt').forEach(o => o.style.display = '');
      search.focus();
    }
  }

  // ── Events (bound once) ──────────────────────────────────────────────────
  function _bindEvents() {
    const container = document.getElementById('psim-config');
    if (!container) return;

    // Close panels on outside click — also check portalled panel in document.body
    document.addEventListener('click', e => {
      // Handle option selection from portalled panel (panel lives in document.body)
      const opt = e.target.closest('.psim-pkg-opt');
      if (opt && _portalPanel && _portalPanel.contains(opt)) {
        e.stopPropagation();
        const dd    = _portalOrigin;
        const pRow  = dd && dd.closest('[data-purchase]');
        const card  = dd && dd.closest('[data-profile]');
        if (pRow && card) {
          const profileIdx  = parseInt(card.dataset.profile);
          const purchaseIdx = parseInt(pRow.dataset.purchase);
          const pur = _profiles[profileIdx] && _profiles[profileIdx].purchases[purchaseIdx];
          if (pur) {
            const [key, id] = (opt.dataset.value || '::').split('::');
            pur.packageKey = key;
            pur.packageId  = id;
            const btnLabel = dd.querySelector('.psim-pkg-btn-label');
            if (btnLabel) btnLabel.textContent = opt.textContent;
            _portalPanel.querySelectorAll('.psim-pkg-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            _save();
          }
        }
        _closePanels(null);
        return;
      }

      // Close on outside click
      if (!e.target.closest('#psim-config .psim-pkg-dd') && !e.target.closest('.psim-pkg-panel'))
        _closePanels(null);
    });

    container.addEventListener('change', e => {
      const card = e.target.closest('[data-profile]');
      const idx  = card ? parseInt(card.dataset.profile) : -1;

      if (e.target.id === 'psim-regen')        { _globalRegen       = Math.max(1, parseFloat(e.target.value) || 5); _save(); return; }
      if (e.target.id === 'psim-cap')          { _globalCap         = parseInt(e.target.value)   || 100; _save(); return; }
      if (e.target.id === 'psim-start-energy') { _globalStartEnergy = parseInt(e.target.value)   || 0;   _save(); return; }
      if (e.target.id === 'psim-start-gems')   { _globalStartGems   = parseInt(e.target.value)   || 0;   _save(); return; }
      if (e.target.id === 'psim-no-cooldown')  { _globalNoCooldown  = e.target.checked; _save(); return; }
      if (e.target.id === 'psim-instant-cook')  { _globalInstantCook  = e.target.checked; _save(); return; }
      if (e.target.id === 'psim-direct-energy') { _globalDirectEnergy = e.target.checked; _save(); return; }
      if (idx < 0 || !_profiles[idx]) return;

      if (e.target.classList.contains('psim-profile-name'))     _profiles[idx].name              = e.target.value;
      if (e.target.classList.contains('psim-profile-type')) _profiles[idx].playerType = e.target.value;
      if (e.target.classList.contains('psim-session-mode')) {
        _profiles[idx].sessionMode = e.target.value;
        const isInterval = e.target.value === 'interval';
        const c = e.target.closest('[data-profile]');
        c.querySelector('.psim-session-interval')?.closest('.psim-session-param')?.classList.toggle('psim-dim', !isInterval);
        c.querySelector('.psim-session-count')?.closest('.psim-session-param')?.classList.toggle('psim-dim', isInterval);
      }
      if (e.target.classList.contains('psim-session-interval')) _profiles[idx].intervalHours     = parseFloat(e.target.value) || 6;
      if (e.target.classList.contains('psim-session-count'))    _profiles[idx].sessionsPerDay    = parseInt(e.target.value)   || 4;
      if (e.target.classList.contains('psim-profile-enabled'))         _profiles[idx].enabled        = e.target.checked;
      if (e.target.classList.contains('psim-profile-ignore-capacity')) _profiles[idx].ignoreCapacity = e.target.checked;
      if (e.target.classList.contains('psim-gem-energy-limit')) _profiles[idx].gemEnergyBuysPerDay   = parseInt(e.target.value) || 0;
      if (e.target.classList.contains('psim-gem-reset-limit'))  _profiles[idx].gemGenResetsPerDay    = parseInt(e.target.value) || 0;
      if (e.target.classList.contains('psim-gem-cook-limit'))   _profiles[idx].gemInstantCooksPerDay = parseInt(e.target.value) || 0;
      if (e.target.classList.contains('psim-profile-color')) {
        _profiles[idx].color = e.target.value;
        // Update card border color live
        const card = e.target.closest('[data-profile]');
        if (card) card.style.borderLeftColor = e.target.value;
      }

      const pRow = e.target.closest('[data-purchase]');
      if (pRow) {
        const pi = parseInt(pRow.dataset.purchase);
        const pur = _profiles[idx].purchases[pi];
        if (!pur) return;
        if (e.target.classList.contains('psim-purchase-day')) pur.day      = parseInt(e.target.value) || 1;
        if (e.target.classList.contains('psim-purchase-qty')) pur.quantity = parseInt(e.target.value) || 1;
      }
      _save();
    });

    // Package search filter
    container.addEventListener('input', e => {
      if (!e.target.classList.contains('psim-pkg-search')) return;
      const q    = e.target.value.toLowerCase();
      const list = e.target.closest('.psim-pkg-panel').querySelector('.psim-pkg-list');
      list.querySelectorAll('.psim-pkg-opt').forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    container.addEventListener('click', e => {
      // Toggle dropdown
      const btn = e.target.closest('.psim-pkg-btn');
      if (btn) {
        e.stopPropagation();
        // Panel may have been portalled out — find it via the dd or the portal tracker
        const dd = btn.closest('.psim-pkg-dd');
        const panel = (_portalOrigin && _portalOrigin === dd) ? _portalPanel
                    : dd.querySelector('.psim-pkg-panel');
        if (panel && panel.classList.contains('open')) {
          _closePanels(null);
        } else if (panel) {
          _openPanel(panel, btn);
        }
        return;
      }

      // Select option — panel may be in document.body (portalled), use _portalOrigin for context
      const opt = e.target.closest('.psim-pkg-opt');
      if (opt) {
        e.stopPropagation();
        // Find purchase context from original slot
        const dd      = _portalOrigin || opt.closest('.psim-pkg-dd');
        const pRow    = dd ? dd.closest('[data-purchase]') : opt.closest('[data-purchase]');
        const card    = dd ? dd.closest('[data-profile]')  : opt.closest('[data-profile]');
        if (!pRow || !card) return;
        const profileIdx  = parseInt(card.dataset.profile);
        const purchaseIdx = parseInt(pRow.dataset.purchase);
        const pur = _profiles[profileIdx] && _profiles[profileIdx].purchases[purchaseIdx];
        if (!pur) return;
        const [key, id] = (opt.dataset.value || '::').split('::');
        pur.packageKey = key;
        pur.packageId  = id;
        const btnLabel = dd && dd.querySelector('.psim-pkg-btn-label');
        if (btnLabel) btnLabel.textContent = opt.textContent;
        if (_portalPanel) _portalPanel.querySelectorAll('.psim-pkg-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        _closePanels(null);
        _save();
        return;
      }

      // Add profile
      if (e.target.id === 'psim-add-profile-btn') {
        _profiles.push({ name: `Profile ${_profiles.length + 1}`, sessionMode: 'interval', sessionsPerDay: 4, intervalHours: 6, playerType: 'f2p', ignoreCapacity: false, enabled: true, purchases: [] });
        _save();
        render(_iapCatalog);
        return;
      }

      // Remove profile
      if (e.target.classList.contains('psim-remove-profile')) {
        const idx = parseInt(e.target.dataset.profile);
        if (_profiles.length <= 1) return;
        _profiles.splice(idx, 1);
        _save();
        render(_iapCatalog);
        return;
      }

      // Add purchase
      if (e.target.classList.contains('psim-add-purchase')) {
        const idx = parseInt(e.target.dataset.profile);
        _profiles[idx].purchases.push({ day: 1, packageKey: '', packageId: '', quantity: 1 });
        _save();
        _rerenderPurchases(idx);
        return;
      }

      // Remove purchase
      if (e.target.classList.contains('psim-remove-purchase')) {
        const pRow = e.target.closest('[data-purchase]');
        const card = e.target.closest('[data-profile]');
        if (!pRow || !card) return;
        const idx = parseInt(card.dataset.profile);
        const pi  = parseInt(pRow.dataset.purchase);
        _profiles[idx].purchases.splice(pi, 1);
        _save();
        _rerenderPurchases(idx);
      }
    });
  }

  // Re-render only the purchases section of one profile (avoids full re-render + duplicate listeners)
  function _rerenderPurchases(profileIdx) {
    const card = document.querySelector(`#psim-config [data-profile="${profileIdx}"]`);
    if (!card) return;
    const purchasesEl = card.querySelector('.psim-purchases');
    if (!purchasesEl) return;
    const rows = _profiles[profileIdx].purchases.map((p, pi) => _renderPurchaseRow(p, profileIdx, pi)).join('');
    purchasesEl.innerHTML = rows
      + `<button type="button" class="psim-add-purchase psim-btn-add" data-profile="${profileIdx}">+ Add Purchase</button>`;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function getProfiles() {
    return _profiles
      .filter(p => p.enabled)
      .map(p => ({ ...p, regenPerMin: 1 / _globalRegen, cap: _globalCap,
                   startingEnergy: _globalStartEnergy, startingGems: _globalStartGems,
                   noCooldown: _globalNoCooldown, instantCook: _globalInstantCook,
                   directEnergyMode: _globalDirectEnergy }));
  }

  function getColors() {
    return _profiles.map((p, i) => p.color || PROFILE_COLORS[i % PROFILE_COLORS.length]);
  }

  // Load saved config before first render
  _load();

  return { render, getProfiles, getColors };
})();
