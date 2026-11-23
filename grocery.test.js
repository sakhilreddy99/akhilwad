/**
 * Unit Tests for Smart Grocery Shopping List Generator
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOptimizedMealPlan } = require('../src/services/optimizerService');
const { generateWeeklyGroceryList } = require('../src/services/groceryService');

test('Weekly Grocery List Generation & Categorization', () => {
  const plan = generateOptimizedMealPlan({
    dailyBudget: 120,
    dietPreference: 'non-veg',
    fitnessGoal: 'Muscle Gain'
  });

  const groceryList = generateWeeklyGroceryList(plan.meals, 7);

  assert.equal(groceryList.days, 7);
  assert.ok(groceryList.totalItems > 0, 'Should aggregate multiple ingredients');
  assert.ok(groceryList.totalEstimatedWeeklySpend > 0);
  assert.ok(groceryList.bulkDiscountedWeeklySpend <= groceryList.totalEstimatedWeeklySpend);

  // Check expected categories exist
  const expectedCategories = [
    'Proteins & Pulses',
    'Grains & Staples',
    'Dairy & Poultry',
    'Nuts & Healthy Fats',
    'Fresh Produce'
  ];

  for (const cat of expectedCategories) {
    assert.ok(Array.isArray(groceryList.categories[cat]), `Category ${cat} should be an array`);
  }
});
