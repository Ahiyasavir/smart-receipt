// Orchestrates OCR text → structured receipt items.
// Pipeline: classify lines → merge two-line items → score confidence → normalize → categorize.

import { ReceiptItem, Category } from '../types';
import { classifyLines, ClassifiedLine } from './lineClassifier';
import { normalizeName } from './nameNormalizer';
import { classifyCategory } from './categoryClassifier';

export const MIN_CONFIDENCE = 0.40;
export const UNCERTAIN_THRESHOLD = 0.65;

const MISMATCH_THRESHOLD = 0.25;

// ─── Known product vocabulary ─────────────────────────────────────────────────
// Words that strongly indicate a real grocery item → confidence boost.
const PRODUCT_VOCAB = new Set([
  'milk', 'bread', 'butter', 'cheese', 'egg', 'eggs', 'yogurt', 'cream',
  'chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna', 'shrimp',
  'apple', 'orange', 'banana', 'grape', 'berry', 'berries', 'strawberry',
  'blueberry', 'raspberry', 'peach', 'pear', 'mango', 'melon', 'watermelon',
  'pineapple', 'avocado', 'cantaloupe',
  'tomato', 'potato', 'carrot', 'onion', 'garlic', 'pepper', 'lettuce',
  'spinach', 'broccoli', 'cauliflower', 'celery', 'cucumber', 'zucchini',
  'mushroom', 'corn', 'asparagus',
  'rice', 'pasta', 'noodle', 'flour', 'sugar', 'salt', 'oil', 'vinegar',
  'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'jam', 'honey',
  'peanut', 'almond', 'cashew', 'walnut', 'cereal', 'oat', 'oatmeal',
  'granola', 'cracker', 'cookie', 'chips', 'snack', 'pretzel', 'popcorn',
  'juice', 'water', 'soda', 'coffee', 'tea', 'cocoa', 'chocolate',
  'soup', 'broth', 'bean', 'beans', 'lentil', 'tofu', 'hummus',
  'pizza', 'bagel', 'muffin', 'tortilla', 'wrap',
  'detergent', 'soap', 'shampoo', 'conditioner', 'toothpaste', 'tissue',
  'paper', 'towel', 'foil', 'cleanser', 'bleach',
  'vitamin', 'supplement', 'bandage',
  'organic', 'natural', 'fresh', 'frozen', 'whole', 'ground', 'sliced',
  'boneless', 'skinless', 'roasted', 'grilled', 'smoked',
]);

function containsProductVocab(name: string): boolean {
  const lower = name.toLowerCase();
  for (const w of PRODUCT_VOCAB) {
    if (lower.includes(w)) return true;
  }
  return false;
}

// ─── Merchant detection ───────────────────────────────────────────────────────
const MERCHANT_PATTERNS: Array<{ re: RegExp; name: string }> = [
  { re: /walmart/i,             name: 'Walmart' },
  { re: /costco\s*wholesale/i,  name: 'Costco Wholesale' },
  { re: /costco/i,              name: 'Costco Wholesale' },
  { re: /kroger/i,              name: 'Kroger' },
  { re: /safeway/i,             name: 'Safeway' },
  { re: /whole\s*foods/i,       name: 'Whole Foods Market' },
  { re: /trader\s*joe/i,        name: "Trader Joe's" },
  { re: /target/i,              name: 'Target' },
  { re: /publix/i,              name: 'Publix' },
  { re: /aldi/i,                name: 'Aldi' },
  { re: /lidl/i,                name: 'Lidl' },
  { re: /sprouts/i,             name: 'Sprouts' },
  { re: /meijer/i,              name: 'Meijer' },
  { re: /heb\b/i,               name: 'H-E-B' },
  { re: /wegmans/i,             name: 'Wegmans' },
  { re: /stop\s*&?\s*shop/i,    name: 'Stop & Shop' },
  { re: /food\s*lion/i,         name: 'Food Lion' },
  { re: /\bgiant\b/i,           name: 'Giant' },
  { re: /harris\s*teeter/i,     name: 'Harris Teeter' },
  { re: /cvs\b/i,               name: 'CVS' },
  { re: /walgreen/i,            name: 'Walgreens' },
  { re: /rite\s*aid/i,          name: 'Rite Aid' },
  { re: /boston\s*market/i,     name: 'Boston Market' },
  { re: /chipotle/i,            name: 'Chipotle' },
  { re: /mcdonald/i,            name: "McDonald's" },
  { re: /starbucks/i,           name: 'Starbucks' },
  { re: /subway\b/i,            name: 'Subway' },
];

