// Normalizes raw OCR item name candidates into human-readable display names
// and a lowercase form suitable for category classification.

// ─── Known unit abbreviations — must NOT be stripped as trailing OCR artifacts ──
const UNIT_TOKENS = new Set([
  'LB', 'OZ', 'KG', 'ML', 'GAL', 'QT', 'PT', 'FL', 'G', 'L',
  'CT', 'EA', 'PC', 'PK', 'PCS', 'FT', 'IN',
]);

// Short all-caps tokens that stay uppercase in the final display
const PRESERVE_UPPER = new Set([...UNIT_TOKENS, 'BBQ', 'BPA']);

// ─── Abbreviation map ────────────────────────────────────────────────────────
// Keys MUST be ALL-CAPS (comparison is done with toUpperCase()).
const ABBREV_MAP: Record<string, string> = {
  // ── Protein ────────────────────────────────────────────────────────────────
  CHKN: 'Chicken', CHCK: 'Chicken', CKNN: 'Chicken', CHCKN: 'Chicken', CHCKNN: 'Chicken',
  BRST: 'Breast',
  THGH: 'Thigh',
  BNLS: 'Boneless',
  SKNLS: 'Skinless',
  GRND: 'Ground',
  BF: 'Beef',
  STK: 'Steak',
  SIRLOIN: 'Sirloin',
  RND: 'Round',
  RSTBF: 'Roast Beef',
  TRK: 'Turkey', TKY: 'Turkey',
  GRND_BF: 'Ground Beef',
  SLMN: 'Salmon',
  SHRMP: 'Shrimp',
  TILAPIA: 'Tilapia',
  PORK: 'Pork',
  LAMB: 'Lamb',
  BNLS_CHKN: 'Boneless Chicken',
  BCN: 'Bacon',
  SSTG: 'Sausage', SAUS: 'Sausage',
  HMBRG: 'Hamburger',
  FILT: 'Fillet', FLTD: 'Filleted',

  // ── Dairy ──────────────────────────────────────────────────────────────────
  MLK: 'Milk',
  CHS: 'Cheese', CHSE: 'Cheese', CHDR: 'Cheddar', CHDDR: 'Cheddar', MOZZ: 'Mozzarella',
  PARM: 'Parmesan', SWSS: 'Swiss', PROV: 'Provolone',
  AMER: 'American',
  YGT: 'Yogurt', YGRT: 'Yogurt',
  BTR: 'Butter',
  CRM: 'Cream', HVY_CRM: 'Heavy Cream', SOUR_CRM: 'Sour Cream',

  // ── Produce ────────────────────────────────────────────────────────────────
  ORG: 'Organic', ORGC: 'Organic',
  LRG: 'Large', LG: 'Large',
  SM: 'Small',
  MED: 'Medium', MD: 'Medium',
  XL: 'Extra Large', XLG: 'Extra Large', EXLRG: 'Extra Large',
  JMB: 'Jumbo', JBO: 'Jumbo',
  YLLW: 'Yellow', YLW: 'Yellow',
  GRN: 'Green',
  BROC: 'Broccoli',
  CAULF: 'Cauliflower', CAUL: 'Cauliflower',
  ZUCC: 'Zucchini',
  SPRTS: 'Sprouts', BRSLSPRTS: 'Brussels Sprouts',
  ASPAR: 'Asparagus',
  ARTCHK: 'Artichoke',
  AVOC: 'Avocado',
  STRWB: 'Strawberry', STRW: 'Strawberry', STRWBRY: 'Strawberry',
  BLBRRY: 'Blueberry', BLBRRS: 'Blueberries',
  RSPBRRY: 'Raspberry', RSPB: 'Raspberry',
  BLKBRRY: 'Blackberry',
  PINEAP: 'Pineapple',
  WTRMLN: 'Watermelon', WTRMLNN: 'Watermelon',
  CNTLP: 'Cantaloupe',
  CLMNT: 'Clementine',
  TNGR: 'Tangerine',
  GRPFRT: 'Grapefruit',
  LMNADE: 'Lemonade',
  HEIRM: 'Heirloom',
  BNNNS: 'Bananas', BNNS: 'Bananas', BNNNAS: 'Bananas',
  CRRT: 'Carrot', CRRTS: 'Carrots',
  ONON: 'Onion', ONNON: 'Onion',
  GRLC: 'Garlic',
  PPR: 'Pepper', PPRS: 'Peppers', BLKPPR: 'Black Pepper',
  LTTCE: 'Lettuce', LTCE: 'Lettuce',
  SPNCH: 'Spinach',
  MSHRM: 'Mushroom', MSHRMS: 'Mushrooms',
  TMTO: 'Tomato', TMT: 'Tomato', TMTOS: 'Tomatoes',
  PTTO: 'Potato', PTTOES: 'Potatoes', PTTOS: 'Potatoes',

  // ── Packaging / form ──────────────────────────────────────────────────────
  WHL: 'Whole',
  SLCD: 'Sliced', SLC: 'Sliced',
  SHTD: 'Shredded', SHRD: 'Shredded',
  CUT: 'Cut',
  FRZN: 'Frozen',
  FRSH: 'Fresh',
  DRYD: 'Dried',
  SMKD: 'Smoked',
  RSTD: 'Roasted',
  GRLD: 'Grilled',
  TSTD: 'Toasted',
  BKFD: 'Baked',
  ASST: 'Assorted', ASSRT: 'Assorted',
  VRTY: 'Variety',
  PKG: 'Package',
  PK: 'Pack',
  BG: 'Bag',
  BTL: 'Bottle',
  CN: 'Can',
  JR: 'Jar',
  BOX: 'Box',

  // ── Nutrition modifiers ───────────────────────────────────────────────────
  WW: 'Whole Wheat', WHLWHT: 'Whole Wheat',
  WG: 'Whole Grain', WHTGRN: 'Whole Grain',
  FF: 'Fat Free',
  LF: 'Low Fat',
  RF: 'Reduced Fat',
  NS: 'No Salt',
  UNSLT: 'Unsalted',
  NAS: 'No Added Sugar',
  NAT: 'Natural',
  FLVRD: 'Flavored',

  // ── Units (display-only — kept in name for context) ───────────────────────
  OZ: 'oz', LB: 'lb', KG: 'kg', GAL: 'gal',
  CT: 'ct', ML: 'ml', QT: 'qt', PT: 'pt',

  // ── Store brands ──────────────────────────────────────────────────────────
  GV: 'Great Value',           // Walmart
  KS: 'Kirkland Signature',    // Costco
  KIRKLND: 'Kirkland Signature',
  SE: 'Store Brand',

  // ── Pantry / beverages ────────────────────────────────────────────────────
  VEG: 'Vegetable', VEGS: 'Vegetables',
  FRT: 'Fruit', FRTS: 'Fruits',
  BRD: 'Bread',
  SODA: 'Soda',
  JCE: 'Juice',
  WTR: 'Water',
  SPRT: 'Sport',
  OJ: 'Orange Juice',
  AJ: 'Apple Juice',
  GRPFRT_JCE: 'Grapefruit Juice',
  LMNADE_JCE: 'Lemonade',
  CHIP: 'Chips', CHPS: 'Chips',
  CRNCH: 'Crunchy',
  PRTZL: 'Pretzel',
  PPRCN: 'Popcorn',
  GRNL: 'Granola',
  TRLMX: 'Trail Mix',
  PNTBTR: 'Peanut Butter',
  ALMBTR: 'Almond Butter',
  BBQ: 'BBQ',
  CHOC: 'Chocolate', CHCLT: 'Chocolate',
  VNLA: 'Vanilla',
  CINN: 'Cinnamon', CNMN: 'Cinnamon',
  BKNG_PWD: 'Baking Powder',
  PSTA: 'Pasta',
  SPGHTTI: 'Spaghetti', SPGHT: 'Spaghetti', SPGHTI: 'Spaghetti',
  LSNG: 'Lasagna',
  SCE: 'Sauce', SUCE: 'Sauce', SCE_TOM: 'Tomato Sauce',
  COFF: 'Coffee', COF: 'Coffee',
  WHT: 'White',
  CLNTRO: 'Cilantro',
  PRSRV: 'Preserves', JLLY: 'Jelly',
  HMMUS: 'Hummus',
  SLSA: 'Salsa',
  GUCMLE: 'Guacamole',

  // ── Household / personal care ─────────────────────────────────────────────
  DETG: 'Detergent',
  LNDRY: 'Laundry',
  SHPOO: 'Shampoo',
  CNDTNR: 'Conditioner',
  MTHWSH: 'Mouthwash',
};

