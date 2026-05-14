import { Category } from '../types';

// ─── Keyword lists ────────────────────────────────────────────────────────────
// Each keyword is matched as a whole word (word-boundary regex), not a substring.
// Items are scored by number of matching keywords → highest wins.
// Store brand names are intentionally absent here — they're handled at merchant level.

const RULES: Record<Exclude<Category, 'other'>, string[]> = {
  food: [
    // Prepared / restaurant food — bought from a café, diner, or fast-food counter
    'coffee', 'latte', 'espresso', 'cappuccino', 'americano', 'macchiato',
    'burger', 'pizza', 'sandwich', 'wrap', 'taco', 'burrito', 'sushi',
    'fries', 'nuggets', 'wings', 'gyro', 'pita',
    'shake', 'smoothie', 'frappe',
    'donut', 'bagel', 'muffin', 'croissant', 'pastry',
    'beer', 'wine', 'cocktail', 'lager', 'ale', 'spirits', 'liquor',
    'restaurant', 'cafe', 'diner', 'bistro', 'eatery', 'grill', 'bar',
    'takeout', 'delivery', 'combo', 'meal', 'lunch', 'dinner', 'breakfast',
  ],
  groceries: [
    // Dairy
    'milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'eggs',
    'cheddar', 'mozzarella', 'parmesan', 'swiss', 'provolone', 'brie',
    // Meat & seafood
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'bacon', 'sausage',
    'steak', 'sirloin', 'tenderloin', 'ribs', 'ham',
    'fish', 'salmon', 'tuna', 'shrimp', 'tilapia', 'cod', 'halibut', 'crab',
    // Produce
    'apple', 'banana', 'orange', 'grape', 'berry', 'strawberry', 'blueberry',
    'raspberry', 'blackberry', 'cherry', 'peach', 'pear', 'plum', 'mango',
    'pineapple', 'watermelon', 'cantaloupe', 'melon', 'honeydew',
    'kiwi', 'papaya', 'apricot', 'nectarine', 'clementine', 'tangerine', 'grapefruit',
    'lemon', 'lime', 'avocado',
    'tomato', 'potato', 'onion', 'garlic', 'carrot', 'broccoli', 'cauliflower',
    'lettuce', 'spinach', 'kale', 'arugula', 'cabbage', 'celery', 'cucumber',
    'zucchini', 'squash', 'pepper', 'mushroom', 'asparagus', 'artichoke',
    'corn', 'pea', 'bean', 'lentil', 'chickpea',
    // Pantry
    'bread', 'rice', 'pasta', 'noodle', 'cereal', 'oat', 'oatmeal', 'granola',
    'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'ketchup', 'mustard',
    'mayo', 'mayonnaise', 'jam', 'jelly', 'honey', 'syrup', 'peanut',
    'almond', 'cashew', 'walnut', 'pistachio', 'pecan',
    'soup', 'broth', 'stock', 'tofu', 'hummus',
    'chips', 'crackers', 'pretzel', 'popcorn', 'trail',
    'cookie', 'chocolate', 'candy', 'gum',
    // Beverages (retail / packaged)
    'juice', 'soda', 'water', 'tea', 'cocoa', 'cider', 'kombucha', 'lemonade',
    // Household & personal care (bought at the supermarket)
    'paper', 'towel', 'tissue', 'napkin', 'toilet',
    'foil', 'plastic', 'wrap', 'bag', 'zipper',
    'detergent', 'laundry', 'bleach', 'softener', 'dishwasher', 'sponge',
    'soap', 'shampoo', 'conditioner', 'lotion', 'deodorant', 'toothpaste',
    'floss', 'razor', 'feminine', 'diaper', 'wipe',
    // Signals
    'organic', 'natural', 'fresh', 'frozen', 'produce', 'grocery',
  ],
  transport: [
    'gas', 'fuel', 'petrol', 'diesel', 'gasoline',
    'parking', 'toll', 'fare',
    'uber', 'lyft', 'taxi', 'cab',
    'bus', 'train', 'subway', 'metro', 'transit',
    'airline', 'flight', 'airport',
    'rental', 'carwash',
  ],
  entertainment: [
    'movie', 'cinema', 'theater', 'theatre', 'concert', 'ticket', 'show',
    'game', 'arcade', 'bowling', 'golf', 'amusement',
    'netflix', 'spotify', 'hulu', 'disney', 'youtube', 'twitch', 'prime',
    'book', 'magazine', 'comic', 'album', 'streaming', 'subscription',
  ],
  health: [
    'pharmacy', 'medicine', 'drug', 'prescription', 'rx',
    'vitamin', 'supplement', 'capsule', 'tablet', 'pill',
    'bandage', 'bandaid', 'antiseptic', 'gauze', 'thermometer',
    'doctor', 'clinic', 'hospital', 'dental', 'dentist', 'optician',
    'protein', 'probiotic', 'collagen', 'omega',
    'gym', 'fitness', 'wellness', 'health',
  ],
  shopping: [
    'shirt', 'pants', 'jeans', 'shorts', 'dress', 'skirt',
    'jacket', 'coat', 'sweater', 'hoodie', 'hat', 'cap',
    'shoe', 'shoes', 'boot', 'sandal', 'sneaker',
    'sock', 'underwear', 'clothing', 'apparel', 'fashion',
    'phone', 'laptop', 'tablet', 'headphone', 'earphone',
    'charger', 'cable', 'keyboard', 'mouse', 'monitor', 'speaker',
    'watch', 'jewelry', 'ring', 'necklace', 'bracelet',
    'furniture', 'lamp', 'candle', 'frame',
    'toy', 'game', 'puzzle', 'lego',
  ],
  utilities: [
    'electric', 'electricity', 'internet', 'wifi',
    'phone bill', 'cable', 'rent', 'insurance', 'utility',
    'heating', 'gas bill', 'water bill',
  ],
};

