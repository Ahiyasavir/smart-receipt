import { useState, useMemo } from 'react';
import { Receipt, Category, CategorySummary, UserBudgets } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';
import { useCurrency } from '../contexts/CurrencyContext';
import ProgressBar from './ui/ProgressBar';

type Period = 'week' | 'month' | 'all';

interface Props {
  receipts: Receipt[];
  budgets: UserBudgets;
  onGoToScan?: () => void;
  onOpenBudgets?: () => void;
  onOpenWrapped?: () => void;
  onOpenBankConnect?: () => void;
}

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: 'week',  label: 'Week'  },
  { id: 'month', label: 'Month' },
  { id: 'all',   label: 'All'   },
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

// 14-day spending buckets for the hero mini-bar viz.
function buildDailyBuckets(receipts: Receipt[], days: number): { key: string; sum: number }[] {
  const now = new Date();
  const out: { key: string; sum: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const key = d.toDateString();
    const sum = receipts
      .filter((r) => new Date(r.date).toDateString() === key)
      .reduce((s, r) => s + r.total, 0);
    out.push({ key, sum });
  }
  return out;
}

interface Subscription { store: string; avgAmount: number; count: number; category: Category; }

function buildSubscriptions(receipts: Receipt[]): Subscription[] {
  const storeMap: Record<string, Receipt[]> = {};
  for (const r of receipts) {
    (storeMap[r.storeName] ||= []).push(r);
  }
  const subs: Subscription[] = [];
  for (const [store, recs] of Object.entries(storeMap)) {
    if (recs.length < 2) continue;
    const sorted = [...recs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let isRecurring = false;
    for (let i = 1; i < sorted.length; i++) {
      const gap = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
      if (gap >= 26 && gap <= 38) { isRecurring = true; break; }
    }
    if (!isRecurring) continue;
    const avgAmount = Math.round(recs.reduce((s, r) => s + r.total, 0) / recs.length * 100) / 100;
    const category = (recs[0].items[0]?.category ?? 'other') as Category;
    subs.push({ store, avgAmount, count: recs.length, category });
  }
  return subs.sort((a, b) => b.avgAmount - a.avgAmount).slice(0, 4);
}

function dominantCategory(r: Receipt): Category {
  const counts: Partial<Record<Category, number>> = {};
  for (const it of r.items) counts[it.category] = (counts[it.category] ?? 0) + 1;
  return (Object.entries(counts).sort((a, b) => b[1]! - a[1]!)[0]?.[0] as Category) ?? 'other';
}

const SECTION_LABEL: React.CSSProperties = {
  font: '700 11px var(--font-sans)', letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--ink-muted)',
  padding: '0 4px 8px',
};
const CARD: React.CSSProperties = {
  background: 'var(--surface-card)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', overflow: 'hidden',
};

