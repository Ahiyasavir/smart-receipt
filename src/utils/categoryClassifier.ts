import { Category } from '../types';

// ─── Keyword lists ────────────────────────────────────────────────────────────
// Each keyword is matched as a whole word (word-boundary regex), not a substring.
// Items are scored by number of matching keywords → highest wins.
// Store brand names are intentionally absent here — they're handled at merchant level.

const RULES: Record<Exclude<Category, 'other'>, string[]> = {
  food: [
    // Prepared / restaurant food
    'coffee', 'latte', 'espresso', 'cappuccino', 'americano', 'macchiato', 'mocha', 'flat white',
    'burger', 'pizza', 'sandwich', 'wrap', 'taco', 'burrito', 'sushi', 'ramen', 'pho', 'pad thai',
    'fries', 'nuggets', 'wings', 'gyro', 'pita', 'falafel', 'kebab', 'shawarma',
    'shake', 'smoothie', 'frappe', 'milkshake', 'iced tea', 'cold brew',
    'donut', 'bagel', 'muffin', 'croissant', 'pastry', 'waffle', 'pancake', 'crepe',
    'beer', 'wine', 'cocktail', 'lager', 'ale', 'spirits', 'liquor', 'whiskey', 'vodka', 'gin',
    'restaurant', 'cafe', 'diner', 'bistro', 'eatery', 'grill', 'bar', 'pub', 'tavern',
    'takeout', 'delivery', 'combo', 'meal', 'lunch', 'dinner', 'breakfast', 'brunch',
    'mcdonalds', 'starbucks', 'subway', 'kfc', 'dominos', 'chipotle', 'dunkin',
    // Israeli food & restaurants
    'cofix', 'aroma', 'cafe cafe', 'roladin', 'dr. shakshuka', 'benedict', 'taizu', 'black', 'white',
    'hummus', 'tahini', 'jachnun', 'sabich', 'laffa', 'malabi', 'knafeh', 'burekas', 'bourekas',
    'schnitzel', 'shnitzel', 'shakshuka', 'cholent', 'chamin', 'krembo', 'bisli', 'bamba',
    'פלאפל', 'שווארמה', 'חומוס', 'שקשוקה', 'בורקס', 'לאפה', 'פיתה', 'שניצל',
    'קפה', 'מסעדה', 'ארוחה', 'צהריים', 'ערב', 'בוקר', 'ברנץ',
    'מקדונלד', 'סטארבקס', 'ברגר קינג', 'דומינו', 'פיצה', 'סושי',
  ],
  groceries: [
    // Dairy
    'milk', 'cheese', 'butter', 'cream', 'yogurt', 'egg', 'eggs', 'dairy',
    'cheddar', 'mozzarella', 'parmesan', 'swiss', 'provolone', 'brie', 'feta', 'ricotta',
    // Meat & seafood
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'bacon', 'sausage', 'deli', 'pepperoni',
    'steak', 'sirloin', 'tenderloin', 'ribs', 'ham', 'salami', 'chorizo', 'bratwurst',
    'fish', 'salmon', 'tuna', 'shrimp', 'tilapia', 'cod', 'halibut', 'crab', 'lobster', 'scallop',
    // Produce
    'apple', 'banana', 'orange', 'grape', 'berry', 'strawberry', 'blueberry',
    'raspberry', 'blackberry', 'cherry', 'peach', 'pear', 'plum', 'mango',
    'pineapple', 'watermelon', 'cantaloupe', 'melon', 'honeydew',
    'kiwi', 'papaya', 'apricot', 'nectarine', 'clementine', 'tangerine', 'grapefruit',
    'lemon', 'lime', 'avocado', 'pomegranate', 'fig', 'date',
    'tomato', 'potato', 'onion', 'garlic', 'carrot', 'broccoli', 'cauliflower',
    'lettuce', 'spinach', 'kale', 'arugula', 'cabbage', 'celery', 'cucumber',
    'zucchini', 'squash', 'pepper', 'mushroom', 'asparagus', 'artichoke', 'eggplant',
    'corn', 'pea', 'bean', 'lentil', 'chickpea', 'edamame', 'leek', 'scallion',
    // Pantry
    'bread', 'rice', 'pasta', 'noodle', 'cereal', 'oat', 'oatmeal', 'granola', 'quinoa',
    'flour', 'sugar', 'salt', 'oil', 'vinegar', 'sauce', 'ketchup', 'mustard', 'sriracha',
    'mayo', 'mayonnaise', 'jam', 'jelly', 'honey', 'syrup', 'peanut', 'nutella', 'tahini',
    'almond', 'cashew', 'walnut', 'pistachio', 'pecan', 'sunflower', 'pumpkin seed',
    'soup', 'broth', 'stock', 'tofu', 'hummus', 'salsa', 'guacamole',
    'chips', 'crackers', 'pretzel', 'popcorn', 'trail mix', 'granola bar', 'protein bar',
    'cookie', 'chocolate', 'candy', 'gum', 'marshmallow', 'brownie', 'cake',
    // Beverages (retail / packaged)
    'juice', 'soda', 'water', 'tea', 'cocoa', 'cider', 'kombucha', 'lemonade', 'energy drink',
    'sparkling', 'coconut water', 'sports drink', 'gatorade', 'powerade',
    // Household & personal care
    'paper', 'towel', 'tissue', 'napkin', 'toilet',
    'foil', 'plastic', 'wrap', 'bag', 'zipper', 'cling',
    'detergent', 'laundry', 'bleach', 'softener', 'dishwasher', 'sponge', 'scrub',
    'soap', 'shampoo', 'conditioner', 'lotion', 'deodorant', 'toothpaste', 'mouthwash',
    'floss', 'razor', 'feminine', 'diaper', 'wipe', 'sunscreen', 'moisturizer',
    // Signals
    'organic', 'natural', 'fresh', 'frozen', 'produce', 'grocery', 'deli', 'bakery',
    // Israeli grocery signals (Hebrew)
    'שופרסל', 'רמי לוי', 'מגה', 'ויקטורי', 'יוחננוף', 'אושר עד', 'חצי חינם',
    'סופרמרקט', 'מכולת', 'ירקות', 'פירות', 'בשר', 'עוף', 'דגים', 'גבינה', 'חלב',
    'לחם', 'ביצים', 'שמן', 'סוכר', 'קמח', 'אורז', 'פסטה',
  ],
  transport: [
    'gas', 'fuel', 'petrol', 'diesel', 'gasoline', 'unleaded', 'premium',
    'parking', 'toll', 'fare', 'ticket',
    'uber', 'lyft', 'taxi', 'cab', 'rideshare', 'bolt', 'waze', 'gett',
    'bus', 'train', 'subway', 'metro', 'transit', 'tram', 'rail',
    'airline', 'flight', 'airport', 'boarding', 'lufthansa', 'ryanair', 'easyjet', 'el al',
    'rental', 'carwash', 'car wash', 'oil change', 'tire', 'mechanic', 'service',
    'electric charge', 'ev charge', 'charging station',
    // Israeli transport
    'ten biscard', 'rav kav', 'רב קו', 'אגד', 'דן', 'מטרו', 'רכבת', 'אלעל',
    'חניה', 'דלק', 'סונול', 'פז', 'דור אלון', 'yellow', 'גט',
  ],
  entertainment: [
    'movie', 'cinema', 'theater', 'theatre', 'concert', 'ticket', 'show', 'event',
    'game', 'arcade', 'bowling', 'golf', 'amusement', 'escape room', 'laser',
    'netflix', 'spotify', 'hulu', 'disney', 'youtube', 'twitch', 'prime', 'apple tv',
    'hbo', 'paramount', 'peacock', 'crunchyroll', 'deezer', 'tidal',
    'book', 'magazine', 'comic', 'album', 'streaming', 'subscription',
    'museum', 'gallery', 'zoo', 'park', 'aquarium', 'exhibit',
    'steam', 'playstation', 'xbox', 'nintendo', 'gaming',
    // Israeli entertainment
    'yes', 'hot', 'cellcom tv', 'partner tv', 'קולנוע', 'הצגה', 'מוזיאון', 'גן חיות',
    'יס', 'הוט', 'סרט', 'כרטיס',
  ],
  health: [
    'pharmacy', 'medicine', 'drug', 'prescription', 'rx',
    'vitamin', 'supplement', 'capsule', 'tablet', 'pill', 'drops', 'spray',
    'bandage', 'bandaid', 'antiseptic', 'gauze', 'thermometer', 'first aid',
    'doctor', 'clinic', 'hospital', 'dental', 'dentist', 'optician', 'vision',
    'protein', 'probiotic', 'collagen', 'omega', 'melatonin', 'magnesium', 'zinc',
    'gym', 'fitness', 'wellness', 'health', 'yoga', 'pilates', 'crossfit',
    'ibuprofen', 'paracetamol', 'aspirin', 'tylenol', 'advil', 'nyquil',
    'contact lens', 'glasses', 'sunglasses', 'hearing',
    // Israeli health
    'super-pharm', 'superpharm', 'be', 'new-pharm', 'clalit', 'maccabi', 'leumit', 'meuhedet',
    'קופת חולים', 'כללית', 'מכבי', 'לאומית', 'מאוחדת', 'בית מרקחת', 'רופא', 'קליניקה',
    'כושר', 'חדר כושר', 'תרופה', 'ויטמין',
  ],
  shopping: [
    // Clothing
    'shirt', 'pants', 'jeans', 'shorts', 'dress', 'skirt', 'blouse', 'top',
    'jacket', 'coat', 'sweater', 'hoodie', 'hat', 'cap', 'scarf', 'gloves', 'belt',
    'shoe', 'shoes', 'boot', 'sandal', 'sneaker', 'heel', 'loafer', 'slipper',
    'sock', 'underwear', 'bra', 'clothing', 'apparel', 'fashion', 'outfit',
    // Electronics
    'phone', 'laptop', 'tablet', 'headphone', 'earphone', 'airpod', 'earbud',
    'charger', 'cable', 'keyboard', 'mouse', 'monitor', 'speaker', 'webcam',
    'iphone', 'samsung', 'apple', 'android', 'macbook', 'ipad',
    // Accessories
    'watch', 'jewelry', 'ring', 'necklace', 'bracelet', 'earring', 'pendant',
    // Home
    'furniture', 'lamp', 'candle', 'frame', 'pillow', 'blanket', 'curtain', 'rug',
    'pot', 'pan', 'kitchen', 'cutlery', 'glass', 'mug', 'plate',
    // Toys / hobbies
    'toy', 'puzzle', 'lego', 'craft', 'art', 'paint', 'stationery', 'pen', 'notebook',
    // Beauty
    'makeup', 'lipstick', 'mascara', 'foundation', 'perfume', 'cologne', 'nail',
    // Israeli shopping
    'castro', 'renuar', 'golf', 'terminal x', 'factory', 'hoodies', 'kitan', 'delta',
    'ace', 'home center', 'ikea', 'כסף', 'בגד', 'נעל', 'שמלה', 'חולצה', 'מכנס',
  ],
  utilities: [
    'electric', 'electricity', 'internet', 'wifi', 'broadband', 'fiber',
    'phone bill', 'mobile plan', 'cable', 'rent', 'insurance', 'utility', 'utilities',
    'heating', 'gas bill', 'water bill', 'sewage', 'waste', 'trash',
    'subscription fee', 'monthly fee', 'annual fee', 'membership',
    'amazon', 'icloud', 'google one', 'dropbox', 'microsoft', 'adobe',
    // Israeli utilities & telecom
    'hot mobile', 'partner', 'cellcom', 'rami', 'pelephone', 'golan telecom', ' 019',
    'bezeq', 'hot', 'yes', 'iec', 'electric corp', 'mekorot',
    'ארנונה', 'חשמל', 'מים', 'גז', 'ביטוח', 'שכירות', 'ועד בית',
    'פרטנר', 'סלקום', 'פלאפון', 'גולן', 'בזק', 'חברת חשמל',
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
  // US grocery chains
  'Walmart': 'groceries', 'Costco': 'groceries', 'Kroger': 'groceries',
  'Safeway': 'groceries', 'Whole Foods': 'groceries', "Trader Joe's": 'groceries',
  'Target': 'groceries', 'Publix': 'groceries', 'Aldi': 'groceries',
  'Lidl': 'groceries', 'Sprouts': 'groceries', 'Meijer': 'groceries',
  'H-E-B': 'groceries', 'Wegmans': 'groceries', 'Stop & Shop': 'groceries',
  'Food Lion': 'groceries', 'Giant': 'groceries', 'Harris Teeter': 'groceries',
  'Albertsons': 'groceries', 'Vons': 'groceries', 'Ralph': 'groceries',
  'Winn-Dixie': 'groceries', 'Bi-Lo': 'groceries', 'Fresh Market': 'groceries',
  'Trade Fair': 'groceries', 'Associated': 'groceries', 'Key Food': 'groceries',
  // European grocery chains
  'Tesco': 'groceries', 'Sainsbury': 'groceries', 'Asda': 'groceries',
  'Morrisons': 'groceries', 'Waitrose': 'groceries', 'Co-op': 'groceries',
  'Rewe': 'groceries', 'Edeka': 'groceries', 'Netto': 'groceries',
  'Penny': 'groceries', 'Kaufland': 'groceries', 'Spar': 'groceries',
  'Albert Heijn': 'groceries', 'Carrefour': 'groceries', 'Intermarche': 'groceries',
  'Monoprix': 'groceries', 'Casino': 'groceries', 'Leclerc': 'groceries',
  // Pharmacies / health
  'CVS': 'health', 'Walgreens': 'health', 'Rite Aid': 'health',
  'Boots': 'health', 'Lloyds Pharmacy': 'health',
  // Fast food / restaurants
  'McDonalds': 'food', "McDonald's": 'food', 'Starbucks': 'food',
  'Subway': 'food', 'KFC': 'food', 'Burger King': 'food',
  'Dominos': 'food', "Domino's": 'food', 'Pizza Hut': 'food',
  'Chipotle': 'food', 'Taco Bell': 'food', "Wendy's": 'food',
  'Dunkin': 'food', 'Panera': 'food', 'Chick-fil-A': 'food',
  'Five Guys': 'food', 'Shake Shack': 'food', 'Boston Market': 'food',
  // Gas stations
  'Shell': 'transport', 'BP': 'transport', 'Exxon': 'transport',
  'Mobil': 'transport', 'Chevron': 'transport', 'Sunoco': 'transport',
  'Gulf': 'transport', 'Circle K': 'transport', 'Speedway': 'transport',
  // Electronics / shopping
  'Apple': 'shopping', 'Best Buy': 'shopping', 'Amazon': 'shopping',
  'IKEA': 'shopping', 'H&M': 'shopping', 'Zara': 'shopping',
  'Forever 21': 'shopping', 'Old Navy': 'shopping', 'Gap': 'shopping',
  'Nike': 'shopping', 'Adidas': 'shopping', 'Foot Locker': 'shopping',
  // Israeli grocery supermarkets
  'Shufersal': 'groceries', 'שופרסל': 'groceries',
  'Rami Levy': 'groceries', 'רמי לוי': 'groceries',
  'Mega': 'groceries', 'מגה': 'groceries',
  'Victory': 'groceries', 'ויקטורי': 'groceries',
  'Yochananof': 'groceries', 'יוחננוף': 'groceries',
  'Osher Ad': 'groceries', 'אושר עד': 'groceries',
  'Tivtam': 'groceries', 'טיב טעם': 'groceries',
  'AM:PM': 'groceries', 'am:pm': 'groceries',
  'Keshet Taamim': 'groceries', 'קשת טעמים': 'groceries',
  'Hazi Hinam': 'groceries', 'חצי חינם': 'groceries',
  'Mahsane Hashuk': 'groceries', 'מחסני השוק': 'groceries',
  'קואופ': 'groceries',
  // Israeli pharmacies
  'Super-Pharm': 'health', 'SuperPharm': 'health', 'סופר פארם': 'health',
  'Be': 'health', 'New-Pharm': 'health', 'נופרם': 'health',
  'Clalit': 'health', 'כללית': 'health',
  'Maccabi': 'health', 'מכבי': 'health',
  'Leumit': 'health', 'לאומית': 'health',
  // Israeli food / cafes
  'Cofix': 'food', 'קופיקס': 'food',
  'Aroma': 'food', 'ארומה': 'food',
  'Roladin': 'food', 'רולדין': 'food',
  'Cafe Cafe': 'food', 'קפה קפה': 'food',
  'Domino': 'food', 'דומינו': 'food',
  'Burgeranch': 'food', 'בורגר ראנץ': 'food',
  'Japanika': 'food', 'יפניקה': 'food',
  'Pitaim': 'food', 'פיתאים': 'food',
  'Hummus Eliyahu': 'food',
  // Israeli gas stations
  'Paz': 'transport', 'פז': 'transport',
  'Sonol': 'transport', 'סונול': 'transport',
  'Delek': 'transport', 'דלק': 'transport',
  'Dor Alon': 'transport', 'דור אלון': 'transport',
  'Ten': 'transport', 'טן': 'transport',
  // Israeli telecom / utilities
  'Partner': 'utilities', 'פרטנר': 'utilities',
  'Cellcom': 'utilities', 'סלקום': 'utilities',
  'Pelephone': 'utilities', 'פלאפון': 'utilities',
  'Hot Mobile': 'utilities', 'הוט מובייל': 'utilities',
  'Golan Telecom': 'utilities', 'גולן טלקום': 'utilities',
  'Bezeq': 'utilities', 'בזק': 'utilities',
  'Hot': 'utilities', 'הוט': 'utilities',
  // Israeli shopping
  'Castro': 'shopping', 'קסטרו': 'shopping',
  'Renuar': 'shopping', 'רנואר': 'shopping',
  'Golf': 'shopping', 'גולף': 'shopping',
  'Terminal X': 'shopping', 'טרמינל X': 'shopping',
  'Fox': 'shopping', 'פוקס': 'shopping',
  'Ace': 'shopping', 'אייס': 'shopping',
  'Home Center': 'shopping', 'הום סנטר': 'shopping',
  'KSP': 'shopping', 'קיי.אס.פי': 'shopping',
  'Ivory': 'shopping', 'Bug': 'shopping',
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