function detectMerchant(lines: string[]): string | null {
  // Search the first 12 lines for a merchant name. Most receipts print the
  // merchant header at the top, but some (especially thermal receipts) may
  // repeat it after a logo or address block.
  const header = lines.slice(0, 12).join('\n');
  for (const { re, name } of MERCHANT_PATTERNS) {
    if (re.test(header)) return name;
  }
  return null;
}

// ─── Store name fallback ─────────────────────────────────────────────────────
function guessFallbackStoreName(classified: ClassifiedLine[]): string {
  for (const cl of classified.slice(0, 8)) {
    if (
      cl.lineClass === 'noise' &&
      cl.trimmed.length > 2 &&
      /[a-zA-Z]/.test(cl.trimmed) &&
      !/^\d/.test(cl.trimmed) &&
      cl.price === null
    ) {
      return cl.trimmed;
    }
  }
  return 'Unknown Store';
}

// ─── Confidence scoring ───────────────────────────────────────────────────────
interface ScoringInput {
  nameCandidate: string;
  price: number;
  hasTrailingArtifact: boolean;
  isMerged: boolean;
}

function scoreConfidence({ nameCandidate, price, hasTrailingArtifact, isMerged }: ScoringInput): number {
  let score = 0.50;

  const name = nameCandidate.trim();
  const words = name.split(/\s+/);
  const len = name.length;
  const letters = (name.match(/[a-zA-Z]/g) ?? []).length;
  const letterRatio = len > 0 ? letters / len : 0;
  const longestWord = Math.max(...words.map((w) => w.length));

  // Name length
  if (len >= 10)      score += 0.15;
  else if (len >= 6)  score += 0.08;
  else if (len < 4)   score -= 0.20;

  // Word count
  if (words.length >= 2) score += 0.10;
  if (words.length >= 3) score += 0.05;

  // Letter ratio
  if (letterRatio >= 0.75)     score += 0.10;
  else if (letterRatio < 0.40) score -= 0.15;

  // Longest word length — very short words suggest abbreviation garbage
  if (longestWord >= 5)    score += 0.10;
  else if (longestWord < 3) score -= 0.20;

  // Product vocabulary hit
  if (containsProductVocab(name)) score += 0.15;

  // Price plausibility: typical single grocery item is $0.25–$49.99
  if (price >= 0.25 && price <= 49.99) score += 0.05;
  else if (price > 200)                 score -= 0.15;

  // Trailing OCR artifact reduces confidence (but doesn't disqualify)
  if (hasTrailingArtifact) score -= 0.10;

  // Two-line merged items are more reliable (explicit price line was found)
  if (isMerged) score += 0.10;

  return Math.max(0, Math.min(1, score));
}

// ─── Interpreter result ───────────────────────────────────────────────────────
export interface InterpretedReceipt {
  items: ReceiptItem[];
  detectedTotal: number;   // value of TOTAL line; 0 if not found
  itemSum: number;         // sum of accepted item amounts (before discounts)
  total: number;           // detectedTotal if found, else itemSum
  merchant: string | null;
  storeName: string;
  mismatch: boolean;
  isIncomplete: boolean;   // true when significant amounts appear missing
  suspiciousLines: string[]; // near-miss lines: had price but couldn't form a valid item
  discountSum: number;     // sum of explicit discount/coupon line amounts
  discountLineCount: number; // number of discount lines detected
  classifiedLines: ClassifiedLine[]; // full per-line classification for debug panel
}