export default function Dashboard({ receipts, budgets: _budgets, onGoToScan, onOpenBudgets, onOpenWrapped, onOpenBankConnect }: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const { fmt, convert, currency } = useCurrency();

  // Currency-correct source of truth: convert every amount once, never mutate.
  const viewReceipts = useMemo(
    () => receipts.map((r) => ({
      ...r,
      currency,
      total: convert(r.total, r.currency),
      items: r.items.map((it) => ({ ...it, amount: convert(it.amount, r.currency) })),
    })),
    [receipts, convert, currency],
  );

  const filtered   = useMemo(() => filterByPeriod(viewReceipts, period), [viewReceipts, period]);
  const lastMonth  = useMemo(() => filterLastMonth(viewReceipts), [viewReceipts]);
  const { summaries, total } = useMemo(() => buildSummaries(filtered), [filtered]);
  const { total: lastMonthTotal } = useMemo(() => buildSummaries(lastMonth), [lastMonth]);
  const bars         = useMemo(() => buildDailyBuckets(viewReceipts, 14), [viewReceipts]);
  const subscriptions = useMemo(() => buildSubscriptions(viewReceipts), [viewReceipts]);
  const recent = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6),
    [filtered],
  );

  const top = summaries[0] ?? null;
  const maxBar = Math.max(...bars.map((b) => b.sum), 1);
  const monthDiff = total - lastMonthTotal;
  const monthDiffPct = lastMonthTotal > 0 ? Math.round((monthDiff / lastMonthTotal) * 100) : null;

  if (receipts.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: '80px 24px', gap: 'var(--space-4)' }}
      >
        <div style={{
          width: 96, height: 96, borderRadius: 28, background: 'var(--brand-50)',
          display: 'grid', placeItems: 'center', fontSize: 44,
        }}>📈</div>
        <div>
          <p className="s-h2">Your spending story starts here</p>
          <p className="s-body" style={{ marginTop: 4, color: 'var(--ink-muted)' }}>
            Connect your email or add a spend to see automatic insights.
          </p>
        </div>
        <div className="flex" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          {onOpenBankConnect && (
            <button onClick={onOpenBankConnect} className="s-button s-pressable"
              style={{ background: 'var(--brand-600)', color: 'var(--ink-on-brand)', borderRadius: 'var(--radius-lg)', padding: '12px 20px', boxShadow: 'var(--shadow-card)' }}>
              Connect email
            </button>
          )}
          {onGoToScan && (
            <button onClick={onGoToScan} className="s-button s-pressable"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-secondary)', borderRadius: 'var(--radius-lg)', padding: '12px 20px' }}>
              Add a spend
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ gap: 14, animation: 'fade-slide var(--dur-base) var(--ease-out-soft) both' }}
    >
      {/* Period segmented control */}
      <div className="flex p-1" style={{ gap: 4, background: 'var(--surface-muted)', borderRadius: 'var(--radius-pill)' }}>
        {PERIOD_LABELS.map(({ id, label }) => (
          <button key={id} onClick={() => setPeriod(id)}
            className="s-button s-pressable flex-1 py-1.5"
            style={{
              borderRadius: 'var(--radius-pill)',
              background: period === id ? 'var(--surface-card)' : 'transparent',
              color: period === id ? 'var(--brand-600)' : 'var(--ink-muted)',
              boxShadow: period === id ? 'var(--shadow-card)' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Hero total */}
      <div style={{
        background: 'linear-gradient(135deg, var(--brand-600), var(--brand-700))',
        borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)',
        color: 'var(--ink-on-brand)', boxShadow: 'var(--shadow-card)',
      }}>
        <div className="s-section-label" style={{ color: 'rgba(255,255,255,0.7)' }}>Total spend</div>
        <div className="s-amount-hero" style={{ color: 'var(--ink-on-brand)', marginTop: 'var(--space-1)' }}>
          {fmt(total)}
        </div>
        <div className="s-body-strong" style={{ color: 'rgba(255,255,255,0.78)', marginTop: 'var(--space-2)' }}>
          {filtered.length} spend{filtered.length !== 1 ? 's' : ''}
          <span style={{ opacity: 0.5, margin: '0 8px' }}>·</span>
          {summaries.length} categories
          {monthDiffPct !== null && (
            <>
              <span style={{ opacity: 0.5, margin: '0 8px' }}>·</span>
              {monthDiff >= 0 ? '▲' : '▼'} {Math.abs(monthDiffPct)}% vs last month
            </>
          )}
        </div>
        <div className="flex items-end" style={{ gap: 3, height: 36, marginTop: 18 }}>
          {bars.map((b, i) => (
            <div key={i} style={{
              flex: 1, minHeight: 2, borderRadius: 2,
              height: `${Math.max(2, (b.sum / maxBar) * 100)}%`,
              background: b.sum > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)',
            }} />
          ))}
        </div>
      </div>

      {/* Top category */}
      {top && (
        <div style={{ ...CARD, padding: 14 }} className="flex items-center" >
          <div style={{
            width: 44, height: 44, borderRadius: 14, marginRight: 12,
            background: (top.color ?? '#6B7280') + '21',
            display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0,
          }}>{top.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="s-section-label" style={{ padding: 0 }}>Top category</div>
            <div style={{ font: '700 15px var(--font-sans)', color: 'var(--ink)', marginTop: 2 }}>{top.label}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '700 18px var(--font-sans)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmt(top.total)}</div>
            <div style={{ font: '500 11px var(--font-sans)', color: 'var(--ink-muted)', marginTop: 2 }}>
              {total > 0 ? Math.round((top.total / total) * 100) : 0}%
            </div>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      <div>
        <div style={SECTION_LABEL}>Where it goes</div>
        {filtered.length === 0 ? (
          <div style={{ ...CARD, padding: 24, textAlign: 'center' }}>
            <p className="s-body" style={{ color: 'var(--ink-muted)' }}>No spends in this period.</p>
          </div>
        ) : (
          <div style={CARD}>
            {summaries.map((s, i) => {
              const pct = total > 0 ? (s.total / total) * 100 : 0;
              return (
                <div key={s.category} style={{
                  padding: '12px 14px',
                  borderBottom: i < summaries.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}>
                  <div className="flex items-center" style={{ gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 17 }}>{s.emoji}</span>
                    <span style={{ flex: 1, font: '600 14px var(--font-sans)', color: 'var(--ink)' }}>{s.label}</span>
                    <span style={{ font: '600 14px var(--font-sans)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmt(s.total)}</span>
                    <span style={{ font: '500 11px var(--font-sans)', color: 'var(--ink-muted)', minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(pct)}%</span>
                  </div>
                  <ProgressBar value={pct} color={s.color} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscriptions */}
      {subscriptions.length > 0 && (
        <div>
          <div style={SECTION_LABEL}>Recurring</div>
          <div style={CARD}>
            {subscriptions.map((sub, i) => {
              const meta = CATEGORY_META[sub.category] ?? CATEGORY_META.other;
              return (
                <div key={sub.store} className="flex items-center" style={{
                  gap: 12, padding: '12px 14px',
                  borderBottom: i < subscriptions.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                    background: (meta.color ?? '#6B7280') + '21',
                    display: 'grid', placeItems: 'center', fontSize: 17,
                  }}>{meta.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 14px var(--font-sans)', color: 'var(--ink)' }} className="truncate">{sub.store}</div>
                    <div style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-muted)', marginTop: 2 }}>~monthly · {sub.count}×</div>
                  </div>
                  <span style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmt(sub.avgAmount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recent.length > 0 && (
        <div>
          <div style={SECTION_LABEL}>Recent</div>
          <div style={CARD}>
            {recent.map((r, i) => {
              const meta = CATEGORY_META[dominantCategory(r)] ?? CATEGORY_META.other;
              return (
                <div key={r.id} className="flex items-center" style={{
                  gap: 12, padding: '12px 14px',
                  borderBottom: i < recent.length - 1 ? '1px solid var(--color-border)' : 'none',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                    background: (meta.color ?? '#6B7280') + '21',
                    display: 'grid', placeItems: 'center', fontSize: 17,
                  }}>{meta.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: '600 14px var(--font-sans)', color: 'var(--ink)' }} className="truncate">{r.storeName}</div>
                    <div style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-muted)', marginTop: 2 }}>
                      {new Date(r.date).toLocaleDateString()} · {meta.label}
                    </div>
                  </div>
                  <span style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.total)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quiet utility actions */}
      <div className="flex" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
        {onOpenBudgets && (
          <button onClick={onOpenBudgets} className="s-button s-pressable flex-1"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--color-border)', color: 'var(--ink-secondary)', borderRadius: 'var(--radius-lg)', padding: '11px 0', boxShadow: 'var(--shadow-card)' }}>
            Budgets
          </button>
        )}
        {onOpenWrapped && (
          <button onClick={onOpenWrapped} className="s-button s-pressable flex-1"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--color-border)', color: 'var(--ink-secondary)', borderRadius: 'var(--radius-lg)', padding: '11px 0', boxShadow: 'var(--shadow-card)' }}>
            Recap
          </button>
        )}
      </div>
    </div>
  );
}
