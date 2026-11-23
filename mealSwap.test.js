/**
 * Unit Tests for Meal Swap Alternative Engine
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOptimizedMealPlan } = require('../src/services/optimizerService');
const { getMealSwapAlternatives, executeMealSwap } = require('../src/services/mealSwapService');

test('Meal Swap Alternative Discovery for Breakfast Slot', () => {
  const initialPlan = generateOptimizedMealPlan({
    dailyBudget: 120,
    dietPreference: 'non-veg',
    fitnessGoal: 'Muscle Gain'
  });

  const alternatives = getMealSwapAlternatives({
    currentMeals: initialPlan.meals,
    slotKey: 'breakfast',
    dailyBudget: 120,
    targetDiet: 'veg'
  });

  assert.ok(Array.isArray(alternatives));
  assert.ok(alternatives.length > 0, 'Must return at least one viable vegetarian breakfast alternative');

  // All alternatives must fit strictly under remaining budget
  for (const alt of alternatives) {
    assert.ok(alt.newTotalCost <= 120, `New total cost ₹${alt.newTotalCost} must not exceed ₹120`);
    assert.ok(alt.diet_type === 'veg' || alt.diet_type === 'vegan');
  }
});

test('Meal Swap Execution and Macro Rebalancing', () => {
  const initialPlan = generateOptimizedMealPlan({
    dailyBudget: 120,
    dietPreference: 'non-veg',
    fitnessGoal: 'Muscle Gain'
  });

  const alternatives = getMealSwapAlternatives({
    currentMeals: initialPlan.meals,
    slotKey: 'breakfast',
    dailyBudget: 120,
    targetDiet: 'veg'
  });

  const chosenAlt = alternatives[0];
  const updatedPlan = executeMealSwap({
    currentPlan: initialPlan,
    slotKey: 'breakfast',
    replacementRecipeId: chosenAlt.id
  });

  assert.ok(updatedPlan.success);
  assert.ok(updatedPlan.totals.cost <= 120);
  
  const newBreakfast = updatedPlan.meals.find(m => m.slotKey === 'breakfast');
  assert.equal(newBreakfast.id, chosenAlt.id);
  assert.equal(newBreakfast.name, chosenAlt.name);

  // Recalculated totals should match individual meals sum
  const manualSumCost = updatedPlan.meals.reduce((sum, m) => sum + m.cost, 0);
  assert.equal(updatedPlan.totals.cost, Math.round(manualSumCost * 10) / 10);
});