// ─── Main interpreter ─────────────────────────────────────────────────────────
export function interpretReceipt(rawText: string): InterpretedReceipt {
  const rawLines = rawText.split('\n');
  const classified = classifyLines(rawText);

  const merchant = detectMerchant(rawLines);
  const storeName = merchant ?? guessFallbackStoreName(classified);

  // Pass 1: detect receipt total
  let detectedTotal = 0;
  for (let i = 0; i < classified.length; i++) {
    const cl = classified[i];
    if (cl.lineClass !== 'total') continue;
    if (cl.price !== null && cl.price > detectedTotal) {
      detectedTotal = cl.price;
    } else if (cl.price === null && i > 0) {
      // International receipts (e.g. Czech TESCO) put the amount on its own line
      // immediately before the keyword: "842.89\nCELKEM" — adopt the preceding price.
      const prev = classified[i - 1];
      if (prev.lineClass === 'price_only' && prev.price !== null && prev.price > detectedTotal) {
        detectedTotal = prev.price;
      }
    }
  }

  // Pass 1b: collect explicit discount lines so the mismatch check can account for them
  let discountSum = 0;
  let discountLineCount = 0;
  for (const cl of classified) {
    if (cl.lineClass === 'discount' && cl.price !== null) {
      discountSum += cl.price;
      discountLineCount++;
    }
  }
  discountSum = Math.round(discountSum * 100) / 100;

  // Pass 2: collect item candidates — merge adjacent name_only + price_only pairs
  interface Candidate {
    nameCandidate: string;
    price: number;
    raw: string;
    hasTrailingArtifact: boolean;
    isMerged: boolean;
  }

  const candidates: Candidate[] = [];
  let i = 0;
  while (i < classified.length) {
    const cl = classified[i];

    if (cl.lineClass === 'item' && cl.nameCandidate && cl.price !== null) {
      candidates.push({
        nameCandidate: cl.nameCandidate,
        price: cl.price,
        raw: cl.raw,
        hasTrailingArtifact: cl.hasTrailingArtifact,
        isMerged: false,
      });
      i++;
      continue;
    }

    if (cl.lineClass === 'name_only' && cl.nameCandidate && i + 1 < classified.length) {
      const next = classified[i + 1];

      // Case A: name on this line, price on the very next line (standard two-line format)
      if (next.lineClass === 'price_only' && next.price !== null) {
        candidates.push({
          nameCandidate: cl.nameCandidate,
          price: next.price,
          raw: `${cl.raw} | ${next.raw}`,
          hasTrailingArtifact: cl.hasTrailingArtifact,
          isMerged: true,
        });
        i += 2;
        continue;
      }

      // Case B: product name on this line, next line has an embedded price (item format).
      // e.g., "Applegate Turkey\n  Breast Deli 7oz   6.49"
      if (next.lineClass === 'item' && next.price !== null) {
        // Do NOT merge when the name_only line came from a barcode-prefixed standalone
        // item whose price OCR failed. Merging would steal the next item's price and
        // produce a wrong item (e.g. "KS Wheat Bread" priced at SkinnyPop's $5.39).
        // Let it fall through as an orphan; the next iteration handles the item line.
        if (cl.hadBarcodePrefix) {
          i++;
          continue;
        }
        // Do NOT merge when the immediately preceding classified line is also name_only.
        // That pattern indicates a run of standalone items whose prices OCR failed to
        // extract — NOT a two-line product descriptor. Merging would steal the next
        // item's price slot and produce a wrong combined entry.
        // Two-line product formats are always preceded by a consumed pair (price_only or
        // item) or by noise — never by another orphaned name_only.
        const prevCl = i > 0 ? classified[i - 1] : null;
        if (prevCl && prevCl.lineClass === 'name_only') {
          i++;
          continue;
        }

        // When merging, prefer whichever name has more letter characters.
        // Barcode-stripped item names (e.g. "CRETORS MIX") are often cleaner than
        // the garbled OCR noise lines that precede them (e.g. "ever 11 IN 5").
        const clLetters   = (cl.nameCandidate   ?? '').replace(/[^a-zA-Z]/g, '').length;
        const nextLetters = (next.nameCandidate  ?? '').replace(/[^a-zA-Z]/g, '').length;
        const bestName = (next.nameCandidate && nextLetters > clLetters)
          ? next.nameCandidate
          : cl.nameCandidate;

        candidates.push({
          nameCandidate: bestName,
          price: next.price,
          raw: `${cl.raw} | ${next.raw}`,
          hasTrailingArtifact: cl.hasTrailingArtifact,
          isMerged: true,
        });
        i += 2;
        continue;
      }
    }

    i++;
  }

  // Collect suspicious lines: had a price but failed to produce a valid item
  // This includes price_only lines that had no preceding name_only partner.
  const suspiciousLines: string[] = [];
  for (const cl of classified) {
    if (cl.lineClass === 'price_only' && cl.price !== null) {
      // Check if this line was consumed as part of a merge pair (raw includes it)
      const wasConsumed = candidates.some((c) => c.isMerged && c.raw.includes(cl.raw.trim()));
      if (!wasConsumed) suspiciousLines.push(cl.raw.trim());
    }
  }

  // Pass 3: score, filter, normalize, categorize
  const items: ReceiptItem[] = [];
  let itemSum = 0;

  for (const cand of candidates) {
    const confidence = scoreConfidence({
      nameCandidate: cand.nameCandidate,
      price: cand.price,
      hasTrailingArtifact: cand.hasTrailingArtifact,
      isMerged: cand.isMerged,
    });

    if (confidence < MIN_CONFIDENCE) {
      suspiciousLines.push(cand.raw.trim());
      continue;
    }

    const { display, forCategory } = normalizeName(cand.nameCandidate);
    const category: Category = classifyCategory(forCategory, merchant);

    items.push({
      id: crypto.randomUUID(),
      name: display,
      amount: cand.price,
      category,
      raw: cand.raw,
      confidence,
    });

    itemSum += cand.price;
  }

  itemSum = Math.round(itemSum * 100) / 100;

  // Subtract known discounts before comparing to the receipt total.
  // The total already has discounts baked in; itemSum does not include them.
  // Guard: never let adjustedItemSum go below 0 (avoids bogus gap if discounts are large).
  const adjustedItemSum = Math.max(0, itemSum - discountSum);

  const mismatch =
    detectedTotal > 0 &&
    items.length > 0 &&
    Math.abs(adjustedItemSum - detectedTotal) / detectedTotal > MISMATCH_THRESHOLD;

  const total = detectedTotal > 0 ? detectedTotal : itemSum;

  // Mark as incomplete when evidence suggests items are missing:
  //   - large mismatch (>40%) AND suspicious lines exist
  //   - OR receipt has a real total but we extracted zero items
  //   - OR fewer than 2 items for a total above $8 (almost certainly partial parse)
  const gapRatio = detectedTotal > 0 ? Math.abs(adjustedItemSum - detectedTotal) / detectedTotal : 0;
  const isIncomplete =
    (detectedTotal > 0 && items.length === 0) ||
    (gapRatio > 0.40 && suspiciousLines.length > 0) ||
    (detectedTotal > 8 && items.length < 2 && suspiciousLines.length > 0);

  return {
    items, detectedTotal, itemSum, total, merchant, storeName,
    mismatch, isIncomplete, suspiciousLines,
    discountSum, discountLineCount, classifiedLines: classified,
  };
}
