// js/sim/simConfig.js
const SimConfig = (() => {
  const PROFILE_COLORS = ['#38bdf8', '#f87171', '#a78bfa', '#34d399'];

  const DEFAULT_PROFILES = [
    { name: 'Hardcore',  sessionMode: 'sessionsPerDay', sessionsPerDay: 8,  intervalHours: 3,  playerType: 'f2p',     enabled: true },
    { name: 'Mid-core',  sessionMode: 'interval',       sessionsPerDay: 4,  intervalHours: 6,  playerType: 'f2p',     enabled: true },
    { name: 'Casual',    sessionMode: 'interval',       sessionsPerDay: 2,  intervalHours: 12, playerType: 'f2p',     enabled: true },
  ];

  let _profiles = DEFAULT_PROFILES.map(p => ({ ...p, purchases: [] }));
  let _globalRegen = 0.2;
  let _globalCap   = 100;
  let _iapCatalog  = {};

  function getIAPOptions(iapCatalog) {
    const opts = [{ value: '', label: '— Select Package —' }];
    Object.entries(iapCatalog).forEach(([key, packs]) => {
      (packs || []).forEach(p => {
        opts.push({ value: `${key}::${p.id}`, label: p.name || key });
      });
    });
    return opts;
  }

  function renderPurchaseRow(purchase, profileIdx, purchaseIdx, iapOptions) {
    const sel = `${purchase.packageKey || ''}::${purchase.packageId || ''}`;
    const optHtml = iapOptions.map(o =>
      `<option value="${o.value}" ${sel === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    return `
      <div class="psim-purchase-row" data-profile="${profileIdx}" data-purchase="${purchaseIdx}">
        <label>Day</label>
        <input type="number" class="psim-purchase-day" value="${purchase.day || 1}" min="1" max="365" style="width:55px">
        <select class="psim-purchase-pkg">${optHtml}</select>
        <label>×</label>
        <input type="number" class="psim-purchase-qty" value="${purchase.quantity || 1}" min="1" max="99" style="width:45px">
        <button class="psim-remove-purchase" style="padding:0.15rem 0.4rem;background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.75rem;">×</button>
      </div>`;
  }

  function renderProfileCard(profile, idx, iapOptions) {
    const color = PROFILE_COLORS[idx % PROFILE_COLORS.length];
    const purchaseRows = profile.purchases
      .map((p, pi) => renderPurchaseRow(p, idx, pi, iapOptions)).join('');

    return `
      <div class="psim-profile-card" data-profile="${idx}" style="border-left:3px solid ${color}">
        <div class="psim-profile-header">
          <span class="psim-legend-dot" style="background:${color}"></span>
          <label>Name</label>
          <input type="text" class="psim-profile-name" value="${profile.name}" style="width:100px">
          <label>Type</label>
          <select class="psim-profile-type">
            <option value="f2p"     ${profile.playerType === 'f2p'     ? 'selected' : ''}>F2P</option>
            <option value="spender" ${profile.playerType === 'spender' ? 'selected' : ''}>Spender</option>
          </select>
          <label>Session</label>
          <select class="psim-session-mode">
            <option value="interval"       ${profile.sessionMode === 'interval'       ? 'selected' : ''}>Interval (h)</option>
            <option value="sessionsPerDay" ${profile.sessionMode === 'sessionsPerDay' ? 'selected' : ''}>Sessions/day</option>
          </select>
          <input type="number" class="psim-session-interval" value="${profile.intervalHours}"   min="1" max="24" style="width:45px">
          <input type="number" class="psim-session-count"    value="${profile.sessionsPerDay}" min="1" max="24" style="width:45px">
          <label><input type="checkbox" class="psim-profile-enabled" ${profile.enabled ? 'checked' : ''}> Enabled</label>
        </div>
        <div class="psim-purchases">
          ${purchaseRows}
          <button class="psim-add-purchase" data-profile="${idx}"
            style="font-size:0.78rem;padding:0.2rem 0.6rem;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:5px;color:#38bdf8;cursor:pointer;margin-top:0.25rem;">
            + Add Purchase
          </button>
        </div>
      </div>`;
  }

  function render(iapCatalog) {
    _iapCatalog = iapCatalog || _iapCatalog;
    const container = document.getElementById('psim-config');
    if (!container) return;
    const iapOptions = getIAPOptions(_iapCatalog);

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:1.5rem;margin-bottom:1rem;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <label style="font-size:0.82rem;color:var(--text-muted)">Energy regen:</label>
          <input id="psim-regen" type="number" value="${_globalRegen}" step="0.05" min="0.05"
            style="width:60px;padding:0.25rem 0.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-main);font-size:0.82rem;">
          <span style="font-size:0.78rem;color:var(--text-muted)">/min</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <label style="font-size:0.82rem;color:var(--text-muted)">Cap:</label>
          <input id="psim-cap" type="number" value="${_globalCap}" min="20" max="500"
            style="width:60px;padding:0.25rem 0.5rem;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text-main);font-size:0.82rem;">
        </div>
      </div>
      <div id="psim-profiles">
        ${_profiles.map((p, i) => renderProfileCard(p, i, iapOptions)).join('')}
      </div>`;

    bindEvents();
  }

  function bindEvents() {
    const container = document.getElementById('psim-config');
    if (!container) return;

    container.addEventListener('change', e => {
      const card = e.target.closest('[data-profile]');
      const idx = card ? parseInt(card.dataset.profile) : -1;

      if (e.target.id === 'psim-regen') { _globalRegen = parseFloat(e.target.value) || 0.2; return; }
      if (e.target.id === 'psim-cap')   { _globalCap   = parseInt(e.target.value)   || 100; return; }
      if (idx < 0 || !_profiles[idx]) return;

      if (e.target.classList.contains('psim-profile-name'))     _profiles[idx].name        = e.target.value;
      if (e.target.classList.contains('psim-profile-type'))     _profiles[idx].playerType  = e.target.value;
      if (e.target.classList.contains('psim-session-mode'))     _profiles[idx].sessionMode = e.target.value;
      if (e.target.classList.contains('psim-session-interval')) _profiles[idx].intervalHours   = parseFloat(e.target.value) || 6;
      if (e.target.classList.contains('psim-session-count'))    _profiles[idx].sessionsPerDay  = parseInt(e.target.value)   || 4;
      if (e.target.classList.contains('psim-profile-enabled'))  _profiles[idx].enabled     = e.target.checked;

      const pRow = e.target.closest('[data-purchase]');
      if (pRow && idx >= 0) {
        const pi = parseInt(pRow.dataset.purchase);
        const purchase = _profiles[idx].purchases[pi];
        if (!purchase) return;
        if (e.target.classList.contains('psim-purchase-day')) purchase.day      = parseInt(e.target.value) || 1;
        if (e.target.classList.contains('psim-purchase-qty')) purchase.quantity = parseInt(e.target.value) || 1;
        if (e.target.classList.contains('psim-purchase-pkg')) {
          const [key, id] = e.target.value.split('::');
          purchase.packageKey = key;
          purchase.packageId  = id;
        }
      }
    });

    container.addEventListener('click', e => {
      if (e.target.classList.contains('psim-add-purchase')) {
        const idx = parseInt(e.target.dataset.profile);
        _profiles[idx].purchases.push({ day: 1, packageKey: '', packageId: '', quantity: 1 });
        render(_iapCatalog);
        return;
      }
      if (e.target.classList.contains('psim-remove-purchase')) {
        const pRow = e.target.closest('[data-purchase]');
        const card = e.target.closest('[data-profile]');
        if (!pRow || !card) return;
        const idx = parseInt(card.dataset.profile);
        const pi  = parseInt(pRow.dataset.purchase);
        _profiles[idx].purchases.splice(pi, 1);
        render(_iapCatalog);
      }
    });
  }

  function getProfiles() {
    return _profiles
      .filter(p => p.enabled)
      .map(p => ({ ...p, regenPerMin: _globalRegen, cap: _globalCap }));
  }

  function getColors() { return PROFILE_COLORS; }

  return { render, getProfiles, getColors };
})();
