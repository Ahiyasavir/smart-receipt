/**
 * Server-side merchant normalization — kept in sync with
 * src/utils/merchantNormalizer.ts. The two implementations must agree because
 * the merchant *key* is the join key for the merchant_overrides table: a key
 * produced here must match a key the client wrote when the user corrected a
 * category, otherwise corrections won't carry over to auto-sync.
 */

const PREFIX_PATTERNS = [
  /^(PAYMENT TO|PAY TO|PURCHASE AT|POS PURCHASE AT|POS |CARD PAYMENT |DIRECT DEBIT |DD |SO )\s*/i,
  /^(BIT\/PAYBOX |BIT |PAYBOX |BIT PAY |PAYBOX PAY )\s*/i,
  /^(ISRACARD |LEUMI CARD |MAX CARD |CAL CARD |CAL |VISA |MASTERCARD )\s*/i,
  /^(כרטיס \d{4} )/,
  /^(\d{4} )/,
];

const NOISE_PATTERNS = [
  /\s+\d{6,}/g,
  /\s+\*\d+/g,
  /\s+\d{2}\/\d{2}(\/\d{2,4})?/g,
  /\s+REF[:\s]\s*\w+/gi,
  /\s+TXN\s*\d+/gi,
  /\s+#\s*\d+/g,
  /\s{2,}/g,
];

const BRAND_MAP = {
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
  'שופרסל דיל': 'שופרסל',
  'שופרסל אונליין': 'שופרסל',
  'רמי לוי שיווק': 'רמי לוי',
};

export function normalizeMerchantName(raw) {
  let name = String(raw ?? '').trim();

  for (const re of PREFIX_PATTERNS) name = name.replace(re, '');
  for (const re of NOISE_PATTERNS) name = name.replace(re, ' ');
  name = name.trim();

  const upper = name.toUpperCase();
  for (const [key, canonical] of Object.entries(BRAND_MAP)) {
    if (upper === key.toUpperCase()) return canonical;
  }

  const hasHebrew = /[֐-׿]/.test(name);
  if (!hasHebrew && /[a-zA-Z]/.test(name)) {
    name = name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  }

  return name || String(raw ?? '').trim();
}

export function merchantKey(raw) {
  return normalizeMerchantName(raw)
    .toLowerCase()
    .replace(/[\s\-'.&/\\]+/g, '_')
    .replace(/[^a-z0-9_֐-׿]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}
