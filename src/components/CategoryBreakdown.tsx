/**
 * CategoryBreakdown — premium analytics surface.
 *
 * Self-contained: give it receipts, it aggregates, formats in the user's
 * currency, and renders animated category bars with the strongest-spending
 * category highlighted plus a total summary. Dark-mode aware, mobile-first,
 * deterministic (no AI), prefers-reduced-motion respected (via CSS).
 */
import { useEffect, useMemo, useState } from 'react';
import { Receipt } from '../types';
import { useCurrency } from '../contexts/CurrencyContext';
import { buildCategorySummaries } from '../utils/summaries';

interface Props {
  receipts: Receipt[];
  /** Heading, e.g. "This month". */
  title?: string;
}

export default function CategoryBreakdown({ receipts, title = 'Spending by category' }: Props) {
  const { fmt, convert } = useCurrency();
  const { summaries, total } = useMemo(
    () => buildCategorySummaries(receipts, convert),
    [receipts, convert],
  );

  // Animate bars from 0 → width on mount.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (summaries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm animate-fade-slide">
        <div className="text-3xl mb-2">📊</div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No spending to analyze yet</p>
        <p className="text-xs text-gray-400 mt-1">Connect your email to start tracking spends automatically.</p>
      </div>
    );
  }

  const top = summaries[0];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden animate-fade-slide">
      {/* Header + total */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{fmt(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Top category</p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: top.color }}>
              {top.emoji} {top.label}
            </p>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-gray-50 dark:divide-gray-700/60">
        {summaries.map((s, i) => {
          const pct = total > 0 ? (s.total / total) * 100 : 0;
          const isTop = i === 0;
          return (
            <li key={s.category} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{s.emoji}</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                    {s.label}
                  </span>
                  {isTop && (
                    <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full shrink-0">
                      ★ Top
                    </span>
                  )}
                  <span className="text-xs text-gray-400 shrink-0">· {s.count}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm tabular-nums">
                    {fmt(s.total)}
                  </span>
                  <span className="text-xs text-gray-400 ml-1 tabular-nums">{pct.toFixed(0)}%</span>
                </div>
              </div>

              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: grown ? `${Math.max(pct, 2)}%` : '0%',
                    backgroundColor: s.color,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
