/**
 * app.js — Main controller
 * Navigation, tab switching, ProcessedData store, module init.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Shared processed-data store — modules write here, others read
    window.ProcessedData = { orders: {}, iap: {} };

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
    if (typeof IAPPackages      !== 'undefined') IAPPackages.init();
}
