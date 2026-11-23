/**
 * Pantry Leftover Optimizer Service
 * Suggests meals incorporating ingredients students already have in their pantry
 * to minimize extra grocery spend.
 */

const { getDatabase } = require('../config/database');

const COMMON_PANTRY_ITEMS = [
  { id: 'rice', name: 'White Rice', category: 'Grains', averageSavingsPerMeal: 6 },
  { id: 'atta', name: 'Whole Wheat Atta', category: 'Grains', averageSavingsPerMeal: 5 },
  { id: 'oil', name: 'Cooking Oil / Ghee', category: 'Cooking Staples', averageSavingsPerMeal: 5 },
  { id: 'onions', name: 'Onions & Garlic', category: 'Fresh Produce', averageSavingsPerMeal: 4 },
  { id: 'salt_spices', name: 'Salt, Turmeric & Chilli Spices', category: 'Condiments', averageSavingsPerMeal: 3 },
  { id: 'tea_coffee', name: 'Tea Leaves / Coffee', category: 'Beverages', averageSavingsPerMeal: 4 },
  { id: 'maggi', name: 'Instant Noodles / Maggi', category: 'Quick Snacks', averageSavingsPerMeal: 14 },
  { id: 'peanuts', name: 'Roasted Peanuts', category: 'Snacks', averageSavingsPerMeal: 6 },
  { id: 'soya', name: 'Soya Chunks', category: 'Proteins', averageSavingsPerMeal: 8 }
];

/**
 * Returns the list of standard pantry items students can check off
 */
function getCommonPantryItems() {
  return COMMON_PANTRY_ITEMS;
}

/**
 * Re-scores and finds top recipe matches utilizing available pantry leftovers
 */
function findPantryOptimizedRecipes({ pantryItemIds = [], dietPreference = 'non-veg' }) {
  const db = getDatabase();
  let dietFilterSql = '';
  const norm = (dietPreference || 'veg').toLowerCase();
  if (norm === 'vegan') dietFilterSql = "AND diet_type = 'vegan'";
  else if (norm === 'veg') dietFilterSql = "AND diet_type IN ('veg', 'vegan')";

  const recipes = db.query(`SELECT * FROM IndianStapleRecipes WHERE 1=1 ${dietFilterSql}`);

  const scoredRecipes = recipes.map(r => {
    let ingredients = [];
    try { ingredients = JSON.parse(r.ingredients_json); } catch (e) {}

    let matchedPantryCount = 0;
    let estimatedRupeeSavings = 0;

    for (const ing of ingredients) {
      const ingLower = ing.name.toLowerCase();
      for (const pId of pantryItemIds) {
        const pDef = COMMON_PANTRY_ITEMS.find(p => p.id === pId);
        if (pDef && ingLower.includes(pDef.name.toLowerCase().split(' ')[0])) {
          matchedPantryCount++;
          estimatedRupeeSavings += Math.min(ing.cost, pDef.averageSavingsPerMeal);
          break;
        }
      }
    }

    const netOutOfPocketCost = Math.max(5, r.cost - estimatedRupeeSavings);

    return {
      id: r.id,
      name: r.name,
      meal_type: r.meal_type,
      diet_type: r.diet_type,
      calories: r.calories,
      protein: r.protein,
      cost: r.cost,
      netOutOfPocketCost,
      estimatedRupeeSavings,
      matchedPantryCount,
      prep_time: r.prep_time,
      is_hostel_friendly: r.is_hostel_friendly === 1
    };
  });

  // Sort by highest pantry match and highest savings
  scoredRecipes.sort((a, b) => b.matchedPantryCount - a.matchedPantryCount || a.netOutOfPocketCost - b.netOutOfPocketCost);

  return {
    selectedPantryItems: pantryItemIds,
    recommendedRecipes: scoredRecipes.slice(0, 10),
    maxSingleMealSavings: Math.max(...scoredRecipes.map(r => r.estimatedRupeeSavings), 0)
  };
}

module.exports = {
  getCommonPantryItems,
  findPantryOptimizedRecipes
};
