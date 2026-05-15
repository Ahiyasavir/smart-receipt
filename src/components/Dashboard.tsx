import { useState, useMemo } from 'react';
import { Receipt, Category, CategorySummary, UserBudgets } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';

type Period = 'week' | 'month' | 'all';

interface Props {
  receipts: Receipt[];
  budgets: UserBudgets;
  onGoToScan?: () => void;
  onOpenBudgets?: () => void;
}

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: 'week',  label: 'This Week'  },
  { id: 'month', label: 'This Month' },
  { id: 'all',   label: 'All Time'   },
];

function filterByPeriod(receipts: Receipt[], period: Period): Receipt[] {
  if (period === 'all') return receipts;
  const cutoff = new Date();
  if (period === 'week') cutoff.setDate(cutoff.getDate() - 7);
  else cutoff.setDate(1);
  cutoff.setHours(0, 0, 0, 0);
  return receipts.filter((r) => new Date(r.date) >= cutoff);
}

function filterLastMonth(receipts: Receipt[]): Receipt[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end   = new Date(now.getFullYear(), now.getMonth(), 1);
  return receipts.filter((r) => {
    const d = new Date(r.date);
    return d >= start && d < end;
  });
}

function buildSummaries(receipts: Receipt[]): { summaries: CategorySummary[]; total: number; itemCount: number } {
  const map: Partial<Record<Category, CategorySummary>> = {};
  let total = 0;
  let itemCount = 0;
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const meta = CATEGORY_META[item.category];
      if (!map[item.category]) {
        map[item.category] = { category: item.category, label: meta.label, total: 0, count: 0, color: meta.color, emoji: meta.emoji };
      }
      map[item.category]!.total += item.amount;
      map[item.category]!.count += 1;
      total += item.amount;
      itemCount += 1;
    }
  }
  const summaries = (Object.values(map) as CategorySummary[]).sort((a, b) => b.total - a.total);
  return { summaries, total: Math.round(total * 100) / 100, itemCount };
}

export default function Dashboard({ receipts, budgets, onGoToScan, onOpenBudgets }: Props) {
  const [period, setPeriod] = useState<Period>('month');

  const filtered     = useMemo(() => filterByPeriod(receipts, period), [receipts, period]);
  const lastMonth    = useMemo(() => filterLastMonth(receipts), [receipts]);
  const { summaries, total, itemCount } = useMemo(() => buildSummaries(filtered), [filtered]);
  const { total: lastMonthTotal }       = useMemo(() => buildSummaries(lastMonth), [lastMonth]);

  const topCategory    = summaries[0] ?? null;
  const avgPerReceipt  = filtered.length > 0 ? total / filtered.length : 0;
  const activeBudgets  = period === 'week' ? budgets.weekly : period === 'month' ? budgets.monthly : {};
  const hasBudgets     = Object.values(activeBudgets).some((v) => v !== undefined);

  // Monthly comparison (only meaningful in month view)
  const monthDiff    = total - lastMonthTotal;
  const monthDiffPct = lastMonthTotal > 0 ? (monthDiff / lastMonthTotal) * 100 : null;

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="text-6xl">🧾</div>
        <div>
          <p className="font-semibold text-gray-700 text-lg">No receipts yet</p>
          <p className="text-sm text-gray-400 mt-1">Scan your first receipt to see spending insights</p>
        </div>
        {onGoToScan && (
          <button onClick={onGoToScan} className="mt-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-semibold text-sm shadow-sm hover:bg-blue-700 transition-colors">
            Scan a Receipt
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {PERIOD_LABELS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPeriod(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
          <p className="text-gray-400 text-sm">No receipts in this period</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-600 text-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide opacity-70">Total Spend</p>
              <p className="text-2xl font-bold mt-1">${total.toFixed(2)}</p>
              <p className="text-xs opacity-60 mt-1">{filtered.length} receipt{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-emerald-500 text-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide opacity-70">Avg per Receipt</p>
              <p className="text-2xl font-bold mt-1">${avgPerReceipt.toFixed(2)}</p>
              <p className="text-xs opacity-60 mt-1">{itemCount} item{itemCount !== 1 ? 's' : ''} tracked</p>
            </div>
          </div>

          {/* Monthly comparison card */}
          {period === 'month' && lastMonthTotal > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <span className="text-2xl">{monthDiff > 0 ? '📈' : '📉'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">vs Last Month</p>
                <p className="font-semibold text-gray-800">
                  {monthDiff > 0 ? '+' : ''}${monthDiff.toFixed(2)}
                </p>
              </div>
              <div className="text-right shrink-0">
                {monthDiffPct !== null && (
                  <span className={`text-sm font-bold ${monthDiff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {monthDiff > 0 ? '▲' : '▼'} {Math.abs(monthDiffPct).toFixed(0)}%
                  </span>
                )}
                <p className="text-xs text-gray-400">last month ${lastMonthTotal.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Top category insight */}
          {topCategory && (
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <span className="text-3xl">{topCategory.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Top Category</p>
                <p className="font-semibold text-gray-800">{topCategory.label}</p>
                <p className="text-xs text-gray-400">{topCategory.count} item{topCategory.count !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900">${topCategory.total.toFixed(2)}</p>
                <p className="text-xs text-gray-400">{total > 0 ? ((topCategory.total / total) * 100).toFixed(0) : 0}% of total</p>
              </div>
            </div>
          )}

          {/* Category breakdown with budget bars */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Category Breakdown</h3>
              {period !== 'all' && onOpenBudgets && (
                <button onClick={onOpenBudgets} className="text-xs text-blue-600 font-medium hover:underline">
                  {hasBudgets ? 'Edit Budgets' : '+ Set Budgets'}
                </button>
              )}
            </div>
            <ul className="divide-y divide-gray-50">
              {summaries.map((s) => {
                const pct    = total > 0 ? (s.total / total) * 100 : 0;
                const budget = activeBudgets[s.category];
                const budgetPct = budget ? Math.min((s.total / budget) * 100, 200) : null;
                const overBudget = budget && s.total > budget;
                const nearBudget = budget && !overBudget && s.total / budget > 0.8;
                const barColor = overBudget ? '#EF4444' : nearBudget ? '#F59E0B' : s.color;

                return (
                  <li key={s.category} className={`px-4 py-3 space-y-1.5 ${overBudget ? 'bg-red-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{s.emoji}</span>
                        <span className="text-sm font-medium text-gray-700">{s.label}</span>
                        <span className="text-xs text-gray-400">({s.count})</span>
                        {overBudget && <span className="text-xs text-red-600 font-semibold">Over!</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-gray-900 text-sm">${s.total.toFixed(2)}</span>
                        {budget ? (
                          <span className="text-xs text-gray-400 ml-1">/ ${budget.toFixed(0)}</span>
                        ) : (
                          <span className="text-xs text-gray-400 ml-1">{pct.toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${budgetPct !== null ? Math.min(budgetPct, 100) : pct}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    {budget && (
                      <p className="text-xs text-gray-400">
                        {overBudget
                          ? `$${(s.total - budget).toFixed(2)} over ${period === 'week' ? 'weekly' : 'monthly'} budget`
                          : `$${(budget - s.total).toFixed(2)} remaining`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Recent receipts */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Recent Receipts</h3>
            </div>
            <ul className="divide-y divide-gray-50">
              {filtered.slice(0, 5).map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{r.storeName}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(r.date).toLocaleDateString()} · {r.items.length} item{r.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-blue-600 ml-3 shrink-0">${r.total.toFixed(2)}</p>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
