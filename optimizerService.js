/**
 * Knapsack Optimization Engine for PlatePilot
 * Implements Multi-Choice Knapsack Problem (MCKP) with bounded branch-and-bound heuristic,
 * protein-to-cost ratio maximization, strict budget constraint, RDA macro targeting,
 * and nutritional variety constraints.
 */

const { getDatabase } = require('../config/database');

/**
 * Calculates student RDA macro targets based on fitness goal and basic profiler inputs
 */
function calculateRDATargets(fitnessGoal, weightKg = 65) {
  switch (fitnessGoal) {
    case 'Muscle Gain':
    case 'High Protein':
      return {
        targetCalories: 2200,
        targetProtein: 95,  // ~1.5g per kg
        targetCarbs: 275,
        targetFats: 60,
        calorieTolerance: 200,
        weights: { protein: 0.60, calories: 0.25, variety: 0.15 }
      };
    case 'Weight Loss':
      return {
        targetCalories: 1650,
        targetProtein: 80,
        targetCarbs: 180,
        targetFats: 45,
        calorieTolerance: 150,
        weights: { protein: 0.50, calories: 0.35, variety: 0.15 }
      };
    case 'Maintenance':
    default:
      return {
        targetCalories: 1950,
        targetProtein: 75,
        targetCarbs: 250,
        targetFats: 55,
        calorieTolerance: 180,
        weights: { protein: 0.40, calories: 0.40, variety: 0.20 }
      };
  }
}

/**
 * Solves the Budget-Constrained Diet Knapsack Problem
 * 
 * @param {Object} params
 * @param {number} params.dailyBudget - Daily cap in INR (e.g. 120)
 * @param {string} params.dietPreference - 'veg', 'non-veg', 'vegan'
 * @param {string} params.fitnessGoal - 'Muscle Gain', 'Weight Loss', 'Maintenance'
 * @param {number} [params.priceMultiplier=1.0] - Regional price adjustment slider (e.g. 0.9 to 1.3)
 * @param {Array<string>} [params.pantryIngredients=[]] - Free leftover ingredients to discount
 * @returns {Object} Optimized meal plan with macro breakdown and cost verification
 */
