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
const PRICE_RE_GLOBAL = /\$?\s*(\d{1,3}(?:,\d{3})*\.\d{1,2}|\d+\.\d{1,2})/g;

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

// ─── Name candidate extraction ───────────────────────────────────────────────
function extractNameCandidate(line: string): string | null {
  let s = line;
  // Strip all price patterns (including 1-decimal truncations like "3.9B" → strip "3.9")
  s = s.replace(/\$?\s*\d{1,3}(?:,\d{3})*\.\d{1,2}|\$?\s*\d+\.\d{1,2}/g, '');
  // Strip dropped-decimal price at end of line (secondary fallback: "   3 98 F")
  s = s.replace(/\s{3,}\d{1,3}\s\d{2}\s*[A-Za-z]{0,3}$/, ' ');
  // Strip leading quantity
  s = s.replace(/^\d+\s*[@x×]?\s*(EA|LB|KG|OZ|PC|PK|PCS|CT)?\s*/i, '');
  // Strip trailing tax-flag artifact (unit-aware)
  s = stripTrailingArtifact(s);
  // Strip trailing per-unit residue
  s = s.replace(/\s*[@/]\s*\w+\s*$/, '');
  // Remove non-word chars except space, hyphen, apostrophe
  s = s.replace(/[^\w\s'-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s.length >= 2 ? s : null;
}

function isValidNameCandidate(s: string): boolean {
  if (s.length < 4) return false;
  const letters = (s.match(/[a-zA-Z]/g) ?? []).length;
  if (letters < 2) return false;
  return s.trim().split(/\s+/).some((t) => t.length >= 3);
}

// ─── Classifier ──────────────────────────────────────────────────────────────
export function classifyLine(raw: string): ClassifiedLine {
  const trimmed = raw.trim();

  // Structural noise first (empty lines, dividers, phone numbers, *** headers ***)
  if (STRUCTURAL_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'noise', price: null, nameCandidate: null, hasTrailingArtifact: false };
  }

  const hasTrailingArtifact = TRAILING_ARTIFACT_RE.test(trimmed) &&
    !UNIT_TOKENS.has((trimmed.match(TRAILING_ARTIFACT_RE)?.[1] ?? '').toUpperCase());

  const price = extractLastPrice(trimmed);
  const rawNameCandidate = extractNameCandidate(trimmed);
  const nameCandidate = rawNameCandidate && isValidNameCandidate(rawNameCandidate) ? rawNameCandidate : null;

  // Total lines (checked before subtotal to avoid subtotal consuming total)
  if (TOTAL_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'total', price, nameCandidate: null, hasTrailingArtifact };
  }

  // Subtotal lines (including OCR-garbled variants like SUBTOTAI)
  if (SUBTOTAL_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'total', price, nameCandidate: null, hasTrailingArtifact };
  }

  // Tax lines
  if (TAX_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'tax', price, nameCandidate: null, hasTrailingArtifact };
  }

  // Payment lines
  if (PAYMENT_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'payment', price, nameCandidate: null, hasTrailingArtifact };
  }

  // Discount lines: savings/coupon entries with an amount — must precede NOISE_RE
  // so the price is captured rather than silently discarded.
  if (price !== null && DISCOUNT_LINE_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'discount', price, nameCandidate: null, hasTrailingArtifact };
  }

  // Noise / metadata lines
  if (NOISE_RE.some((p) => p.test(trimmed))) {
    return { raw, trimmed, lineClass: 'noise', price, nameCandidate: null, hasTrailingArtifact };
  }

  // Decide: item / name_only / price_only / noise
  if (nameCandidate && price !== null) {
    return { raw, trimmed, lineClass: 'item', price, nameCandidate, hasTrailingArtifact };
  }
  if (nameCandidate && price === null) {
    return { raw, trimmed, lineClass: 'name_only', price: null, nameCandidate, hasTrailingArtifact };
  }
  if (!nameCandidate && price !== null) {
    return { raw, trimmed, lineClass: 'price_only', price, nameCandidate: null, hasTrailingArtifact };
  }

  return { raw, trimmed, lineClass: 'noise', price: null, nameCandidate: null, hasTrailingArtifact };
}

export function classifyLines(rawText: string): ClassifiedLine[] {
  return rawText.split('\n').map(classifyLine);
}
