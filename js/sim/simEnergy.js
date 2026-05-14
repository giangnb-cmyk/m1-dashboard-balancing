// js/sim/simEnergy.js
const SimEnergy = (() => {
  function create({ regenPerMin = 0.2, cap = 100, initialOwned = 20 } = {}) {
    return { owned: initialOwned, cap, regenPerMin };
  }

  function tick(e, minutes) {
    if (e.owned < e.cap) e.owned = Math.min(e.cap, e.owned + e.regenPerMin * minutes);
  }

  function spend(e, amount) {
    if (e.owned < amount) return false;
    e.owned -= amount;
    return true;
  }

  function inject(e, amount, economy) {
    e.owned += amount;
    if (economy) economy.energy.received += amount;
  }

  if (typeof module !== 'undefined') module.exports = { create, tick, spend, inject };
  return { create, tick, spend, inject };
})();