// ─── Fuzzy abbreviation matching ─────────────────────────────────────────────
// Precomputed once to avoid Object.keys() on every token expansion.
const ABBREV_KEYS = Object.keys(ABBREV_MAP);

// Returns true iff strings differ by exactly one edit (substitution, insertion, or deletion).
function isEditDistance1(a: string, b: string): boolean {
  const la = a.length, lb = b.length;
  const diff = la - lb;
  if (diff < -1 || diff > 1) return false;
  if (diff === 0) {
    let edits = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i] && ++edits > 1) return false;
    return edits === 1;
  }
  const [s, l] = diff < 0 ? [a, b] : [b, a];
  let si = 0, li = 0, skipped = false;
  while (si < s.length && li < l.length) {
    if (s[si] !== l[li]) {
      if (skipped) return false;
      skipped = true;
      li++;
    } else { si++; li++; }
  }
  return true;
}

// Expands a single token: exact match first, then unambiguous edit-distance-1 fuzzy match.
// Minimum length 5 prevents common 4-letter English words from false-positive matching.
function expandToken(token: string): string {
  const up = token.toUpperCase();
  const exact = ABBREV_MAP[up];
  if (exact !== undefined) return exact;
  if (up.length < 5) return token;
  let match: string | null = null;
  for (const key of ABBREV_KEYS) {
    if (isEditDistance1(up, key)) {
      if (match !== null) return token; // ambiguous — don't guess
      match = key;
    }
  }
  return match !== null ? ABBREV_MAP[match] : token;
}

