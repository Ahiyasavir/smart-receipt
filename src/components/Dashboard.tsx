import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { Receipt, Category, CategorySummary, UserBudgets } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';

type Period = 'week' | 'month' | 'all';

interface Props {
  receipts: Receipt[];
  budgets: UserBudgets;
  onGoToScan?: () => void;
  onOpenBudgets?: () => void;
  onOpenWrapped?: () => void;
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
  return receipts.filter((r) => { const d = new Date(r.date); return d >= start && d < end; });
}

function buildSummaries(receipts: Receipt[]): { summaries: CategorySummary[]; total: number; itemCount: number } {
  const map: Partial<Record<Category, CategorySummary>> = {};
  let total = 0, itemCount = 0;
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

// Build daily spending data for the bar chart
function buildDailyData(receipts: Receipt[], days: number) {
  const map: Record<string, number> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    map[key] = 0;
  }
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  for (const r of receipts) {
    const d = new Date(r.date);
    if (d < cutoff) continue;
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (key in map) map[key] = (map[key] ?? 0) + r.total;
  }
  return Object.entries(map).map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));
}

// Detect recurring/subscription charges (same store ~monthly, ≥2 times)
interface Subscription {
  store: string;
  avgAmount: number;
  count: number;
  lastDate: string;
  nextEstimate: string; // estimated next charge date
}

