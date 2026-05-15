// Classifies each OCR line into a semantic role before item extraction.
// This runs BEFORE any price or name parsing so downstream code operates on labeled data.

export type LineClass =
  | 'item'       // has both a name candidate and a price → likely a purchased product
  | 'total'      // a TOTAL / GRAND TOTAL / SUBTOTAL line
  | 'tax'        // tax / VAT / HST / GST / PST
  | 'payment'    // payment method or tender line
  | 'discount'   // explicit discount / coupon / savings line with a monetary amount
  | 'name_only'  // has a name candidate but no trailing price → may pair with next line
  | 'price_only' // has a price but no usable name → may pair with previous name_only
  | 'noise';     // everything else: headers, addresses, dividers, metadata

export interface ClassifiedLine {
  raw: string;
  trimmed: string;
  lineClass: LineClass;
  price: number | null;          // last price found on the line, null if none
  nameCandidate: string | null;  // cleaned text that could be a product name
  hasTrailingArtifact: boolean;  // ends with a 1-3-char uppercase tax flag like "F", "Tft"
  hadBarcodePrefix: boolean;     // true when a 5-13 digit SKU/barcode was stripped from the line start
  debugReason?: string;          // why this line was classified the way it was (parser transparency)
}

// ─── Unit tokens — must NOT be stripped as trailing OCR artifacts ─────────────
const UNIT_TOKENS = new Set([
  'LB', 'OZ', 'KG', 'ML', 'GAL', 'QT', 'PT', 'FL', 'G', 'L',
  'CT', 'EA', 'PC', 'PK', 'PCS', 'FT', 'IN',
]);

// ─── Pattern groups ──────────────────────────────────────────────────────────

