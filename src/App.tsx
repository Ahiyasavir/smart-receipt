import { useState, useEffect, useRef, useMemo } from 'react';
import { AppTab, Receipt, ReceiptItem, Category } from './types';
import { useAuth } from './hooks/useAuth';
import { useReceipts } from './hooks/useReceipts';
import { useBudgets } from './hooks/useBudgets';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import SpendingWrapped from './components/SpendingWrapped';
import { useCurrency } from './contexts/CurrencyContext';
import { CURRENCIES, CurrencyCode } from './utils/currency';
import {
  requestNotificationPermission, notificationsSupported, notificationsGranted,
  checkReturnDeadlines, checkBudgetAlerts,
} from './utils/notifications';
import ReceiptUploader from './components/ReceiptUploader';
import Dashboard from './components/Dashboard';
import ItemList from './components/ItemList';
import BudgetModal from './components/BudgetModal';
import BankConnectionModal from './components/BankConnectionModal';
import EmailSetupGuide from './components/EmailSetupGuide';
import BankBadge from './components/BankBadge';
import CategoryBreakdown from './components/CategoryBreakdown';
import { SkeletonList } from './components/Skeleton';
import BankSyncStatus from './components/BankSyncStatus';
import { useBankConnections } from './hooks/useBankConnections';
import { useMerchantOverrides } from './hooks/useMerchantOverrides';
import { merchantKey } from './utils/merchantNormalizer';
import { exportReceiptsCsv } from './utils/csvExport';
import { CATEGORY_META } from './utils/categoryClassifier';

const NAV_TABS = [
  { id: 'scan'      as const, label: 'Add',       icon: '📷' },
  { id: 'dashboard' as const, label: 'Insights',   icon: '📊' },
  { id: 'history'   as const, label: 'Spends',     icon: '🧾'  },
  { id: 'settings'  as const, label: 'Settings',   icon: '⚙️'  },
];

type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'store';

