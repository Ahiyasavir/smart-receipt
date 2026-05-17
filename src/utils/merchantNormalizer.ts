/**
 * Normalises raw bank transaction descriptions into clean merchant names.
 *
 * Bank descriptions contain a lot of noise: card numbers, reference codes, dates,
 * payment-method prefixes, and location codes.  This module strips that noise so
 * the dashboard shows "Shufersal" instead of "PURCHASE AT SHUFERSAL 1234 01/05".
 */

// Leading prefixes that identify the payment channel, not the merchant
const PREFIX_PATTERNS: RegExp[] = [
  /^(PAYMENT TO|PAY TO|PURCHASE AT|POS PURCHASE AT|POS |CARD PAYMENT |DIRECT DEBIT |DD |SO )\s*/i,
  /^(BIT\/PAYBOX |BIT |PAYBOX |BIT PAY |PAYBOX PAY )\s*/i,
  /^(ISRACARD |LEUMI CARD |MAX CARD |CAL CARD |CAL |VISA |MASTERCARD )\s*/i,
  /^(כרטיס \d{4} )/,       // Hebrew card-number prefix
  /^(\d{4} )/,             // standalone 4-digit code at start
];

// Noise anywhere in the string
const NOISE_PATTERNS: RegExp[] = [
  /\s+\d{6,}/g,            // long reference numbers
  /\s+\*\d+/g,             // *1234 card fragments
  /\s+\d{2}\/\d{2}(\/\d{2,4})?/g,  // date fragments 01/23 or 01/23/24
  /\s+REF[:\s]\s*\w+/gi,
  /\s+TXN\s*\d+/gi,
  /\s+#\s*\d+/g,
  /\s{2,}/g,               // collapse multiple spaces
];

// Known brand-name normalizations (raw → canonical)
const BRAND_MAP: Record<string, string> = {
  'MCDONALDS': "McDonald's",
  'MCDONALD S': "McDonald's",
  'STARBUCKS COFFEE': 'Starbucks',
  'KFC RESTAURANT': 'KFC',
  'BURGER KING': 'Burger King',
  'SHUFERSAL DEAL': 'Shufersal',
  'SHUFERSAL ONLINE': 'Shufersal',
  'RAMI LEVI': 'Rami Levy',
  'SUPER PHARM': 'Super-Pharm',
  'SUPERPHARM': 'Super-Pharm',
  // Hebrew
  'שופרסל דיל': 'שופרסל',
  'שופרסל אונליין': 'שופרסל',
  'רמי לוי שיווק': 'רמי לוי',
};

export function normalizeMerchantName(raw: string): string {
  let name = raw.trim();

  // Strip leading payment-channel prefixes
  for (const re of PREFIX_PATTERNS) {
    name = name.replace(re, '');
  }

  // Remove inline noise
  for (const re of NOISE_PATTERNS) {
    name = name.replace(re, ' ');
  }

  name = name.trim();

  // Brand-map lookup (case-insensitive)
  const upper = name.toUpperCase();
  for (const [key, canonical] of Object.entries(BRAND_MAP)) {
    if (upper === key.toUpperCase()) return canonical;
  }

  // Title-case Latin text; leave Hebrew as-is
  const hasHebrew = /[֐-׿]/.test(name);
  if (!hasHebrew && /[a-zA-Z]/.test(name)) {
    name = name
      .toLowerCase()
      .replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }

  return name || raw.trim();
}

/**
 * Produces a stable, lowercase lookup key for a merchant name.
 * Used as the key in the merchant_overrides table.
 */
export function merchantKey(raw: string): string {
  return normalizeMerchantName(raw)
    .toLowerCase()
    .replace(/[\s\-'.&/\\]+/g, '_')  // whitespace / punctuation → underscore
    .replace(/[^a-z0-9_֐-׿]/g, '') // strip everything else
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80); // cap length
}