// ─── PLU codes — 4-5 digit produce lookup numbers ────────────────────────────
const PLU_RE = /\b\d{4,5}\b/g;

// ─── Concatenated size tokens ─────────────────────────────────────────────────
// Splits "12OZ" → "12 OZ", "1GAL" → "1 GAL", "64FL" → "64 FL"
const CONCAT_SIZE_RE = /(\d+)(OZ|LB|KG|ML|GAL|QT|PT|FL|CT|PK|PCS|PC|EA)\b/gi;

// ─── Leading quantity ─────────────────────────────────────────────────────────
const LEADING_QTY_RE = /^\d+\s*[@x×]?\s*(EA|LB|KG|OZ|PC|PK|PCS|CT)?\s*/i;

// ─── Trailing OCR tax-flag artifact ───────────────────────────────────────────
// Tax flags are 1-3 char uppercase codes appended after prices: " F", " T", " Tft", " Nf".
// Unit abbreviations (LB, OZ, …) look identical — excluded via UNIT_TOKENS.
const TRAILING_ARTIFACT_RE = /\s+([A-Z][a-zA-Z]{0,2})\s*$/;

function stripTrailingArtifact(s: string): string {
  const m = s.match(TRAILING_ARTIFACT_RE);
  if (!m) return s;
  if (UNIT_TOKENS.has(m[1].toUpperCase())) return s; // preserve units — don't strip
  return s.slice(0, s.length - m[0].length);
}

// ─── Trailing per-unit residue ────────────────────────────────────────────────
const TRAILING_UNIT_RE = /\s*[@/]\s*\w+\s*$/;

// ─── Title case ───────────────────────────────────────────────────────────────
function titleCaseToken(token: string): string {
  const up = token.toUpperCase();
  if (PRESERVE_UPPER.has(up)) return up;
  if (token.length <= 1) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function expandAbbreviations(s: string): string {
  return s.split(/\s+/).map(expandToken).join(' ');
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface NormalizedName {
  display: string;       // human-readable title-cased name for the UI
  forCategory: string;   // lowercase for keyword matching in categoryClassifier
}

export function normalizeName(raw: string): NormalizedName {
  let s = raw;

  // Strip price patterns (belt-and-suspenders; classifier already did this)
  s = s.replace(/\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}|\$?\s*\d+\.\d{2}/g, '');

  // Strip PLU codes (4-5 digit produce lookup numbers)
  s = s.replace(PLU_RE, '');

  // Split concatenated size tokens before abbreviation expansion
  s = s.replace(CONCAT_SIZE_RE, '$1 $2');

  // Strip leading quantity prefix
  s = s.replace(LEADING_QTY_RE, '');

  // Strip trailing tax-flag artifact — unit-aware, will NOT strip "LB", "OZ", etc.
  s = stripTrailingArtifact(s);

  // Strip trailing per-unit residue (e.g., "@ LB", "/ KG")
  s = s.replace(TRAILING_UNIT_RE, '');

  // Remove non-word chars except space, hyphen, apostrophe
  s = s.replace(/[^\w\s'-]/g, ' ');

  // Collapse whitespace
  s = s.replace(/\s{2,}/g, ' ').trim();

  // Expand abbreviations (operates on whitespace-split tokens)
  s = expandAbbreviations(s);

  // Collapse again after expansion
  s = s.replace(/\s{2,}/g, ' ').trim();

  // Title case
  const display = s.split(/\s+/).map(titleCaseToken).join(' ');

  return { display, forCategory: display.toLowerCase() };
}
