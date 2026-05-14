// tests/simCooking.test.js
const { test, assert, assertEqual, suite, summary } = require('./testRunner');
const SimCooking = require('../js/sim/simCooking');
const SimBoard = require('../js/sim/simBoard');

const toolCat = {
  '2001': {
    type: '2001',
    recipes: [
      { resultId: '400201', timeSecs: 60, ingredients: ['700501'] },
      { resultId: '400207', timeSecs: 120, ingredients: ['700501', '700507'] },
    ]
  }
};

suite('SimCooking', () => {
  suite('findRecipe', () => {
    test('finds recipe by resultId', () => {
      const r = SimCooking.findRecipe(toolCat, '400201');
      assert(r !== null);
      assertEqual(r.resultId, '400201');
      assertEqual(r.toolId, '2001');
      assertEqual(r.timeSecs, 60);
    });
    test('returns null for unknown resultId', () => {
      assert(SimCooking.findRecipe(toolCat, '999999') === null);
    });
    test('multi-ingredient recipe found correctly', () => {
      const r = SimCooking.findRecipe(toolCat, '400207');
      assertEqual(r.ingredients.length, 2);
    });
  });

  suite('startCooking', () => {
    test('starts cooking on idle tool when ingredients available', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      const started = SimCooking.startCooking(board, toolCat, '400201', 0);
      assert(started === true);
      assert(board.tools[0].cooking !== null);
      assertEqual(board.tools[0].cooking.resultId, '400201');
      // ingredient consumed from board
      assert((board.boardItems['700501'] || 0) === 0);
    });
    test('returns false when no idle tool available', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 9999 };
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      assert(SimCooking.startCooking(board, toolCat, '400201', 0) === false);
    });
    test('returns false when ingredients missing', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      assert(SimCooking.startCooking(board, toolCat, '400201', 0) === false);
    });
    test('doneAt = currentTimeMins + timeSecs/60', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      SimCooking.startCooking(board, toolCat, '400201', 10);
      assertEqual(board.tools[0].cooking.doneAt, 10 + 60 / 60); // 10 + 1 = 11
    });
    test('multi-ingredient: all consumed', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.boardItems['700501'] = 1;
      board.boardItems['700507'] = 1;
      board.boardItemCount = 2;
      const started = SimCooking.startCooking(board, toolCat, '400207', 0);
      assert(started === true);
      assert((board.boardItems['700501'] || 0) === 0);
      assert((board.boardItems['700507'] || 0) === 0);
    });
  });

  suite('processCooking', () => {
    test('completes cooking when doneAt reached, adds result to board', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 60 };
      const completed = SimCooking.processCooking(board, 120);
      assertEqual(completed.length, 1);
      assertEqual(completed[0], '400201');
      assert(board.tools[0].cooking === null);
      assertEqual(board.boardItems['400201'], 1);
      assertEqual(board.boardItemCount, 1);
    });
    test('does not complete before doneAt', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 60 };
      const completed = SimCooking.processCooking(board, 30);
      assertEqual(completed.length, 0);
      assert(board.tools[0].cooking !== null);
    });
    test('returns empty array when no tools cooking', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      const completed = SimCooking.processCooking(board, 100);
      assertEqual(completed.length, 0);
    });
    test('processes multiple tools in one call', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 50 };
      board.tools[1].cooking = { resultId: '400201', doneAt: 80 };
      const completed = SimCooking.processCooking(board, 100);
      assertEqual(completed.length, 2);
    });
  });

  suite('tryStartAllCooking', () => {
    test('starts cooking for items in pendingOrderItems list', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      const started = SimCooking.tryStartAllCooking(board, toolCat, ['400201'], 0);
      assertEqual(started, 1);
      assert(board.tools[0].cooking !== null);
    });
    test('returns 0 when no idle tools', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.tools[0].cooking = { resultId: '400201', doneAt: 9999 };
      const started = SimCooking.tryStartAllCooking(board, toolCat, ['400201'], 0);
      assertEqual(started, 0);
    });
    test('skips items with no recipe', () => {
      const board = SimBoard.create();
      SimBoard.addTool(board, '2001');
      board.boardItems['700501'] = 1;
      board.boardItemCount = 1;
      // '999999' has no recipe, '400201' does
      const started = SimCooking.tryStartAllCooking(board, toolCat, ['999999', '400201'], 0);
      assertEqual(started, 1);
    });
  });
});

summary();