// ─── Pre-compiled word-boundary regexes ───────────────────────────────────────
// Built once at module load for efficiency.

type CategoryRegexMap = Record<Exclude<Category, 'other'>, RegExp[]>;

function buildRegexes(): CategoryRegexMap {
  const result = {} as CategoryRegexMap;
  for (const [cat, keywords] of Object.entries(RULES)) {
    result[cat as Exclude<Category, 'other'>] = keywords.map((kw) => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                        .replace(/\s+/g, '\\s+');
      return new RegExp(`\\b${escaped}\\b`, 'i');
    });
  }
  return result;
}

const CATEGORY_REGEXES = buildRegexes();

// ─── Merchant-level default category hints ────────────────────────────────────
// When keyword matching produces no hits, fall back to the merchant's typical category.
const MERCHANT_DEFAULTS: Record<string, Category> = {
  'Walmart': 'groceries',
  'Costco': 'groceries',
  'Kroger': 'groceries',
  'Safeway': 'groceries',
  'Whole Foods': 'groceries',
  "Trader Joe's": 'groceries',
  'Target': 'groceries',
  'Publix': 'groceries',
  'Aldi': 'groceries',
  'Lidl': 'groceries',
  'Sprouts': 'groceries',
  'Meijer': 'groceries',
  'H-E-B': 'groceries',
  'Wegmans': 'groceries',
  'Stop & Shop': 'groceries',
  'Food Lion': 'groceries',
  'Giant': 'groceries',
  'Harris Teeter': 'groceries',
  'CVS': 'health',
  'Walgreens': 'health',
  'Rite Aid': 'health',
};

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyCategory(
  itemName: string,
  merchantHint?: string | null,
): Category {
  // Score each category: count distinct keyword matches
  let bestCat: Category = 'other';
  let bestScore = 0;

  for (const [cat, regexes] of Object.entries(CATEGORY_REGEXES)) {
    let score = 0;
    for (const re of regexes) {
      if (re.test(itemName)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat as Category;
    }
  }

  if (bestScore > 0) return bestCat;

  // No keyword hit — use merchant-level default if available
  if (merchantHint) {
    return MERCHANT_DEFAULTS[merchantHint] ?? 'other';
  }

  return 'other';
}

// ─── Category display metadata ────────────────────────────────────────────────

export const CATEGORY_META: Record<Category, { label: string; color: string; emoji: string }> = {
  food:          { label: 'Food & Drink',  color: '#F59E0B', emoji: '🍔' },
  groceries:     { label: 'Groceries',     color: '#10B981', emoji: '🛒' },
  transport:     { label: 'Transport',     color: '#3B82F6', emoji: '🚗' },
  entertainment: { label: 'Entertainment', color: '#8B5CF6', emoji: '🎬' },
  health:        { label: 'Health',        color: '#EF4444', emoji: '💊' },
  shopping:      { label: 'Shopping',      color: '#EC4899', emoji: '🛍️' },
  utilities:     { label: 'Utilities',     color: '#6B7280', emoji: '💡' },
  other:         { label: 'Other',         color: '#9CA3AF', emoji: '📦' },
};