const TOTAL_RE = [
  /\bgrand\s*total\b/i,
  /\bnet\s*total\b/i,
  /\btotal\b/i,
  /\bbalance(\s*(due|forward|owed))?\b/i,
  /\bamount\s*due\b/i,
  /\bsale\s+amount\b/i,   // Whole Foods credit card receipts
  /\btotal\s+amount\b/i,
  /\bcelkem\b/i,           // Czech: "total in all"
  /\bgesamt\b/i,           // German: "total"
  /\bsumme\b/i,            // German: "sum"
  /סה["״]?כ/,             // Hebrew: "total" (סה"כ / סהכ)
  /סכום\s*לתשלום/,         // Hebrew: "amount to pay"
  /לתשלום/,                // Hebrew: "to pay"
  /סכום\s*הקניה/,          // Hebrew: "purchase amount"
  /סה["״]כ\s*לתשלום/,      // Hebrew: "total to pay"
];

const SUBTOTAL_RE = [
  /\bsubtotal\b/i,
  /\bsub[\s-]total\b/i,
  // Fuzzy — catches OCR-garbled SUBTOTAL variants: SUBTOTAI, SUBTOTL, SUBTOTA
  /\bsubtot[a-z]{0,3}\b/i,
];

const TAX_RE = [
  /\btax\b/i,
  /\bsales\s*tax\b/i,
  /\bvat\b/i,
  /\bhst\b/i,
  /\bgst\b/i,
  /\bpst\b/i,
  /\bexcise\b/i,
  /מע["״]מ/,              // Hebrew: VAT (מע"מ)
  /מס\s*ערך\s*מוסף/,       // Hebrew: "value added tax"
];

const PAYMENT_RE = [
  /\btendered\b/i,
  /\bcash\b/i,
  /\bvisa\b/i,
  /\bmastercard\b/i,
  /\bm\/card\b/i,
  /\bamex\b/i,
  /\bamerican\s*express\b/i,
  /\bdiscover\b/i,
  /\bdebit\b/i,
  /\bcredit\b/i,
  /\bebt\b/i,
  /\bsnap\b/i,
  /\bwic\b/i,
  /\bgift\s*(card|cert(ificate)?)\b/i,
  /\bcheck\b/i,
  /\brefund\b/i,
  /\bpayment\b/i,
  /\bapple\s*pay\b/i,
  /\bgoogle\s*pay\b/i,
  /\bchange\b/i,
  /מזומן/,                 // Hebrew: "cash"
  /כרטיס\s*אשראי/,         // Hebrew: "credit card"
  /כרטיס\s*חיוב/,          // Hebrew: "debit card"
  /עודף/,                  // Hebrew: "change"
  /שולם/,                  // Hebrew: "paid"
];

const NOISE_RE = [
  /\bdate\s*[:#]/i,
  /\btime\s*[:#]/i,
  /\bcashier\b/i,
  /\boperator\b/i,
  /\bregister\b/i,
  /\breg\s*[#:]/i,
  /\bterminal\b/i,
  /\btrans(action)?\s*[#:]/i,
  /\binvoice\s*[#:]/i,
  /\breceipt\s*[#:]/i,
  /\bref\s*[#:]/i,
  /\bticket\s*[#:]/i,
  /\border\s*[#:]/i,
  /\bstore\s*[#:]/i,
  /\btel\b|\btelephone\b|\bphone\b/i,
  /\bfax\b/i,
  /www\./i,
  /https?:\/\//i,
  /@[a-zA-Z]/,
  /\bpoints?\b/i,
  /\bsavings?\b/i,
  /\byou\s+saved\b/i,           // "You saved $2.00 today"
  /\bsaved\s/i,                  // "Saved $X" style messages
  /\brewards?\b/i,
  /\bloyalty\b/i,
  /\bmember\b/i,
  /\bbonus\b/i,
  /\bclub\b/i,
  /\bsurvey\b/i,
  /\bfeedback\b/i,
  /\bthank\s*you\b/i,
  /\bplease\s*(come|visit|return)\b/i,
  /\bhave\s*a\b/i,
  /\bcome\s*again\b/i,
  /\bitems?\s*(sold|purchased|count)\b/i,
  /\bdiscounts?\b/i,
  /\bcoupon\b/i,
  /\bpromo\b/i,
  /\bspecial\s*price\b/i,
  /\bqty\b.*\bprice\b/i,
  /\bitem\b.*\bdescription\b/i,
  /\bdescription\b.*\bamount\b/i,
  /\breceipt\b/i,
  /\bzlevneno\b/i,         // Czech: "discounted" — price-markdown indicator, not a purchased item
  /תאריך/,                 // Hebrew: "date"
  /שעה/,                   // Hebrew: "time"
  /קופאי/,                 // Hebrew: "cashier"
  /מספר\s*קבלה/,           // Hebrew: "receipt number"
  /מספר\s*עסקה/,           // Hebrew: "transaction number"
  /כתובת/,                 // Hebrew: "address"
  /טלפון/,                 // Hebrew: "telephone"
  /תודה\s*שקנית/,          // Hebrew: "thank you for shopping"
  /תודה\s*על\s*ה/,         // Hebrew: "thank you for the..."
  /ניקוד/,                 // Hebrew: "points"
  /חברי\s*מועדון/,         // Hebrew: "club members"
  /מספר\s*חנות/,           // Hebrew: "store number"
];

// Discount lines: explicit savings/coupon entries that carry a positive price amount
// representing a deduction from the total. Must match BEFORE NOISE_RE and only fires
// when a price is also present (informational "You saved $X" messages lack a price column).
const DISCOUNT_LINE_RE = [
  /\binstant\s*savings?\b/i,            // "Instant Savings  2.00"
  /\bclub\s*(card\s*)?savings?\b/i,     // "Club Savings  1.50", "Club Card Savings  1.50"
  /\bmember\s*(card\s*)?savings?\b/i,   // "Member Savings  0.75"
  /\bdigital\s*coupon\b/i,              // "Digital Coupon  0.50"
  /\bmanufacturers?\s*coupon\b/i,       // "Manufacturer Coupon  1.00"
  /\bstore\s*coupon\b/i,                // "Store Coupon  0.50"
  /\bloyalty\s*(savings?|discount)\b/i, // "Loyalty Discount  1.25"
  /הנחה/,                               // Hebrew: "discount"
  /קופון/,                              // Hebrew: "coupon"
  /חיסכון/,                             // Hebrew: "savings"
  /מבצע/,                               // Hebrew: "sale/promotion"
];

const STRUCTURAL_RE = [
  /^\s*$/,
  /^[-=*_~#|]{2,}$/,
  /^\d{3}[-.\s]\d{3}[-.\s]\d{4}$/,
  /^\*{3,}/,       // *** HEADER BLOCK ***
];


// ─── Price extraction ────────────────────────────────────────────────────────
// Takes the LAST price on a line: "2 @ $1.99  $3.98" → $3.98
// Accepts 1- or 2-decimal prices to recover OCR truncations like "3.9B" → $3.90.
// Also matches ₪ (shekel) prefixed prices used on Israeli receipts.
const PRICE_RE_GLOBAL = /[₪$]?\s*(\d{1,3}(?:,\d{3})*\.\d{1,2}|\d+\.\d{1,2})/g;

function extractLastPrice(line: string): number | null {
  const matches = [...line.matchAll(PRICE_RE_GLOBAL)];
  if (matches.length > 0) {
    const val = parseFloat(matches[matches.length - 1][1].replace(',', ''));
    return val > 0 && val <= 999.99 ? val : null;
  }
  // Fallback: decimal point dropped (low contrast / blur — "3 98" instead of "3.98").
  // Requires ≥3 leading spaces so this is anchored to the price column, not arbitrary
  // space-separated numbers earlier in the line (e.g. "2 LB" or "8 OZ").
  const m = line.match(/\s{3,}(\d{1,3})\s(\d{2})\s*[A-Za-z]{0,3}$/);
  if (m) {
    const val = parseFloat(`${m[1]}.${m[2]}`);
    return val > 0 && val <= 999.99 ? val : null;
  }
  return null;
}

// ─── Trailing tax-flag artifact detection ────────────────────────────────────
// Receipts often suffix items with a 1-3 char uppercase code: " F", " T", " Tft", " Nf"
// Unit abbreviations (LB, OZ, …) must NOT be stripped.
const TRAILING_ARTIFACT_RE = /\s+([A-Z][a-zA-Z]{0,2})\s*$/;

function stripTrailingArtifact(s: string): string {
  const m = s.match(TRAILING_ARTIFACT_RE);
  if (!m) return s;
  if (UNIT_TOKENS.has(m[1].toUpperCase())) return s; // preserve units
  return s.slice(0, s.length - m[0].length);
}

// Barcode / SKU prefix pattern — Costco, Whole Foods, and most major retailers
// prefix each item line with a 5–13 digit product code before the name.
const BARCODE_PREFIX_RE = /^\d{5,13}\s+/;

// ─── Name candidate extraction ───────────────────────────────────────────────
function extractNameCandidate(line: string): string | null {
  let s = line;
  // Strip leading barcode/SKU prefix (5-13 digits at line start) before anything else.
  // Must precede the quantity-strip so we don't confuse "458287 CRETORS MIX" with
  // a quantity token like "2 @ EA".
  s = s.replace(BARCODE_PREFIX_RE, '');
  // Strip all price patterns (including shekel-prefixed and 1-decimal truncations)
  s = s.replace(/[₪$]?\s*\d{1,3}(?:,\d{3})*\.\d{1,2}|[₪$]?\s*\d+\.\d{1,2}/g, '');
  // Strip dropped-decimal price at end of line (secondary fallback: "   3 98 F")
  s = s.replace(/\s{3,}\d{1,3}\s\d{2}\s*[A-Za-z]{0,3}$/, ' ');
  // Strip leading quantity
  s = s.replace(/^\d+\s*[@x×]?\s*(EA|LB|KG|OZ|PC|PK|PCS|CT)?\s*/i, '');
  // Strip trailing tax-flag artifact (unit-aware)
  s = stripTrailingArtifact(s);
  // Strip trailing per-unit residue
  s = s.replace(/\s*[@/]\s*\w+\s*$/, '');
  // Remove non-word chars except space, hyphen, apostrophe, and Hebrew characters
  // Hebrew Unicode: א-ת (main block) + װ-״ (ligatures)
  s = s.replace(/[^\w\s'א-תװ-״-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.length >= 2 ? s : null;
}

function isValidNameCandidate(s: string): boolean {
  if (s.length < 4) return false;
  const letters = (s.match(/[a-zA-Zא-ת]/g) ?? []).length;
  if (letters < 2) return false;
  return s.trim().split(/\s+/).some((t) => t.length >= 2);
}

// Returns a human-readable reason why a raw name candidate was rejected.
function nameRejectionReason(rawName: string | null): string {
  if (rawName === null) return 'no name: all chars stripped by price/quantity/artifact rules';
  const s = rawName.trim();
  if (s.length < 4) return `name too short: "${s}" (${s.length} chars, need ≥4)`;
  const letters = (s.match(/[a-zA-Zא-ת]/g) ?? []).length;
  if (letters < 2) return `too few letters: "${s}" (${letters} letter(s), need ≥2)`;
  return `all words < 2 chars: "${s}"`;
}

// ─── Classifier ──────────────────────────────────────────────────────────────
export function classifyLine(raw: string): ClassifiedLine {
  const trimmed = raw.trim();

  // Detect barcode/SKU prefix before any other processing so the flag is available
  // on every return path. Costco and WF prefix every item line with a 5-13 digit code.
  const hadBarcodePrefix = BARCODE_PREFIX_RE.test(trimmed);

  // Structural noise first (empty lines, dividers, phone numbers, *** headers ***)
  const structMatch = STRUCTURAL_RE.find((p) => p.test(trimmed));
  if (structMatch) {
    return { raw, trimmed, lineClass: 'noise', price: null, nameCandidate: null, hasTrailingArtifact: false, hadBarcodePrefix, debugReason: `structural: ${structMatch}` };
  }

  const hasTrailingArtifact = TRAILING_ARTIFACT_RE.test(trimmed) &&
    !UNIT_TOKENS.has((trimmed.match(TRAILING_ARTIFACT_RE)?.[1] ?? '').toUpperCase());

  const price = extractLastPrice(trimmed);
  const rawNameCandidate = extractNameCandidate(trimmed);
  // Accept exactly-3-char all-uppercase tokens (e.g. "YAK") when a price is present.
  // Guards against noise words like "TAX" / "VAT" which are caught earlier by TAX_RE / NOISE_RE.
  const is3CharUpperWithPrice =
    price !== null &&
    rawNameCandidate !== null &&
    /^[A-Z]{3}$/.test(rawNameCandidate.trim());
  const nameCandidate = rawNameCandidate && (isValidNameCandidate(rawNameCandidate) || is3CharUpperWithPrice)
    ? rawNameCandidate
    : null;

  // Total lines (checked before subtotal to avoid subtotal consuming total)
  const totalMatch = TOTAL_RE.find((p) => p.test(trimmed));
  if (totalMatch) {
    return { raw, trimmed, lineClass: 'total', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `keyword: total (${totalMatch})` };
  }

  // Subtotal lines (including OCR-garbled variants like SUBTOTAI)
  const subtotalMatch = SUBTOTAL_RE.find((p) => p.test(trimmed));
  if (subtotalMatch) {
    return { raw, trimmed, lineClass: 'total', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `keyword: subtotal (${subtotalMatch})` };
  }

  // Tax lines
  const taxMatch = TAX_RE.find((p) => p.test(trimmed));
  if (taxMatch) {
    return { raw, trimmed, lineClass: 'tax', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `keyword: tax (${taxMatch})` };
  }

  // Payment lines
  const payMatch = PAYMENT_RE.find((p) => p.test(trimmed));
  if (payMatch) {
    return { raw, trimmed, lineClass: 'payment', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `keyword: payment (${payMatch})` };
  }

  // Discount lines: savings/coupon entries with an amount — must precede NOISE_RE
  // so the price is captured rather than silently discarded.
  const discountMatch = price !== null ? DISCOUNT_LINE_RE.find((p) => p.test(trimmed)) : undefined;
  if (discountMatch) {
    return { raw, trimmed, lineClass: 'discount', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `keyword: discount (${discountMatch})` };
  }

  // Noise / metadata lines
  const noiseMatch = NOISE_RE.find((p) => p.test(trimmed));
  if (noiseMatch) {
    return { raw, trimmed, lineClass: 'noise', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `noise pattern: ${noiseMatch}` };
  }

  // Decide: item / name_only / price_only / noise
  if (nameCandidate && price !== null) {
    const reason = is3CharUpperWithPrice ? '3-char uppercase item (YAK rule)' : undefined;
    return { raw, trimmed, lineClass: 'item', price, nameCandidate, hasTrailingArtifact, hadBarcodePrefix, debugReason: reason };
  }
  if (nameCandidate && price === null) {
    return { raw, trimmed, lineClass: 'name_only', price: null, nameCandidate, hasTrailingArtifact, hadBarcodePrefix };
  }
  if (!nameCandidate && price !== null) {
    return { raw, trimmed, lineClass: 'price_only', price, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: nameRejectionReason(rawNameCandidate) };
  }

  const fallthrough = nameCandidate === null
    ? nameRejectionReason(rawNameCandidate)
    : 'no price found';
  return { raw, trimmed, lineClass: 'noise', price: null, nameCandidate: null, hasTrailingArtifact, hadBarcodePrefix, debugReason: `fallthrough: ${fallthrough}` };
}

export function classifyLines(rawText: string): ClassifiedLine[] {
  return rawText.split('\n').map(classifyLine);
}
