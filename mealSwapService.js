/**
 * Meal Swap Alternative Engine for PlatePilot
 * Allows students to swap out any disliked or incompatible dish for a nutritionally
 * equivalent, budget-compatible alternative with one click.
 */

const { getDatabase } = require('../config/database');

/**
 * Finds compatible replacement recipes for a given meal slot
 * 
 * @param {Object} params
 * @param {Array<Object>} params.currentMeals - The active 3 or 4 meals in the plan
 * @param {string} params.slotKey - 'breakfast', 'lunch', 'snack', or 'dinner'
 * @param {number} params.dailyBudget - Strict daily ceiling in INR
 * @param {string} [params.targetDiet] - Optional specific diet preference for the swap (e.g., 'veg', 'vegan', 'non-veg')
 * @param {number} [params.priceMultiplier=1.0] - Regional price factor
 * @returns {Array<Object>} List of ranked feasible alternatives
 */
function getMealSwapAlternatives({
  currentMeals,
  slotKey,
  dailyBudget = 120,
  targetDiet = null,
  priceMultiplier = 1.0
}) {
  const db = getDatabase();
  const currentMealIndex = currentMeals.findIndex(m => m.slotKey === slotKey || m.slot.toLowerCase() === slotKey.toLowerCase());
  
  if (currentMealIndex === -1) {
    throw new Error(`Meal slot "${slotKey}" not found in current plan.`);
  }

  const currentMeal = currentMeals[currentMealIndex];
  
  // Calculate cost of other meals in the plan
  const otherMealsCost = currentMeals
    .filter((_, idx) => idx !== currentMealIndex)
    .reduce((sum, m) => sum + m.cost, 0);

  // Maximum allowed cost for this replacement meal
  const maxAllowedCost = dailyBudget - otherMealsCost;

  let dietFilterSql = '';
  if (targetDiet) {
    const norm = targetDiet.toLowerCase();
    if (norm === 'vegan') dietFilterSql = "AND diet_type = 'vegan'";
    else if (norm === 'veg') dietFilterSql = "AND diet_type IN ('veg', 'vegan')";
    else if (norm === 'non-veg') dietFilterSql = "AND diet_type IN ('non-veg', 'veg', 'vegan')";
  }

  // Fetch candidates for this meal slot
  const candidates = db.query(`
    SELECT * FROM IndianStapleRecipes
    WHERE meal_type = ?
      AND id != ?
      ${dietFilterSql}
  `, [slotKey.toLowerCase(), currentMeal.id]);

  const viableAlternatives = [];

  for (const c of candidates) {
    let ingredients = [];
    let instructions = [];
    let tags = [];
    try { ingredients = JSON.parse(c.ingredients_json); } catch (e) {}
    try { instructions = JSON.parse(c.instructions_json); } catch (e) {}
    try { tags = JSON.parse(c.tags_json); } catch (e) {}

    const effectiveCost = Math.round(c.cost * priceMultiplier * 10) / 10;

    // Must strictly fit under remaining budget
    if (effectiveCost > maxAllowedCost) continue;

    // Macro similarity scoring (closer to current meal's protein and calories is better)
    const calDiff = Math.abs(c.calories - currentMeal.calories);
    const proteinDiff = Math.abs(c.protein - currentMeal.protein);
    const costDiff = effectiveCost - currentMeal.cost;

    // Score: reward high protein, penalize excessive calorie deviations
    const similarityScore = (c.protein * 2) - (calDiff * 0.05) - (proteinDiff * 0.5) - Math.abs(costDiff * 0.2);

    viableAlternatives.push({
      id: c.id,
      name: c.name,
      meal_type: c.meal_type,
      diet_type: c.diet_type,
      calories: c.calories,
      protein: c.protein,
      carbs: c.carbs,
      fats: c.fats,
      cost: effectiveCost,
      baseCost: c.cost,
      costDelta: Math.round((effectiveCost - currentMeal.cost) * 10) / 10,
      newTotalCost: Math.round((otherMealsCost + effectiveCost) * 10) / 10,
      prep_time: c.prep_time,
      primary_protein: c.primary_protein,
      is_hostel_friendly: c.is_hostel_friendly === 1,
      ingredients,
      instructions,
      tags,
      similarityScore: Math.round(similarityScore * 10) / 10
    });
  }

  // Sort by highest similarity score
  viableAlternatives.sort((a, b) => b.similarityScore - a.similarityScore);

  return viableAlternatives;
}

/**
 * Executes a meal swap and recalibrates total macros and cost
 */
function executeMealSwap({ currentPlan, slotKey, replacementRecipeId }) {
  const db = getDatabase();
  const recipe = db.get('SELECT * FROM IndianStapleRecipes WHERE id = ?', [replacementRecipeId]);
  if (!recipe) {
    throw new Error(`Recipe with ID ${replacementRecipeId} not found.`);
  }

  let ingredients = [];
  let instructions = [];
  let tags = [];
  try { ingredients = JSON.parse(recipe.ingredients_json); } catch (e) {}
  try { instructions = JSON.parse(recipe.instructions_json); } catch (e) {}
  try { tags = JSON.parse(recipe.tags_json); } catch (e) {}

  const priceMultiplier = currentPlan.meta?.priceMultiplier || 1.0;
  const effectiveCost = Math.round(recipe.cost * priceMultiplier * 10) / 10;

  const newMeals = currentPlan.meals.map(m => {
    if (m.slotKey === slotKey || m.slot.toLowerCase() === slotKey.toLowerCase()) {
      return {
        slot: m.slot,
        slotKey: m.slotKey,
        id: recipe.id,
        name: recipe.name,
        meal_type: recipe.meal_type,
        diet_type: recipe.diet_type,
        calories: recipe.calories,
        protein: recipe.protein,
        carbs: recipe.carbs,
        fats: recipe.fats,
        cost: effectiveCost,
        baseCost: recipe.cost,
        prep_time: recipe.prep_time,
        primary_protein: recipe.primary_protein,
        is_hostel_friendly: recipe.is_hostel_friendly === 1,
        ingredients,
        instructions,
        tags
      };
    }
    return m;
  });

  // Recalculate totals
  const totalCost = Math.round(newMeals.reduce((s, m) => s + m.cost, 0) * 10) / 10;
  const totalCalories = Math.round(newMeals.reduce((s, m) => s + m.calories, 0));
  const totalProtein = Math.round(newMeals.reduce((s, m) => s + m.protein, 0) * 10) / 10;
  const totalCarbs = Math.round(newMeals.reduce((s, m) => s + m.carbs, 0) * 10) / 10;
  const totalFats = Math.round(newMeals.reduce((s, m) => s + m.fats, 0) * 10) / 10;

  const dailyBudget = currentPlan.meta?.dailyBudget || 120;

  return {
    ...currentPlan,
    meta: {
      ...currentPlan.meta,
      remainingBudget: Math.round((dailyBudget - totalCost) * 10) / 10
    },
    totals: {
      cost: totalCost,
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fats: totalFats
    },
    macroPercentages: {
      proteinPct: Math.round((totalProtein * 4 / totalCalories) * 100),
      carbsPct: Math.round((totalCarbs * 4 / totalCalories) * 100),
      fatsPct: Math.round((totalFats * 9 / totalCalories) * 100)
    },
    meals: newMeals
  };
}

module.exports = {
  getMealSwapAlternatives,
  executeMealSwap
};