function generateOptimizedMealPlan({
  dailyBudget = 120,
  dietPreference = 'non-veg',
  fitnessGoal = 'Muscle Gain',
  priceMultiplier = 1.0,
  pantryIngredients = []
}) {
  const db = getDatabase();
  const normalizedDiet = (dietPreference || 'veg').toLowerCase();
  const rda = calculateRDATargets(fitnessGoal);

  // Filter allowed diet types in SQL
  let dietFilterSql = '';
  if (normalizedDiet === 'vegan') {
    dietFilterSql = "AND diet_type = 'vegan'";
  } else if (normalizedDiet === 'veg') {
    dietFilterSql = "AND diet_type IN ('veg', 'vegan')";
  } else {
    // non-veg can include any dish
    dietFilterSql = "AND diet_type IN ('non-veg', 'veg', 'vegan')";
  }

  const recipes = db.query(`
    SELECT * FROM IndianStapleRecipes
    WHERE 1=1 ${dietFilterSql}
    ORDER BY cost ASC
  `);

  if (!recipes || recipes.length === 0) {
    throw new Error(`No recipes found for diet preference: ${dietPreference}`);
  }

  // Parse JSON columns & apply regional price multiplier & pantry discounts
  const processedRecipes = recipes.map(r => {
    let rawIngredients = [];
    let instructions = [];
    let tags = [];
    try { rawIngredients = JSON.parse(r.ingredients_json); } catch (e) { rawIngredients = []; }
    try { instructions = JSON.parse(r.instructions_json); } catch (e) { instructions = []; }
    try { tags = JSON.parse(r.tags_json); } catch (e) { tags = []; }

    // Check if any pantry ingredients are in this recipe to give a cost discount
    let pantryDiscount = 0;
    if (Array.isArray(pantryIngredients) && pantryIngredients.length > 0) {
      for (const ing of rawIngredients) {
        const matchesPantry = pantryIngredients.some(p =>
          ing.name.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(ing.name.toLowerCase())
        );
        if (matchesPantry) {
          pantryDiscount += (ing.cost * 0.7); // 70% of ingredient cost already in dorm
        }
      }
    }

    const effectiveCost = Math.max(5, Math.round(((r.cost * priceMultiplier) - pantryDiscount) * 10) / 10);

    return {
      id: r.id,
      name: r.name,
      meal_type: r.meal_type,
      diet_type: r.diet_type,
      calories: r.calories,
      protein: r.protein,
      carbs: r.carbs,
      fats: r.fats,
      cost: effectiveCost,
      baseCost: r.cost,
      prep_time: r.prep_time,
      primary_protein: r.primary_protein,
      is_hostel_friendly: r.is_hostel_friendly === 1,
      ingredients: rawIngredients,
      instructions,
      tags
    };
  });

  // Group by meal slot
  const breakfasts = processedRecipes.filter(r => r.meal_type === 'breakfast');
  const lunches = processedRecipes.filter(r => r.meal_type === 'lunch');
  const snacks = processedRecipes.filter(r => r.meal_type === 'snack');
  const dinners = processedRecipes.filter(r => r.meal_type === 'dinner');

  if (breakfasts.length === 0 || lunches.length === 0 || dinners.length === 0) {
    throw new Error('Insufficient recipe pool for the requested diet filters.');
  }

  const includeSnack = dailyBudget >= 85 && snacks.length > 0;
  const candidateSnacks = includeSnack ? snacks : [null];

  let bestCombination = null;
  let highestScore = -Infinity;

  // Find min possible dinner and snack costs for branch-and-bound pruning
  const minDinnerCost = Math.min(...dinners.map(d => d.cost));
  const minSnackCost = includeSnack ? Math.min(...snacks.map(s => s.cost)) : 0;

  // Search combinations with bounded branch-and-bound
  for (const b of breakfasts) {
    if (b.cost + minDinnerCost + minSnackCost > dailyBudget) continue;

    for (const l of lunches) {
      // Variety Constraint: Avoid same primary protein for consecutive meals (e.g. egg then egg, soya then soya)
      if (b.primary_protein === l.primary_protein && b.primary_protein !== 'general') continue;

      const subtotalBL = b.cost + l.cost;
      if (subtotalBL + minDinnerCost + minSnackCost > dailyBudget) continue;

      for (const s of candidateSnacks) {
        const snackCost = s ? s.cost : 0;
        if (s && l.primary_protein === s.primary_protein && s.primary_protein !== 'general') continue;

        const subtotalBLS = subtotalBL + snackCost;
        if (subtotalBLS + minDinnerCost > dailyBudget) continue;

        for (const d of dinners) {
          const totalCost = subtotalBLS + d.cost;
          if (totalCost > dailyBudget) continue;

          // Variety check with preceding meal
          const prevMeal = s || l;
          if (prevMeal.primary_protein === d.primary_protein && d.primary_protein !== 'general') continue;

          const totalCalories = b.calories + l.calories + (s ? s.calories : 0) + d.calories;
          const totalProtein = b.protein + l.protein + (s ? s.protein : 0) + d.protein;
          const totalCarbs = b.carbs + l.carbs + (s ? s.carbs : 0) + d.carbs;
          const totalFats = b.fats + l.fats + (s ? s.fats : 0) + d.fats;

          // Objective function scoring
          // In Knapsack optimization, we maximize absolute nutritional gain (protein & energy)
          // while respecting the budget constraint and rewarding cost-efficiency
          const proteinPerRupee = totalProtein / totalCost;
          const calorieDiff = Math.abs(totalCalories - rda.targetCalories);
          const calorieAccuracy = Math.max(0, 1 - (calorieDiff / rda.targetCalories));

          // Variety metric: Enforce diverse, non-repetitive protein sources across the day
          const proteinSources = new Set([b.primary_protein, l.primary_protein, d.primary_protein]);
          if (s) proteinSources.add(s.primary_protein);
          const requiredDistinct = s ? 4 : 3;

          // Strongly penalize duplicate protein sources on the same day (e.g. Soya for both Lunch & Dinner)
          if (proteinSources.size < requiredDistinct) {
            continue; // Variety constraint: each meal slot must feature a unique primary protein source
          }
          const varietyRatio = 1.0;

          // Budget utilization: reward full healthy utilization of available daily budget
          const budgetUtilization = totalCost / dailyBudget;

          // Target goal alignment bonus
          let goalBonus = 0;
          if (fitnessGoal === 'Muscle Gain') {
            goalBonus += (totalProtein * 2.0); // Reward higher protein directly
          } else if (fitnessGoal === 'Weight Loss') {
            goalBonus += (calorieAccuracy * 40);
          } else {
            goalBonus += (totalProtein * 1.0) + (calorieAccuracy * 20);
          }

          const score = (totalProtein * 2.2) +
                        (proteinPerRupee * 45) +
                        (calorieAccuracy * 60) +
                        (varietyRatio * 35) +
                        (budgetUtilization * 25) +
                        goalBonus;

          if (score > highestScore) {
            highestScore = score;
            bestCombination = {
              breakfast: b,
              lunch: l,
              snack: s,
              dinner: d,
              totalCost: Math.round(totalCost * 10) / 10,
              totalCalories: Math.round(totalCalories),
              totalProtein: Math.round(totalProtein * 10) / 10,
              totalCarbs: Math.round(totalCarbs * 10) / 10,
              totalFats: Math.round(totalFats * 10) / 10,
              score: Math.round(score * 10) / 10
            };
          }
        }
      }
    }
  }

  // If no combination fit strictly under budget (e.g., budget too low)
  if (!bestCombination) {
    // Determine minimum budget required for this filter
    const minB = Math.min(...breakfasts.map(x => x.cost));
    const minL = Math.min(...lunches.map(x => x.cost));
    const minD = Math.min(...dinners.map(x => x.cost));
    const minRequired = minB + minL + minD;
    throw new Error(
      `Budget ₹${dailyBudget} is too restrictive for ${dietPreference} diet. Minimum feasible 3-meal plan cost is ₹${minRequired}/day.`
    );
  }

  const meals = [
    { slot: 'Breakfast', slotKey: 'breakfast', ...bestCombination.breakfast },
    { slot: 'Lunch', slotKey: 'lunch', ...bestCombination.lunch }
  ];
  if (bestCombination.snack) {
    meals.push({ slot: 'Snack', slotKey: 'snack', ...bestCombination.snack });
  }
  meals.push({ slot: 'Dinner', slotKey: 'dinner', ...bestCombination.dinner });

  return {
    success: true,
    meta: {
      dailyBudget,
      remainingBudget: Math.round((dailyBudget - bestCombination.totalCost) * 10) / 10,
      dietPreference,
      fitnessGoal,
      priceMultiplier,
      rdaTargets: rda
    },
    totals: {
      cost: bestCombination.totalCost,
      calories: bestCombination.totalCalories,
      protein: bestCombination.totalProtein,
      carbs: bestCombination.totalCarbs,
      fats: bestCombination.totalFats
    },
    macroPercentages: {
      proteinPct: Math.round((bestCombination.totalProtein * 4 / bestCombination.totalCalories) * 100),
      carbsPct: Math.round((bestCombination.totalCarbs * 4 / bestCombination.totalCalories) * 100),
      fatsPct: Math.round((bestCombination.totalFats * 9 / bestCombination.totalCalories) * 100)
    },
    meals
  };
}

module.exports = {
  calculateRDATargets,
  generateOptimizedMealPlan
};
