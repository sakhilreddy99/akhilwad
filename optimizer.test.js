/**
 * Unit Tests for Knapsack Diet Optimization Engine
 * Verifies exact hackathon demo case, budget adherence, variety constraints, and edge cases.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateOptimizedMealPlan, calculateRDATargets } = require('../src/services/optimizerService');

test('RDA Target Calculation for all fitness goals', () => {
  const muscleGain = calculateRDATargets('Muscle Gain');
  assert.equal(muscleGain.targetCalories, 2200);
  assert.ok(muscleGain.targetProtein >= 90);

  const weightLoss = calculateRDATargets('Weight Loss');
  assert.equal(weightLoss.targetCalories, 1650);
  assert.ok(weightLoss.targetProtein >= 75);

  const maintenance = calculateRDATargets('Maintenance');
  assert.equal(maintenance.targetCalories, 1950);
});

test('Hackathon Demo Specification: ₹120 Budget, High Protein / Muscle Gain', () => {
  const plan = generateOptimizedMealPlan({
    dailyBudget: 120,
    dietPreference: 'non-veg',
    fitnessGoal: 'Muscle Gain',
    priceMultiplier: 1.0
  });

  assert.ok(plan.success);
  assert.ok(plan.totals.cost <= 120, `Plan cost ₹${plan.totals.cost} must not exceed ₹120`);
  assert.equal(plan.totals.cost, 120, 'Plan should hit exact ₹120 optimal demo allocation');

  // Verify meal slots
  assert.equal(plan.meals.length, 4, 'Should include Breakfast, Lunch, Snack, and Dinner');
  
  const breakfast = plan.meals.find(m => m.slotKey === 'breakfast');
  const lunch = plan.meals.find(m => m.slotKey === 'lunch');
  const snack = plan.meals.find(m => m.slotKey === 'snack');
  const dinner = plan.meals.find(m => m.slotKey === 'dinner');

  assert.ok(breakfast && lunch && snack && dinner);
  assert.equal(breakfast.cost, 35);
  assert.equal(lunch.cost, 40);
  assert.equal(snack.cost, 15);
  assert.equal(dinner.cost, 30);

  // High protein verification: 88g+ of quality protein
  assert.ok(plan.totals.protein >= 85, `Total protein ${plan.totals.protein}g must be high-protein`);
});

test('Variety Constraint Enforcement: No consecutive duplicate protein sources', () => {
  const plan = generateOptimizedMealPlan({
    dailyBudget: 150,
    dietPreference: 'non-veg',
    fitnessGoal: 'Maintenance'
  });

  for (let i = 0; i < plan.meals.length - 1; i++) {
    const current = plan.meals[i];
    const next = plan.meals[i + 1];
    if (current.primary_protein !== 'general') {
      assert.notEqual(
        current.primary_protein,
        next.primary_protein,
        `Consecutive meals (${current.name} -> ${next.name}) must not share identical primary protein "${current.primary_protein}"`
      );
    }
  }
});

test('Dietary Filtering: Strictly adheres to Vegetarian constraint', () => {
  const plan = generateOptimizedMealPlan({
    dailyBudget: 130,
    dietPreference: 'veg',
    fitnessGoal: 'Muscle Gain'
  });

  assert.ok(plan.totals.cost <= 130);
  for (const meal of plan.meals) {
    assert.ok(
      meal.diet_type === 'veg' || meal.diet_type === 'vegan',
      `Meal ${meal.name} has diet type ${meal.diet_type}, which violates vegetarian preference`
    );
  }
});

test('Dietary Filtering: Strictly adheres to Vegan constraint', () => {
  const plan = generateOptimizedMealPlan({
    dailyBudget: 140,
    dietPreference: 'vegan',
    fitnessGoal: 'Weight Loss'
  });

  assert.ok(plan.totals.cost <= 140);
  for (const meal of plan.meals) {
    assert.equal(
      meal.diet_type,
      'vegan',
      `Meal ${meal.name} is not vegan (${meal.diet_type})`
    );
  }
});

test('Edge Case: Extremely low budget throws informative error with minimum feasible cost', () => {
  assert.throws(() => {
    generateOptimizedMealPlan({
      dailyBudget: 40, // Too low for 3 meals
      dietPreference: 'veg'
    });
  }, /too restrictive/);
});
