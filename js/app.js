/**
 * app.js — Main controller
 * Navigation, tab switching, ProcessedData store, module init.
 */

document.addEventListener('DOMContentLoaded', () => {
    window.ProcessedData = { orders: {}, iap: {}, global: {} };

    // Override Chart.js global defaults for dark theme
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#f1f5f9';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
    }

    GlobalData.init();   // compute shared caches before any tab inits
    initNavigation();
    TableUtils.initMainSubTabs();
    initModules();
});

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabViews = document.querySelectorAll('.tab-view');

    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-tab');
            navItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tabViews.forEach(v => {
                v.classList.toggle('active', v.id === target);
            });
        });
    });
}

function initModules() {
    if (typeof ItemEncyclopedia !== 'undefined') ItemEncyclopedia.init();
    if (typeof EnergyCalc       !== 'undefined') EnergyCalc.init();
    if (typeof OrdersTab        !== 'undefined') OrdersTab.init();
    if (typeof OrderAnalysis    !== 'undefined') OrderAnalysis.init();
    if (typeof IAPPackages      !== 'undefined') IAPPackages.init();
    if (typeof PlayerSim        !== 'undefined') PlayerSim.init();
}
