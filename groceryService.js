/**
 * Smart Grocery Shopping List Generator
 * Consolidates weekly required ingredients into categorized shopping lists
 * with estimated bulk grocery store prices and bulk savings calculations.
 */

const { getDatabase } = require('../config/database');

/**
 * Generates an aggregated weekly (7-day) grocery shopping list
 * 
 * @param {Array<Object>} meals - The daily meals (or 7 days of meals)
 * @param {number} [days=7] - Number of days to scale the list for
 * @param {number} [priceMultiplier=1.0] - Regional pricing adjustment
 * @returns {Object} Categorized shopping list, weekly totals, and bulk savings analysis
 */
function generateWeeklyGroceryList(meals, days = 7, priceMultiplier = 1.0) {
  const db = getDatabase();
  const bulkDbItems = db.query('SELECT * FROM NutrientCosts');
  const bulkMap = new Map();
  for (const b of bulkDbItems) {
    bulkMap.set(b.name.toLowerCase(), b);
  }

  const categoryBuckets = {
    'Proteins & Pulses': [],
    'Grains & Staples': [],
    'Dairy & Poultry': [],
    'Nuts & Healthy Fats': [],
    'Fresh Produce': [],
    'Spices & Condiments': []
  };

  const itemMap = new Map();

  // Aggregate ingredients from all meals across 'days' (default 7 days)
  for (const meal of meals) {
    if (!Array.isArray(meal.ingredients)) continue;

    for (const ing of meal.ingredients) {
      const cleanName = ing.name.split('(')[0].trim();
      const key = cleanName.toLowerCase();

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          name: cleanName,
          rawQtyExample: ing.qty,
          singleCost: ing.cost,
          totalOccurrences: 0,
          weeklyCost: 0,
          category: 'Spices & Condiments', // default fallback
          bulkAvailable: false,
          bulkSize: 'Standard Retail Pack',
          bulkPrice: 0,
          estimatedSavings: 0
        });
      }

      const item = itemMap.get(key);
      item.totalOccurrences += days;
      item.weeklyCost += (ing.cost * days);
    }
  }

  // Cross-reference with NutrientCosts for category and bulk rates
  let totalEstimatedWeeklySpend = 0;
  let totalBulkOptionSpend = 0;

  for (const [key, item] of itemMap.entries()) {
    // Try fuzzy match in bulk table
    let matchedBulk = null;
    for (const [bulkKey, bulkVal] of bulkMap.entries()) {
      if (key.includes(bulkKey) || bulkKey.includes(key)) {
        matchedBulk = bulkVal;
        break;
      }
    }

    if (matchedBulk) {
      item.category = matchedBulk.category;
      item.bulkAvailable = true;
      item.bulkSize = matchedBulk.bulk_size;
      item.bulkPrice = Math.round(matchedBulk.bulk_price * priceMultiplier);
      // Bulk buying yields ~18% cost reduction compared to daily retail portion buying
      const discountedWeekly = Math.round(item.weeklyCost * 0.82);
      item.estimatedSavings = Math.max(0, item.weeklyCost - discountedWeekly);
      item.weeklyCost = Math.round(item.weeklyCost * priceMultiplier);
    } else {
      // Categorize based on keywords
      const lk = key.toLowerCase();
      if (lk.includes('egg') || lk.includes('paneer') || lk.includes('dahi') || lk.includes('curd') || lk.includes('milk') || lk.includes('chicken') || lk.includes('fish') || lk.includes('tofu')) {
        item.category = 'Dairy & Poultry';
      } else if (lk.includes('dal') || lk.includes('soya') || lk.includes('chana') || lk.includes('rajma') || lk.includes('chole') || lk.includes('moong') || lk.includes('sprout')) {
        item.category = 'Proteins & Pulses';
      } else if (lk.includes('rice') || lk.includes('atta') || lk.includes('bread') || lk.includes('oats') || lk.includes('poha') || lk.includes('sooji') || lk.includes('besan') || lk.includes('sattu') || lk.includes('flour')) {
        item.category = 'Grains & Staples';
      } else if (lk.includes('peanut') || lk.includes('oil') || lk.includes('ghee') || lk.includes('makhana') || lk.includes('seeds')) {
        item.category = 'Nuts & Healthy Fats';
      } else if (lk.includes('onion') || lk.includes('tomato') || lk.includes('potato') || lk.includes('palak') || lk.includes('banana') || lk.includes('lemon') || lk.includes('chilli') || lk.includes('ginger') || lk.includes('cucumber') || lk.includes('spinach')) {
        item.category = 'Fresh Produce';
      } else {
        item.category = 'Spices & Condiments';
      }
      item.weeklyCost = Math.round(item.weeklyCost * priceMultiplier);
      item.estimatedSavings = Math.round(item.weeklyCost * 0.10);
    }

    totalEstimatedWeeklySpend += item.weeklyCost;
    totalBulkOptionSpend += (item.weeklyCost - item.estimatedSavings);

    if (categoryBuckets[item.category]) {
      categoryBuckets[item.category].push(item);
    } else {
      categoryBuckets['Spices & Condiments'].push(item);
    }
  }

  // Sort each category by highest cost item first
  for (const cat in categoryBuckets) {
    categoryBuckets[cat].sort((a, b) => b.weeklyCost - a.weeklyCost);
  }

  return {
    days,
    totalItems: itemMap.size,
    totalEstimatedWeeklySpend: Math.round(totalEstimatedWeeklySpend),
    bulkDiscountedWeeklySpend: Math.round(totalBulkOptionSpend),
    potentialBulkSavings: Math.round(totalEstimatedWeeklySpend - totalBulkOptionSpend),
    savingsPercentage: Math.round(((totalEstimatedWeeklySpend - totalBulkOptionSpend) / (totalEstimatedWeeklySpend || 1)) * 100),
    categories: categoryBuckets
  };
}

module.exports = {
  generateWeeklyGroceryList
};