function buildSubscriptions(receipts: Receipt[]): Subscription[] {
  const storeMap: Record<string, Receipt[]> = {};
  for (const r of receipts) {
    if (!storeMap[r.storeName]) storeMap[r.storeName] = [];
    storeMap[r.storeName].push(r);
  }

  const subs: Subscription[] = [];
  for (const [store, recs] of Object.entries(storeMap)) {
    if (recs.length < 2) continue;
    const sorted = [...recs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Check if any consecutive pair is ~28–36 days apart (monthly cadence)
    let isRecurring = false;
    let gapDays = 30;
    for (let i = 1; i < sorted.length; i++) {
      const days = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
      if (days >= 26 && days <= 38) { isRecurring = true; gapDays = Math.round(days); break; }
    }
    if (!isRecurring) continue;

    const avgAmount = Math.round(recs.reduce((s, r) => s + r.total, 0) / recs.length * 100) / 100;
    const lastDate  = sorted[sorted.length - 1].date;
    const next      = new Date(lastDate);
    next.setDate(next.getDate() + gapDays);

    subs.push({ store, avgAmount, count: recs.length, lastDate, nextEstimate: next.toISOString() });
  }
  return subs.sort((a, b) => b.avgAmount - a.avgAmount);
}

// Build spending insights for the period
interface Insight {
  emoji: string;
  label: string;
  value: string;
}

function buildInsights(receipts: Receipt[]): Insight[] {
  if (receipts.length === 0) return [];
  const insights: Insight[] = [];

  // Biggest single receipt
  const biggest = receipts.reduce((max, r) => r.total > max.total ? r : max, receipts[0]);
  insights.push({ emoji: '🏆', label: 'Biggest purchase', value: `$${biggest.total.toFixed(2)} at ${biggest.storeName}` });

  // Most frequent store
  const storeCounts: Record<string, number> = {};
  for (const r of receipts) storeCounts[r.storeName] = (storeCounts[r.storeName] ?? 0) + 1;
  const topStore = Object.entries(storeCounts).sort((a, b) => b[1] - a[1])[0];
  if (topStore && topStore[1] > 1) {
    insights.push({ emoji: '🔁', label: 'Most visited', value: `${topStore[0]} (${topStore[1]}x)` });
  }

  // Busiest day of week
  const dayTotals: number[] = Array(7).fill(0);
  for (const r of receipts) dayTotals[new Date(r.date).getDay()] += r.total;
  const busiestDay = dayTotals.indexOf(Math.max(...dayTotals));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (Math.max(...dayTotals) > 0) {
    insights.push({ emoji: '📅', label: 'Biggest spend day', value: dayNames[busiestDay] });
  }

  // Average time between receipts (spending cadence)
  if (receipts.length >= 3) {
    const sorted = [...receipts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const span = new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime();
    const avgDays = span / (1000 * 60 * 60 * 24) / (receipts.length - 1);
    if (avgDays < 30) {
      insights.push({ emoji: '⚡', label: 'Shopping frequency', value: `Every ${avgDays < 1.5 ? 'day' : `${Math.round(avgDays)} days`}` });
    }
  }

  return insights.slice(0, 4);
}

// Build 4-week trend data
function buildWeeklyTrend(receipts: Receipt[]) {
  const weeks: { week: string; amount: number }[] = [];
  const now = new Date();
  for (let i = 3; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const total = receipts
      .filter((r) => { const d = new Date(r.date); return d >= start && d < end; })
      .reduce((s, r) => s + r.total, 0);
    weeks.push({ week: i === 0 ? 'This week' : `${i}w ago`, amount: Math.round(total * 100) / 100 });
  }
  return weeks;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-bold text-gray-900 dark:text-white">${payload[0].value.toFixed(2)}</p>
    </div>
  );
};

export default function Dashboard({ receipts, budgets, onGoToScan, onOpenBudgets, onOpenWrapped }: Props) {
  const [period,    setPeriod]    = useState<Period>('month');
  const [chartView, setChartView] = useState<'bar' | 'pie' | 'trend'>('bar');

  const filtered     = useMemo(() => filterByPeriod(receipts, period), [receipts, period]);
  const lastMonth    = useMemo(() => filterLastMonth(receipts), [receipts]);
  const { summaries, total, itemCount } = useMemo(() => buildSummaries(filtered), [filtered]);
  const { total: lastMonthTotal }       = useMemo(() => buildSummaries(lastMonth), [lastMonth]);

  const topCategory   = summaries[0] ?? null;
  const avgPerReceipt = filtered.length > 0 ? total / filtered.length : 0;
  const activeBudgets = period === 'week' ? budgets.weekly : period === 'month' ? budgets.monthly : {};
  const hasBudgets    = Object.values(activeBudgets).some((v) => v !== undefined);

  const monthDiff    = total - lastMonthTotal;
  const monthDiffPct = lastMonthTotal > 0 ? (monthDiff / lastMonthTotal) * 100 : null;

  const dailyData     = useMemo(() => buildDailyData(receipts, period === 'week' ? 7 : period === 'month' ? 30 : 60), [receipts, period]);
  const weeklyData    = useMemo(() => buildWeeklyTrend(receipts), [receipts]);
  const pieData       = summaries.map((s) => ({ name: s.label, value: Math.round(s.total * 100) / 100, color: s.color, emoji: s.emoji }));
  const insights      = useMemo(() => buildInsights(filtered), [filtered]);
  const subscriptions = useMemo(() => buildSubscriptions(receipts), [receipts]);

  if (receipts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="text-6xl">🧾</div>
        <div>
          <p className="font-semibold text-gray-700 dark:text-gray-200 text-lg">No receipts yet</p>
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
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
        {PERIOD_LABELS.map(({ id, label }) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === id ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center shadow-sm">
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

          {/* Spending Wrapped CTA */}
          {onOpenWrapped && receipts.length >= 3 && (
            <button onClick={onOpenWrapped}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl p-4 shadow-sm flex items-center gap-3 hover:opacity-95 active:scale-[0.99] transition-all">
              <span className="text-3xl">🎉</span>
              <div className="text-left">
                <p className="font-semibold text-sm">Your Monthly Spending Wrapped</p>
                <p className="text-xs opacity-70">Generate a shareable summary card</p>
              </div>
              <span className="ml-auto text-white/60 text-lg">›</span>
            </button>
          )}

          {/* Monthly comparison */}
          {period === 'month' && lastMonthTotal > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <span className="text-2xl">{monthDiff > 0 ? '📈' : '📉'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">vs Last Month</p>
                <p className="font-semibold text-gray-800 dark:text-white">
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

          {/* Top category */}
          {topCategory && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <span className="text-3xl">{topCategory.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Top Category</p>
                <p className="font-semibold text-gray-800 dark:text-white">{topCategory.label}</p>
                <p className="text-xs text-gray-400">{topCategory.count} item{topCategory.count !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900 dark:text-white">${topCategory.total.toFixed(2)}</p>
                <p className="text-xs text-gray-400">{total > 0 ? ((topCategory.total / total) * 100).toFixed(0) : 0}% of total</p>
              </div>
            </div>
          )}

          {/* Smart Insights */}
          {insights.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Smart Insights</h3>
              </div>
              <ul className="divide-y divide-gray-50 dark:divide-gray-700">
                {insights.map((ins, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xl w-7 shrink-0 text-center">{ins.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 leading-tight">{ins.label}</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{ins.value}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recurring / Subscriptions */}
          {subscriptions.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">🔄 Recurring Charges</h3>
                <span className="text-xs text-gray-400">
                  ₪{subscriptions.reduce((s, r) => s + r.avgAmount, 0).toFixed(0)}/mo
                </span>
              </div>
              <ul className="divide-y divide-gray-50 dark:divide-gray-700">
                {subscriptions.map((sub) => {
                  const daysUntil = Math.round((new Date(sub.nextEstimate).getTime() - Date.now()) / 86400000);
                  const soon = daysUntil >= 0 && daysUntil <= 7;
                  return (
                    <li key={sub.store} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-lg shrink-0">
                        🔁
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{sub.store}</p>
                        <p className="text-xs text-gray-400">
                          {sub.count}× detected ·{' '}
                          {soon
                            ? <span className="text-amber-500 font-medium">due in {daysUntil}d</span>
                            : `next ~${new Date(sub.nextEstimate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-purple-600 dark:text-purple-400 shrink-0">
                        ${sub.avgAmount.toFixed(2)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 py-2.5 border-t border-gray-50 dark:border-gray-700">
                <p className="text-xs text-gray-400 text-center">
                  Detected from stores you visit monthly — review to cancel unwanted charges
                </p>
              </div>
            </div>
          )}

          {/* Chart section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Spending Chart</h3>
              <div className="flex gap-1">
                {(['bar', 'trend', 'pie'] as const).map((v) => (
                  <button key={v} onClick={() => setChartView(v)}
                    className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                      chartView === v
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                    }`}>
                    {v === 'bar' ? '📊 Daily' : v === 'trend' ? '📈 Trend' : '🥧 Split'}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              {chartView === 'bar' && (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} interval={period === 'week' ? 0 : 5} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                    <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {chartView === 'trend' && (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={weeklyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {chartView === 'pie' && pieData.length > 0 && (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2} dataKey="value">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => typeof v === 'number' ? `$${v.toFixed(2)}` : String(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {pieData.slice(0, 5).map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <span className="text-xs">{d.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600 dark:text-gray-300 truncate">{d.name}</span>
                            <span className="font-medium text-gray-800 dark:text-white ml-1 shrink-0">${d.value.toFixed(0)}</span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1 mt-0.5">
                            <div className="h-1 rounded-full" style={{ width: `${total > 0 ? (d.value / total) * 100 : 0}%`, backgroundColor: d.color }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category breakdown with budgets */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Category Breakdown</h3>
              {period !== 'all' && onOpenBudgets && (
                <button onClick={onOpenBudgets} className="text-xs text-blue-600 font-medium hover:underline">
                  {hasBudgets ? 'Edit Budgets' : '+ Set Budgets'}
                </button>
              )}
            </div>
            <ul className="divide-y divide-gray-50 dark:divide-gray-700">
              {summaries.map((s) => {
                const pct        = total > 0 ? (s.total / total) * 100 : 0;
                const budget     = activeBudgets[s.category];
                const budgetPct  = budget ? Math.min((s.total / budget) * 100, 200) : null;
                const overBudget = budget && s.total > budget;
                const nearBudget = budget && !overBudget && s.total / budget > 0.8;
                const barColor   = overBudget ? '#EF4444' : nearBudget ? '#F59E0B' : s.color;
                return (
                  <li key={s.category} className={`px-4 py-3 space-y-1.5 ${overBudget ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{s.emoji}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{s.label}</span>
                        <span className="text-xs text-gray-400">({s.count})</span>
                        {overBudget && <span className="text-xs text-red-600 font-semibold">Over!</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">${s.total.toFixed(2)}</span>
                        {budget
                          ? <span className="text-xs text-gray-400 ml-1">/ ${budget.toFixed(0)}</span>
                          : <span className="text-xs text-gray-400 ml-1">{pct.toFixed(0)}%</span>}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${budgetPct !== null ? Math.min(budgetPct, 100) : pct}%`, backgroundColor: barColor }} />
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
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Recent Receipts</h3>
            </div>
            <ul className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.slice(0, 5).map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{r.storeName}</p>
                      {r.source === 'bank-sync' && <span className="text-[9px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 rounded-full font-semibold shrink-0">🏦</span>}
                    </div>
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
