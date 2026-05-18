/**
 * Shared, deterministic category aggregation.
 * Used by analytics surfaces (History month summary, etc.) so the math lives
 * in one place. No AI, no external calls.
 */
import { Receipt, Category, CategorySummary } from '../types';
import { CATEGORY_META } from './categoryClassifier';

/**
 * @param convert optional (amount, fromCurrency) → amount in display currency.
 *   When provided, each item is converted from its receipt's original currency
 *   so multi-currency spending aggregates correctly. Defaults to identity.
 */
export function buildCategorySummaries(
  receipts: Receipt[],
  convert: (amount: number, fromCurrency?: string | null) => number = (n) => n,
): { summaries: CategorySummary[]; total: number; count: number } {
  const acc = new Map<Category, { total: number; count: number }>();
  let total = 0;

  for (const r of receipts) {
    for (const it of r.items) {
      const amount = convert(it.amount, r.currency);
      const cur = acc.get(it.category) ?? { total: 0, count: 0 };
      cur.total += amount;
      cur.count += 1;
      acc.set(it.category, cur);
      total += amount;
    }
  }

  const summaries: CategorySummary[] = Array.from(acc.entries())
    .map(([category, v]) => {
      const meta = CATEGORY_META[category];
      return {
        category,
        label: meta.label,
        total: Math.round(v.total * 100) / 100,
        count: v.count,
        color: meta.color,
        emoji: meta.emoji,
      };
    })
    .sort((a, b) => b.total - a.total);

  return { summaries, total: Math.round(total * 100) / 100, count: receipts.length };
}

/** Month-to-date receipts (current calendar month). */
export function thisMonth(receipts: Receipt[]): Receipt[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return receipts.filter((r) => {
    const d = new Date(r.date);
    return d.getFullYear() === y && d.getMonth() === m;
  });
}
