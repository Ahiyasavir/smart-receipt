/**
 * Central currency conversion — the ONE place rates live.
 *
 * Transactions always keep their original amount + original currency untouched.
 * Conversion is derived at display time only. No external API yet: rates are a
 * deterministic, clearly-structured table so a live FX source can replace
 * `RATES` later without touching any call site.
 *
 * Model: every rate is "1 unit of <code> = N ILS" (ILS is the base). Cross
 * conversion is amount → ILS → target, so adding a currency = one line.
 */
import { CurrencyCode } from './currency';

/** 1 unit of CODE = this many ILS. Deterministic placeholder rates. */
const RATES_IN_ILS: Record<CurrencyCode, number> = {
  ILS: 1,
  USD: 3.7,
  EUR: 4.0,
  GBP: 4.7,
  JPY: 0.025,
  CAD: 2.7,
  AUD: 2.45,
  CHF: 4.15,
};

/** Marks the rate source for future swap-in of a live provider. */
export const RATE_SOURCE = 'static-v1' as const;

/**
 * Convert an amount from one currency to another. Unknown/missing source
 * currency is treated as already being in the target currency (no-op) so
 * legacy rows without a stored currency are never double-converted.
 */
export function convert(
  amount: number,
  from: string | undefined | null,
  to: CurrencyCode,
): number {
  if (!from || from === to) return amount;
  const fromRate = RATES_IN_ILS[from as CurrencyCode];
  const toRate   = RATES_IN_ILS[to];
  if (!fromRate || !toRate) return amount; // unknown code → safe no-op
  const inIls = amount * fromRate;
  return Math.round((inIls / toRate) * 100) / 100;
}
