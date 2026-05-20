// js/sim/simCooking.js
// js/sim/simCooking.js
const SimCooking = (() => {
  const _board = () => typeof module !== 'undefined' ? require('./simBoard') : window.SimBoard;

  function findRecipe(toolCatalog, resultId) {
    for (const [toolId, tool] of Object.entries(toolCatalog)) {
      const recipe = tool.recipes.find(r => r.resultId === resultId);
      if (recipe) return { ...recipe, toolId };
    }
    return null;
  }

  function startCooking(board, toolCatalog, resultId, currentTimeMins) {
    const recipe = findRecipe(toolCatalog, resultId);
    if (!recipe) return false;

    const toolSlot = board.tools.find(t => t.toolType === recipe.toolId && !t.cooking);
    if (!toolSlot) return false;

    const SimBoard = _board();
    for (const ingId of recipe.ingredients) {
      if (SimBoard.itemCount(board, ingId) < 1) return false;
    }

    for (const ingId of recipe.ingredients) {
      SimBoard.consumeItem(board, ingId, 1);
    }

    toolSlot.cooking = {
      resultId,
      doneAt: currentTimeMins + recipe.timeSecs / 60
    };
    return true;
  }

  function processCooking(board, currentTimeMins) {
    const SimBoard = _board();
    const completed = [];
    board.tools.forEach(slot => {
      if (!slot.cooking || slot.cooking.doneAt > currentTimeMins) return;
      const resultId = slot.cooking.resultId;
      slot.cooking = null;
      // Use addItem so capacity (board → inventory fallback) is respected
      SimBoard.addItem(board, resultId, 1);
      completed.push(resultId);
    });
    return completed;
  }

  function tryStartAllCooking(board, toolCatalog, pendingOrderItems, currentTimeMins) {
    let started = 0;
    for (const itemId of pendingOrderItems) {
      if (startCooking(board, toolCatalog, itemId, currentTimeMins)) started++;
    }
    return started;
  }

  const exports = { findRecipe, startCooking, processCooking, tryStartAllCooking };
  if (typeof module !== 'undefined') module.exports = exports;
  if (typeof window !== 'undefined') window.SimCooking = exports;
  return exports;
})();
