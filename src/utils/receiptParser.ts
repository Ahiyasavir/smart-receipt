// Thin adapter: delegates to interpretReceipt and reshapes the result for callers.

import { ReceiptItem } from '../types';
import { interpretReceipt } from './receiptInterpreter';

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
}

// Some digital receipts use European comma-decimal prices: "$12,99" instead of "$12.99".
// Detect this format heuristically and normalize to period-decimal before parsing.
// Detection: text has "$D+,DD" patterns but lacks any period-decimal prices.
function normalizeCommaDecimals(text: string): string {
  const hasCommaPrice  = /\$\s*\d+,\d{2}\b/.test(text);
  const hasPeriodPrice = /\d+\.\d{2}/.test(text);
  if (!hasCommaPrice || hasPeriodPrice) return text;
  // Replace every "$D+,DD" → "$D+.DD" (only trailing 2-digit comma decimals)
  return text.replace(/(\$\s*\d+),(\d{2})\b/g, '$1.$2');
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
  };
}
