/**
 * app.js — Main controller
 * State, navigation, CSV loading, tab routing.
 */
const App = (() => {

  let db = null;
  const initializedTabs = new Set();

  const TABS = [
    { id: 'overview',      label: 'Overview',       icon: '🗺️',  engine: () => Overview.init(db)     },
    { id: 'pacing',        label: 'Pacing',          icon: '📈',  engine: () => PacingEngine.init(db) },
    { id: 'orders',        label: 'Orders & Demand', icon: '📋',  engine: () => OrdersEngine.init(db) },
    { id: 'economy',       label: 'Economy Flow',    icon: '💰',  engine: () => EconomyEngine.init(db)},
    { id: 'encyclopedia',  label: 'Encyclopedia',    icon: '📚',  engine: () => Encyclopedia.init(db) },
  ];

  // --- Navigation ---

  function showTab(tabId) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === tabId);
    });

    // Update views
    document.querySelectorAll('.view').forEach(el => {
      el.classList.toggle('active', el.id === `view-${tabId}`);
    });

    // Update topbar title
    const tab = TABS.find(t => t.id === tabId);
    const titleEl = document.getElementById('topbar-title');
    if (titleEl && tab) titleEl.textContent = tab.label;

    // Init engine (lazy — only once)
    if (db && tab && !initializedTabs.has(tabId)) {
      initializedTabs.add(tabId);
      try { tab.engine(); } catch (e) { console.error(`Tab ${tabId} error:`, e); }
    }
  }

  function bindNav() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => showTab(el.dataset.tab));
    });
  }

  // --- Loading UI ---

  function setLoadingText(text) {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 500);
    }
  }

  // --- Boot ---

  async function boot() {
    try {
      setLoadingText('Loading CSV data…');
      db = await CsvLoader.loadAll();

      setLoadingText('Building dashboard…');
      await new Promise(r => setTimeout(r, 80)); // micro-delay for paint

      hideLoading();
      bindNav();

      // Show first tab
      showTab('overview');

    } catch (err) {
      console.error('Boot error:', err);
      setLoadingText(`Error: ${err.message}`);
    }
  }

  return { boot };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
