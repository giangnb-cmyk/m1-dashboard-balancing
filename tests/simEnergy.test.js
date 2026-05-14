// tests/simEnergy.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimEnergy = require('../js/sim/simEnergy');

suite('SimEnergy', () => {
  suite('create', () => {
    test('default initialOwned=20, cap=100, regenPerMin=0.2', () => {
      const e = SimEnergy.create();
      assertEqual(e.owned, 20);
      assertEqual(e.cap, 100);
      assertEqual(e.regenPerMin, 0.2);
    });
    test('custom config applied', () => {
      const e = SimEnergy.create({ initialOwned: 50, regenPerMin: 1, cap: 80 });
      assertEqual(e.owned, 50);
      assertEqual(e.cap, 80);
      assertEqual(e.regenPerMin, 1);
    });
  });

  suite('tick', () => {
    test('regens when owned < cap', () => {
      const e = SimEnergy.create({ initialOwned: 0, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 10);
      assertEqual(e.owned, 10);
    });
    test('does not exceed cap', () => {
      const e = SimEnergy.create({ initialOwned: 95, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 20);
      assertEqual(e.owned, 100);
    });
    test('no regen when owned >= cap', () => {
      const e = SimEnergy.create({ initialOwned: 100, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 60);
      assertEqual(e.owned, 100);
    });
    test('no regen when owned > cap (IAP overflow)', () => {
      const e = SimEnergy.create({ initialOwned: 150, regenPerMin: 1, cap: 100 });
      SimEnergy.tick(e, 60);
      assertEqual(e.owned, 150);
    });
  });

  suite('spend', () => {
    test('returns true and deducts when enough energy', () => {
      const e = SimEnergy.create({ initialOwned: 50 });
      const ok = SimEnergy.spend(e, 10);
      assert(ok === true);
      assertEqual(e.owned, 40);
    });
    test('returns false and does not deduct when not enough', () => {
      const e = SimEnergy.create({ initialOwned: 5 });
      const ok = SimEnergy.spend(e, 10);
      assert(ok === false);
      assertEqual(e.owned, 5);
    });
    test('allows spending exactly owned amount', () => {
      const e = SimEnergy.create({ initialOwned: 10 });
      assert(SimEnergy.spend(e, 10) === true);
      assertEqual(e.owned, 0);
    });
  });

  suite('inject', () => {
    test('adds energy beyond cap', () => {
      const e = SimEnergy.create({ initialOwned: 90 });
      SimEnergy.inject(e, 50);
      assertEqual(e.owned, 140);
    });
    test('economy tracking: received increments when economy provided', () => {
      const e = SimEnergy.create({ initialOwned: 0 });
      const eco = { energy: { received: 0, spent: 0 } };
      SimEnergy.inject(e, 30, eco);
      assertEqual(eco.energy.received, 30);
    });
    test('works without economy object', () => {
      const e = SimEnergy.create({ initialOwned: 0 });
      SimEnergy.inject(e, 30);
      assertEqual(e.owned, 30);
    });
  });
});

summary();
