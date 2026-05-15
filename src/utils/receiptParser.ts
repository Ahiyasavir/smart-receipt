// Thin adapter: delegates to interpretReceipt and reshapes the result for callers.

import { ReceiptItem } from '../types';
import { interpretReceipt } from './receiptInterpreter';
import { ClassifiedLine } from './lineClassifier';

export interface ParseResult {
  items: ReceiptItem[];
  total: number;
  itemSum: number;
  storeName: string;
  merchant: string | null;
  mismatch: boolean;
  isIncomplete: boolean;
  suspiciousLines: string[];
  discountSum: number;       // sum of explicit discount/coupon line amounts
  discountLineCount: number; // number of discount lines detected
  classifiedLines: ClassifiedLine[]; // per-line classification for debug panel
}

// Normalizes comma-as-decimal-separator prices to period-decimal before parsing.
// Handles two formats:
//
//   Case 1 — USD with dollar sign: "$12,99" → "$12.99"
//     Activation: text has "$D+,DD" patterns AND no period-decimal prices.
//
//   Case 2 — International without currency sign (CZK, EUR, etc.): "14,90" → "14.90"
//     Also handles trailing OCR noise digit: "14,908" (Kč tax code merged) → "14.90"
//     Activation: ≥4 comma-decimal numbers AND they outnumber period-decimal numbers 2:1.
//     Guard: only replaces D{1-4},DD patterns so USD thousands like "1,234.56" are safe
//     (the digit following "1,23" is "4" then ".", not space/letter, so it won't match).
function normalizeCommaDecimals(text: string): string {
  // Case 1: USD with dollar sign
  const hasUsdCommaPrice = /\$\s*\d+,\d{2}\b/.test(text);
  const hasPeriodPrice   = /\d+\.\d{2}/.test(text);
  if (hasUsdCommaPrice && !hasPeriodPrice) {
    return text.replace(/(\$\s*\d+),(\d{2})\b/g, '$1.$2');
  }

  // Case 2: International comma-decimal (CZK, EUR, etc.) without currency prefix.
  // Pattern: 1–4 digits, comma, exactly 2 digits, then an optional noise digit,
  // followed by whitespace / letter / bracket / end-of-line.
  const commaCount  = (text.match(/\b\d{1,4},\d{2}/g)  ?? []).length;
  const periodCount = (text.match(/\d+\.\d{2}/g)        ?? []).length;
  if (commaCount >= 4 && commaCount > periodCount * 2) {
    return text.replace(/\b(\d{1,4}),(\d{2})\d?(?=[\s,A-Za-z)\]]|$)/gm, '$1.$2');
  }

  return text;
}

export function parseReceiptText(rawText: string): ParseResult {
  const r = interpretReceipt(normalizeCommaDecimals(rawText));
  return {
    items: r.items,
    total: r.total,
    itemSum: r.itemSum,
    storeName: r.storeName,
    merchant: r.merchant,
    mismatch: r.mismatch,
    isIncomplete: r.isIncomplete,
    suspiciousLines: r.suspiciousLines,
    discountSum: r.discountSum,
    discountLineCount: r.discountLineCount,
    classifiedLines: r.classifiedLines,
  };
}