function useSpendingAlerts(
  receipts: Receipt[],
  budgets: ReturnType<typeof useBudgets>['budgets'],
) {
  const { convert } = useCurrency();
  return useMemo(() => {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthly = receipts.filter((r) => new Date(r.date) >= start);
    const totals: Partial<Record<string, number>> = {};
    for (const r of monthly)
      for (const item of r.items)
        // Budgets are in display currency → convert each spend before summing.
        totals[item.category] = (totals[item.category] ?? 0) + convert(item.amount, r.currency);

    return Object.entries(budgets.monthly)
      .filter(([, budget]) => !!budget)
      .map(([cat, budget]) => ({
        category: cat,
        spent: totals[cat] ?? 0,
        budget: budget!,
        label: CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label ?? cat,
      }))
      .filter((a) => a.spent > a.budget * 0.8);
  }, [receipts, budgets, convert]);
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { fmt, fmtFrom, symbol, currency, setCurrency } = useCurrency();
  const userId = user?.id ?? '';

  const [tab,             setTab]             = useState<AppTab>('scan');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [historySearch,   setHistorySearch]   = useState('');
  const [historyCat,      setHistoryCat]      = useState<Category | 'all'>('all');
  const [historySort,     setHistorySort]     = useState<SortKey>('date-desc');
  const [toast,           setToast]           = useState<string | null>(null);
  const [budgetOpen,      setBudgetOpen]      = useState(false);
  const [bankConnectOpen,   setBankConnectOpen]   = useState(false);
  const [emailGuideOpen,    setEmailGuideOpen]    = useState(false);
  const [wrappedOpen,     setWrappedOpen]     = useState(false);
  const [darkMode,        setDarkMode]        = useState(() => localStorage.getItem('smartreceipt_dark') === '1');
  const [showOnboarding,  setShowOnboarding]  = useState(() => !localStorage.getItem('smartreceipt_onboarded'));

  const installPromptRef = useRef<Event & { prompt: () => Promise<void> } | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('smartreceipt_dark', darkMode ? '1' : '0');
  }, [darkMode]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      installPromptRef.current = e as Event & { prompt: () => Promise<void> };
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => { setConfirmDelete(false); }, [selectedReceipt]);

  const { receipts, loading: receiptsLoading, loadError: receiptsLoadError, retryLoad: retryReceipts, addReceipt, updateItem, updateReceipt, removeReceipt } = useReceipts(userId);
  const { budgets, updateBudgets, emailDigest, setEmailDigestPref } = useBudgets(userId);
  const { connections: bankConnections, upsertConnection } = useBankConnections(userId);
  const { overrides: merchantOverrides, saveOverride } = useMerchantOverrides(userId);
  const spendingAlerts = useSpendingAlerts(receipts, budgets);

  // Check notifications whenever receipts or budgets update
  useEffect(() => {
    if (!notificationsGranted() || receiptsLoading) return;
    checkReturnDeadlines(receipts);
    checkBudgetAlerts(receipts, budgets, symbol);
  }, [receipts, budgets, symbol, receiptsLoading]);

  const haptic = (ms = 30) => navigator.vibrate?.(ms);

  const switchTab = (t: AppTab) => {
    setTab(t);
    setSelectedReceipt(null);
    setHistorySearch('');
    setHistoryCat('all');
  };

  const handleItemChange = (item: ReceiptItem) => {
    if (!selectedReceipt) return;
    updateItem(selectedReceipt.id, item);
    const items = selectedReceipt.items.map((i) => (i.id === item.id ? item : i));
    const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    setSelectedReceipt({ ...selectedReceipt, items, total });
  };

  const handleInstall = async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    installPromptRef.current = null;
    setShowInstallBanner(false);
  };

  const handleShare = async (receipt: Receipt) => {
    const text = [
      `🧾 ${receipt.storeName}`,
      `Date: ${new Date(receipt.date).toLocaleDateString()}`,
      `Total: ${fmtFrom(receipt.total, receipt.currency)}`,
      '',
      ...receipt.items.map((i) => `• ${i.name}: ${fmtFrom(i.amount, receipt.currency)}`),
    ].join('\n');
    if (navigator.share) {
      await navigator.share({ title: `${receipt.storeName} · Spendora`, text });
    } else {
      await navigator.clipboard.writeText(text);
      setToast('Receipt copied to clipboard');
    }
  };

  const handleBankImport = async (imported: Receipt[], bankId?: string, bankName?: string) => {
    let added = 0;
    for (const r of imported) {
      if (await addReceipt(r)) added++;
    }
    const duplicates = imported.length - added;
    if (bankId && bankName) {
      const existing = bankConnections.find((c) => c.bankId === bankId);
      await upsertConnection({
        bankId,
        bankName,
        status:           'csv_imported',
        lastSync:         new Date().toISOString(),
        transactionCount: (existing?.transactionCount ?? 0) + added,
      });
    }
    setToast(
      added === 0
        ? `No new transactions — all ${imported.length} already imported`
        : duplicates > 0
          ? `Imported ${added} new (${duplicates} already existed)`
          : `Imported ${added} transactions`,
    );
  };

  // ── Filtered + sorted receipts ────────────────────────────────────────────
  const filteredReceipts = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    let list = receipts;

    // text search: store name + item names
    if (q) {
      list = list.filter((r) =>
        r.storeName.toLowerCase().includes(q) ||
        r.items.some((i) => i.name.toLowerCase().includes(q)) ||
        (r.notes?.toLowerCase().includes(q) ?? false),
      );
    }

    // category filter
    if (historyCat !== 'all') {
      list = list.filter((r) => r.items.some((i) => i.category === historyCat));
    }

    // sort
    return [...list].sort((a, b) => {
      switch (historySort) {
        case 'date-asc':    return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'amount-desc': return b.total - a.total;
        case 'amount-asc':  return a.total - b.total;
        case 'store':       return a.storeName.localeCompare(b.storeName);
        default:            return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  }, [receipts, historySearch, historyCat, historySort]);

  const historyTotal = receipts.reduce((s, r) => s + r.total, 0);

  const dm = darkMode;

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-4xl animate-pulse">🧾</div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;

  return (
    <div className={`min-h-screen ${dm ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
      {/* ── Onboarding (first launch only) ──────────────────────── */}
      {showOnboarding && (
        <Onboarding onDone={() => {
          localStorage.setItem('smartreceipt_onboarded', '1');
          setShowOnboarding(false);
        }} />
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <header className={`${dm ? 'bg-gray-800' : 'bg-white'} shadow-sm sticky top-0 z-40`}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <img
            src="/spendora-logo.png"
            alt="Spendora"
            className={`h-7 w-auto ${dm ? 'brightness-0 invert' : ''}`}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode((v) => !v)}
              className={`rounded-full w-8 h-8 flex items-center justify-center text-base ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
              title="Toggle dark mode"
            >
              {dm ? '☀️' : '🌙'}
            </button>
            <button
              onClick={signOut}
              className={`flex items-center gap-1.5 ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded-full px-3 py-1 transition-colors`}
              title="Sign out"
            >
              <span className={`text-xs font-medium truncate max-w-[110px] ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
                {user.email?.split('@')[0]}
              </span>
              <span className="text-gray-400 text-xs">↗</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Install banner ───────────────────────────────────────── */}
      {showInstallBanner && (
        <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between max-w-lg mx-auto">
          <p className="text-sm font-medium">Add Spendora to your home screen</p>
          <div className="flex gap-2 ml-3 shrink-0">
            <button onClick={() => setShowInstallBanner(false)} className="text-white/70 hover:text-white text-xs">Later</button>
            <button onClick={handleInstall} className="bg-white text-blue-600 text-xs font-semibold px-3 py-1 rounded-full">Install</button>
          </div>
        </div>
      )}

      {/* ── Spending alerts ──────────────────────────────────────── */}
      {tab === 'dashboard' && spendingAlerts.length > 0 && (
        <div className="max-w-lg mx-auto px-4 pt-3 space-y-2">
          {spendingAlerts.map((a) => (
            <div key={a.category} className={`rounded-xl px-3 py-2 flex items-center gap-2 text-sm ${
              a.spent > a.budget ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                 : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }`}>
              <span>{a.spent > a.budget ? '🚨' : '⚠️'}</span>
              <span>
                <strong>{a.label}</strong>:&nbsp;
                {a.spent > a.budget
                  ? `over budget by ${fmt(a.spent - a.budget)}`
                  : `${Math.round((a.spent / a.budget) * 100)}% of ${symbol}${Math.round(a.budget)} monthly budget`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-28">
        <div key={`${tab}:${selectedReceipt?.id ?? 'list'}`} className="animate-fade-slide">

        {/* SCAN tab */}
        {tab === 'scan' && (
          <ReceiptUploader
            onSave={(receipt) => {
              addReceipt(receipt);
              setToast(`Saved — ${receipt.storeName}`);
              haptic(60);
              switchTab('history');
            }}
          />
        )}

        {/* DASHBOARD tab */}
        {tab === 'dashboard' && (
          <Dashboard
            receipts={receipts}
            budgets={budgets}
            onGoToScan={() => switchTab('scan')}
            onOpenBudgets={() => setBudgetOpen(true)}
            onOpenWrapped={() => setWrappedOpen(true)}
            onOpenBankConnect={() => setBankConnectOpen(true)}
          />
        )}

        {/* HISTORY tab — list view */}
        {tab === 'history' && !selectedReceipt && (
          <div className="space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2 className={`font-semibold text-sm uppercase tracking-wide ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
                Receipts
              </h2>
              <div className="flex items-center gap-2">
                {receipts.length > 0 && (
                  <span className="text-xs text-gray-400">{receipts.length} · {fmt(historyTotal)}</span>
                )}
                {receipts.length > 0 && (
                  <button onClick={() => exportReceiptsCsv(receipts)} className="text-xs text-blue-500 hover:text-blue-700 font-medium" title="Export all to CSV">
                    ⬇ CSV
                  </button>
                )}
                <button onClick={() => setBankConnectOpen(true)} className="text-xs text-blue-500 hover:text-blue-700 font-medium" title="Connect bank">
                  🏦 Bank
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search stores, items, notes…"
                className={`w-full border rounded-xl pl-8 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm ${
                  dm ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-200'
                }`}
              />
              {historySearch && (
                <button onClick={() => setHistorySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm" aria-label="Clear search">✕</button>
              )}
            </div>

            {/* Category filter + Sort */}
            <div className="flex gap-2">
              <select
                value={historyCat}
                onChange={(e) => setHistoryCat(e.target.value as Category | 'all')}
                className={`flex-1 border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  dm ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                <option value="all">All categories</option>
                {(Object.keys(CATEGORY_META) as Category[]).filter((c) => c !== 'other').map((c) => (
                  <option key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</option>
                ))}
              </select>
              <select
                value={historySort}
                onChange={(e) => setHistorySort(e.target.value as SortKey)}
                className={`flex-1 border rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  dm ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="amount-desc">Highest amount</option>
                <option value="amount-asc">Lowest amount</option>
                <option value="store">Store name A–Z</option>
              </select>
            </div>

            {/* Loading skeleton */}
            {receiptsLoading && <SkeletonList count={4} />}

            {/* Graceful load failure — never a blank screen */}
            {!receiptsLoading && receiptsLoadError && (
              <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-8 text-center shadow-sm`}>
                <div className="text-3xl mb-2">⚠️</div>
                <p className={`font-semibold text-sm ${dm ? 'text-gray-200' : 'text-gray-700'}`}>Couldn’t load your spending</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">Check your connection — your data is safe.</p>
                <button onClick={retryReceipts} className="bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-teal-800 transition-colors">
                  Try again
                </button>
              </div>
            )}

            {/* Empty states */}
            {!receiptsLoading && !receiptsLoadError && receipts.length === 0 && (
              <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-10 text-center shadow-sm`}>
                <div className="text-4xl mb-3">✉️</div>
                <p className={`font-semibold text-sm ${dm ? 'text-gray-200' : 'text-gray-700'}`}>No spends yet</p>
                <p className="text-xs text-gray-400 mt-1 mb-4">Connect your email and Spendora tracks every purchase automatically — no manual entry.</p>
                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => setEmailGuideOpen(true)} className="bg-teal-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl hover:bg-teal-800 transition-colors">
                    ✉️ Connect email — automatic tracking
                  </button>
                  <button onClick={() => switchTab('scan')} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs transition-colors">
                    or add a spend manually
                  </button>
                </div>
              </div>
            )}

            {!receiptsLoading && receipts.length > 0 && filteredReceipts.length === 0 && (
              <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-8 text-center shadow-sm`}>
                <p className="text-gray-400 text-sm">No receipts match your filters</p>
                <button onClick={() => { setHistorySearch(''); setHistoryCat('all'); }} className="text-blue-500 text-xs mt-2 hover:underline">Clear filters</button>
              </div>
            )}

            {/* Premium month/category analytics for the current view */}
            {!receiptsLoading && filteredReceipts.length > 0 && (
              <CategoryBreakdown receipts={filteredReceipts} title="This view" />
            )}

            {/* Spends list — Spendora designed Activity rows */}
            {!receiptsLoading && filteredReceipts.length > 0 && (
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-card)',
                  overflow: 'hidden',
                }}
              >
                {filteredReceipts.map((r, idx) => {
                  const counts = r.items.reduce<Record<string, number>>((m, i) => {
                    m[i.category] = (m[i.category] ?? 0) + 1; return m;
                  }, {});
                  const domCat = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other') as Category;
                  const meta = CATEGORY_META[domCat] ?? CATEGORY_META.other;
                  const daysLeft = r.returnDeadline
                    ? Math.ceil((new Date(r.returnDeadline).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <button
                      key={r.id}
                      onClick={() => { haptic(); setSelectedReceipt(r); }}
                      className="s-pressable w-full text-left flex items-center gap-3"
                      style={{
                        padding: '12px 14px',
                        borderBottom: idx < filteredReceipts.length - 1 ? '1px solid var(--color-border)' : 'none',
                        background: 'transparent',
                      }}
                    >
                      <span
                        style={{
                          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                          background: (meta.color ?? '#6B7280') + '21',
                          display: 'grid', placeItems: 'center', fontSize: 17,
                        }}
                      >{meta.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="truncate"
                            style={{ font: '600 14px var(--font-sans)', color: 'var(--ink)' }}
                          >{r.storeName}</span>
                          <BankBadge source={r.source} />
                          {daysLeft !== null && daysLeft >= 0 && (
                            <span
                              style={{
                                font: '700 9px var(--font-sans)', padding: '2px 6px',
                                borderRadius: 999, flexShrink: 0,
                                background: daysLeft <= 3 ? 'var(--status-error-bg)' : daysLeft <= 7 ? 'var(--status-warning-bg)' : 'var(--status-info-bg)',
                                color: daysLeft <= 3 ? 'var(--status-error)' : daysLeft <= 7 ? 'var(--status-warning)' : 'var(--status-info)',
                              }}
                            >⏰ {daysLeft === 0 ? 'today' : `${daysLeft}d`}</span>
                          )}
                        </span>
                        <span
                          className="block mt-0.5 truncate"
                          style={{ font: '400 11px var(--font-sans)', color: 'var(--ink-muted)' }}
                        >
                          {new Date(r.date).toLocaleDateString()} · {meta.label}
                          {r.notes ? ` · ${r.notes}` : ''}
                        </span>
                      </span>
                      <span
                        className="shrink-0"
                        style={{ font: '700 14px var(--font-sans)', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
                      >{fmtFrom(r.total, r.currency)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* HISTORY tab — detail view */}
        {tab === 'history' && selectedReceipt && (
          <div className="space-y-4">
            <button onClick={() => setSelectedReceipt(null)} className="flex items-center gap-1 text-blue-600 text-sm font-medium">
              ← Back
            </button>

            <div className="bg-blue-600 text-white rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg">{selectedReceipt.storeName}</p>
                <BankBadge source={selectedReceipt.source} variant="header" />
              </div>
              <p className="text-sm opacity-60">{new Date(selectedReceipt.date).toLocaleString()}</p>
              <p className="text-3xl font-bold mt-1">{fmtFrom(selectedReceipt.total, selectedReceipt.currency)}</p>
            </div>

            {/* Provenance & confidence — transparency cues */}
            {(() => {
              const confs = selectedReceipt.items
                .map((i) => i.confidence)
                .filter((n): n is number => typeof n === 'number');
              const avg = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
              const src = selectedReceipt.source;
              const provenance =
                src === 'bank-sync'   ? { icon: '🏦', text: 'Parsed automatically from a bank email' }
              : src === 'bank-import' ? { icon: '📂', text: 'Imported from a bank statement' }
              :                          { icon: '📷', text: 'Scanned from a photo receipt' };
              const lowConf = avg !== null && avg < 0.6;
              return (
                <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm p-4 flex items-start gap-3`}>
                  <span className="text-lg leading-none shrink-0">{provenance.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${dm ? 'text-gray-200' : 'text-gray-700'}`}>
                      {provenance.text}
                    </p>
                    {avg !== null && (
                      <p className={`text-xs mt-0.5 ${lowConf ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                        {lowConf ? '⚠ ' : ''}Detected with {Math.round(avg * 100)}% confidence
                        {lowConf ? ' — tap an item to verify the category' : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            <ItemList items={selectedReceipt.items} currency={selectedReceipt.currency} onItemChange={(item) => {
              // Persist category correction as merchant override for bank transactions
              if (selectedReceipt.source === 'bank-sync' || selectedReceipt.source === 'bank-import') {
                saveOverride(merchantKey(selectedReceipt.storeName), item.category);
              }
              handleItemChange(item);
            }} editable />

            {/* Notes */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm p-4`}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Note</label>
              <textarea
                rows={2}
                placeholder="Add a note (e.g. business meal, reimbursable…)"
                className={`w-full text-sm resize-none focus:outline-none placeholder-gray-300 ${dm ? 'bg-gray-800 text-white' : 'text-gray-700'}`}
                defaultValue={selectedReceipt.notes ?? ''}
                onBlur={(e) => {
                  const notes = e.target.value.trim() || undefined;
                  const updated = { ...selectedReceipt, notes };
                  updateReceipt(updated);
                  setSelectedReceipt(updated);
                }}
              />
            </div>

            {/* Return window */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm p-4`}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">⏰ Return Deadline</label>
                {selectedReceipt.returnDeadline && (() => {
                  const daysLeft = Math.ceil((new Date(selectedReceipt.returnDeadline).getTime() - Date.now()) / 86400000);
                  return (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      daysLeft < 0 ? 'bg-gray-100 text-gray-400 dark:bg-gray-700' :
                      daysLeft <= 3 ? 'bg-red-100 text-red-600 dark:bg-red-900/30' :
                      daysLeft <= 7 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'
                    }`}>
                      {daysLeft < 0 ? 'Expired' : daysLeft === 0 ? 'Last day!' : `${daysLeft}d left`}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[30, 60, 90].map((days) => {
                  const d = new Date(selectedReceipt.date);
                  d.setDate(d.getDate() + days);
                  const iso = d.toISOString().split('T')[0];
                  return (
                    <button key={days}
                      onClick={() => {
                        const updated = { ...selectedReceipt, returnDeadline: iso };
                        updateReceipt(updated); setSelectedReceipt(updated);
                      }}
                      className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${
                        selectedReceipt.returnDeadline === iso
                          ? 'bg-blue-600 text-white border-blue-600'
                          : dm ? 'border-gray-600 text-gray-300 hover:border-blue-500' : 'border-gray-200 text-gray-600 hover:border-blue-400'
                      }`}>
                      {days}d
                    </button>
                  );
                })}
                {selectedReceipt.returnDeadline && (
                  <button
                    onClick={() => {
                      const updated = { ...selectedReceipt, returnDeadline: undefined };
                      updateReceipt(updated); setSelectedReceipt(updated);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-xl border font-medium ${dm ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-400'} hover:border-red-300 hover:text-red-500 transition-colors`}>
                    Clear
                  </button>
                )}
              </div>
              {selectedReceipt.returnDeadline && (
                <p className="text-xs text-gray-400 mt-2">
                  Return by: {new Date(selectedReceipt.returnDeadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button onClick={() => handleShare(selectedReceipt)}
                className={`flex-1 border ${dm ? 'border-blue-700 text-blue-400' : 'border-blue-300 text-blue-600'} py-3 rounded-xl text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}>
                Share 📤
              </button>
              <button onClick={() => exportReceiptsCsv([selectedReceipt])}
                className={`flex-1 border ${dm ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'} py-3 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}>
                Export ⬇
              </button>
            </div>

            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="w-full border border-red-300 text-red-500 py-3 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors">
                Delete Receipt
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => { removeReceipt(selectedReceipt.id); setSelectedReceipt(null); }}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors">
                  Confirm Delete
                </button>
              </div>
            )}
          </div>
        )}
        {/* SETTINGS tab */}
        {tab === 'settings' && (
          <div className="space-y-4">
            {/* Account */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Account</h3>
              </div>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xl shrink-0">
                  {user.email?.[0].toUpperCase() ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800 dark:text-white truncate">{user.email}</p>
                  <p className="text-xs text-gray-400">{receipts.length} transaction{receipts.length !== 1 ? 's' : ''} synced</p>
                </div>
              </div>
              <div className="px-4 pb-3">
                <button onClick={signOut}
                  className="w-full border border-red-200 text-red-500 dark:border-red-800 dark:text-red-400 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  Sign Out
                </button>
              </div>
            </div>

            {/* Appearance */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Appearance</h3>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">Dark Mode</p>
                  <p className="text-xs text-gray-400">Switch between light and dark themes</p>
                </div>
                <button
                  onClick={() => setDarkMode((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-gray-200'}`}
                  aria-label="Toggle dark mode"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Notifications */}
            {notificationsSupported() && (
              <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Notifications</h3>
                </div>
                <div className="px-4 py-3">
                  {notificationsGranted() ? (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🔔</span>
                      <div>
                        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Notifications enabled</p>
                        <p className="text-xs text-gray-400">You'll be alerted about budget limits and return deadlines</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Get alerted when you're near a budget limit or a return window is expiring.
                      </p>
                      <button onClick={requestNotificationPermission}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
                        🔔 Enable Notifications
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Weekly email digest */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Weekly Email Digest</h3>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">Spending summary email</p>
                  <p className="text-xs text-gray-400 mt-0.5">Every Monday — your top categories, biggest purchase, and budget status</p>
                </div>
                <button
                  onClick={() => setEmailDigestPref(!emailDigest)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${emailDigest ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                  aria-label="Toggle weekly email digest"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${emailDigest ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {emailDigest && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">✓ You'll receive a weekly digest at {user.email}</p>
                </div>
              )}
            </div>

            {/* Currency */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Currency</h3>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs text-gray-400 mb-3">All amounts are displayed in your chosen currency</p>
                <div className="grid grid-cols-2 gap-2">
                  {CURRENCIES.map((c) => (
                    <button key={c.code} onClick={() => setCurrency(c.code as CurrencyCode)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        currency === c.code
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : dm ? 'border-gray-600 text-gray-300 hover:border-gray-500' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}>
                      <span className="text-lg">{c.flag}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{c.symbol} {c.code}</p>
                        <p className="text-[10px] text-gray-400 truncate">{c.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Data */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Data</h3>
              </div>
              <div className="px-4 py-3 space-y-2">
                <button onClick={() => exportReceiptsCsv(receipts)}
                  className={`w-full flex items-center gap-3 ${dm ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} rounded-xl p-2.5 transition-colors text-left`}>
                  <span className="text-xl">⬇️</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">Export all to CSV</p>
                    <p className="text-xs text-gray-400">Download {receipts.length} transaction{receipts.length !== 1 ? 's' : ''} as spreadsheet</p>
                  </div>
                </button>
                <button onClick={() => setBankConnectOpen(true)}
                  className={`w-full flex items-center gap-3 ${dm ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} rounded-xl p-2.5 transition-colors text-left`}>
                  <span className="text-xl">🏦</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">Connect bank / Import CSV</p>
                    <p className="text-xs text-gray-400">
                      {bankConnections.length > 0
                        ? `${bankConnections.length} bank${bankConnections.length !== 1 ? 's' : ''} connected`
                        : 'Upload bank statement or set up auto sync'}
                    </p>
                  </div>
                  {bankConnections.length > 0 && (
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-semibold shrink-0">✓</span>
                  )}
                </button>
                <button onClick={() => setEmailGuideOpen(true)}
                  className={`w-full flex items-center gap-3 ${dm ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} rounded-xl p-2.5 transition-colors text-left`}>
                  <span className="text-xl">📧</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">Auto-track via email</p>
                    <BankSyncStatus userId={userId} />
                  </div>
                </button>
              </div>
            </div>

            {/* Budgets shortcut */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Budgets</h3>
              </div>
              <button onClick={() => setBudgetOpen(true)}
                className={`w-full flex items-center gap-3 px-4 py-3 ${dm ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition-colors text-left`}>
                <span className="text-xl">💰</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-white">Set spending budgets</p>
                  <p className="text-xs text-gray-400">Track weekly and monthly limits per category</p>
                </div>
                <span className="text-gray-300 dark:text-gray-600">›</span>
              </button>
            </div>

            {/* App info */}
            <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl shadow-sm overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-semibold text-gray-800 dark:text-white text-sm">About</h3>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">App</span>
                  <span className="font-medium text-gray-800 dark:text-white">Spendora</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">OCR engine</span>
                  <span className="font-medium text-gray-800 dark:text-white">Tesseract.js</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Storage</span>
                  <span className="font-medium text-gray-800 dark:text-white">Supabase cloud</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Receipts</span>
                  <span className="font-medium text-gray-800 dark:text-white">{receipts.length} stored</span>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {budgetOpen && <BudgetModal budgets={budgets} onSave={updateBudgets} onClose={() => setBudgetOpen(false)} />}
      {bankConnectOpen && (
        <BankConnectionModal
          connections={bankConnections}
          overrides={merchantOverrides}
          onImport={(receipts, bankId, bankName) => handleBankImport(receipts, bankId, bankName)}
          onClose={() => setBankConnectOpen(false)}
        />
      )}
      {emailGuideOpen && (
        <EmailSetupGuide
          userId={userId}
          onToast={(m) => setToast(m)}
          onClose={() => setEmailGuideOpen(false)}
        />
      )}
      {wrappedOpen && <SpendingWrapped receipts={receipts} onClose={() => setWrappedOpen(false)} />}

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-20 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 rounded-2xl shadow-lg animate-bounce-once">
            ✓ {toast}
          </div>
        </div>
      )}

      {/* ── Bottom nav ──────────────────────────────────────────── */}
      <nav className={`fixed bottom-0 left-0 right-0 ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t z-40`}>
        <div className="max-w-lg mx-auto flex">
          {NAV_TABS.map(({ id, label, icon }) => (
            <button key={id} onClick={() => switchTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-all active:scale-95 ${
                tab === id ? 'text-blue-600' : dm ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <span className="relative text-xl leading-none">
                {icon}
                {id === 'history' && receipts.length > 0 && (
                  <span className="absolute -top-1 -right-2 bg-blue-600 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
                    {receipts.length > 99 ? '99+' : receipts.length}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
