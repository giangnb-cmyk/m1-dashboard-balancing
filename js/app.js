/**
 * app.js — Main controller
 * Navigation, tab switching, init.
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
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
}
