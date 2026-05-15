import { useState, useEffect, useRef, useMemo } from 'react';
import { AppTab, Receipt, ReceiptItem } from './types';
import { useAuth } from './hooks/useAuth';
import { useReceipts } from './hooks/useReceipts';
import { useBudgets } from './hooks/useBudgets';
import AuthScreen from './components/AuthScreen';
import ReceiptUploader from './components/ReceiptUploader';
import Dashboard from './components/Dashboard';
import ItemList from './components/ItemList';
import BudgetModal from './components/BudgetModal';
import BankImportModal from './components/BankImportModal';
import { exportReceiptsCsv } from './utils/csvExport';
import { CATEGORY_META } from './utils/categoryClassifier';

const NAV_TABS = [
  { id: 'scan'      as const, label: 'Scan',      icon: '📷' },
  { id: 'dashboard' as const, label: 'Dashboard',  icon: '📊' },
  { id: 'history'   as const, label: 'History',    icon: '🗂️'  },
];

// ── Spending alert: check if any category exceeds its monthly budget ──────────
function useSpendingAlerts(
  receipts: Receipt[],
  budgets: ReturnType<typeof useBudgets>['budgets'],
) {
  return useMemo(() => {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthly = receipts.filter((r) => new Date(r.date) >= start);

    const totals: Partial<Record<string, number>> = {};
    for (const r of monthly) {
      for (const item of r.items) {
        totals[item.category] = (totals[item.category] ?? 0) + item.amount;
      }
    }

    const alerts: { category: string; spent: number; budget: number; label: string }[] = [];
    for (const [cat, budget] of Object.entries(budgets.monthly)) {
      if (!budget) continue;
      const spent = totals[cat] ?? 0;
      if (spent > budget * 0.8) {
        alerts.push({
          category: cat,
          spent,
          budget,
          label: CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label ?? cat,
        });
      }
    }
    return alerts;
  }, [receipts, budgets]);
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const userId = user?.id ?? '';

  const [tab,             setTab]             = useState<AppTab>('scan');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [confirmDelete,   setConfirmDelete]   = useState(false);
  const [historySearch,   setHistorySearch]   = useState('');
  const [toast,           setToast]           = useState<string | null>(null);
  const [budgetOpen,      setBudgetOpen]      = useState(false);
  const [bankImportOpen,  setBankImportOpen]  = useState(false);
  const [darkMode,        setDarkMode]        = useState(() => localStorage.getItem('smartreceipt_dark') === '1');

  // PWA install prompt
  const installPromptRef = useRef<Event & { prompt: () => Promise<void> } | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  // Dark mode: toggle class on <html>
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

  const { receipts, addReceipt, updateItem, updateReceipt, removeReceipt } = useReceipts(userId);
  const { budgets, updateBudgets } = useBudgets(userId);
  const spendingAlerts = useSpendingAlerts(receipts, budgets);

  const switchTab = (t: AppTab) => {
    setTab(t);
    setSelectedReceipt(null);
    setHistorySearch('');
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
      `Total: $${receipt.total.toFixed(2)}`,
      '',
      ...receipt.items.map((i) => `• ${i.name}: $${i.amount.toFixed(2)}`),
    ].join('\n');

    if (navigator.share) {
      await navigator.share({ title: `Receipt — ${receipt.storeName}`, text });
    } else {
      await navigator.clipboard.writeText(text);
      setToast('Receipt copied to clipboard');
    }
  };

  const handleBankImport = async (imported: Receipt[]) => {
    let count = 0;
    for (const r of imported) {
      await addReceipt(r);
      count++;
    }
    setToast(`Imported ${count} transactions`);
  };

  const query = historySearch.toLowerCase().trim();
  const filteredReceipts = query
    ? receipts.filter((r) => r.storeName.toLowerCase().includes(query))
    : receipts;
  const historyTotal = receipts.reduce((s, r) => s + r.total, 0);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-3xl animate-pulse">🧾</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  const dm = darkMode;

  return (
    <div className={`min-h-screen ${dm ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className={`${dm ? 'bg-gray-800 shadow-gray-700' : 'bg-white'} shadow-sm sticky top-0 z-40`}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className={`text-lg font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>🧾 SmartReceipt</h1>
          <div className="flex items-center gap-2">
            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode((v) => !v)}
              className={`rounded-full w-8 h-8 flex items-center justify-center text-base ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
              title="Toggle dark mode"
            >
              {dm ? '☀️' : '🌙'}
            </button>
            {/* User email + sign out */}
            <button
              onClick={signOut}
              className={`flex items-center gap-1.5 ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} rounded-full px-3 py-1 transition-colors`}
              title="Sign out"
            >
              <span className="text-xs font-medium truncate max-w-[120px]" style={{ color: dm ? '#d1d5db' : '#374151' }}>
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
          <p className="text-sm font-medium">Add SmartReceipt to your home screen</p>
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
            <div
              key={a.category}
              className={`rounded-xl px-3 py-2 flex items-center gap-2 text-sm ${
                a.spent > a.budget
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
              }`}
            >
              <span>{a.spent > a.budget ? '🚨' : '⚠️'}</span>
              <span>
                <strong>{a.label}</strong>:&nbsp;
                {a.spent > a.budget
                  ? `over budget by $${(a.spent - a.budget).toFixed(2)}`
                  : `${Math.round((a.spent / a.budget) * 100)}% of $${a.budget.toFixed(0)} monthly budget`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-28">

        {/* SCAN tab */}
        {tab === 'scan' && (
          <ReceiptUploader
            onSave={(receipt) => {
              addReceipt(receipt);
              setToast(`Saved — ${receipt.storeName}`);
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
          />
        )}

        {/* HISTORY tab — list view */}
        {tab === 'history' && !selectedReceipt && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className={`font-semibold text-sm uppercase tracking-wide ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
                Saved Receipts
              </h2>
              <div className="flex items-center gap-2">
                {receipts.length > 0 && (
                  <p className="text-xs text-gray-400">
                    {receipts.length} · ${historyTotal.toFixed(2)}
                  </p>
                )}
                {/* Export CSV */}
                {receipts.length > 0 && (
                  <button
                    onClick={() => exportReceiptsCsv(receipts)}
                    className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                    title="Export to CSV"
                  >
                    ⬇ CSV
                  </button>
                )}
                {/* Bank import */}
                <button
                  onClick={() => setBankImportOpen(true)}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                  title="Import bank statement"
                >
                  ⬆ Bank
                </button>
              </div>
            </div>

            {receipts.length > 0 && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search by store name…"
                  className={`w-full border rounded-xl pl-8 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm ${
                    dm ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-200'
                  }`}
                />
                {historySearch && (
                  <button
                    onClick={() => setHistorySearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {receipts.length === 0 && (
              <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-10 text-center shadow-sm`}>
                <div className="text-4xl mb-2">🗂️</div>
                <p className="text-gray-400 text-sm">No saved receipts yet</p>
              </div>
            )}

            {receipts.length > 0 && filteredReceipts.length === 0 && (
              <div className={`${dm ? 'bg-gray-800' : 'bg-white'} rounded-2xl p-8 text-center shadow-sm`}>
                <p className="text-gray-400 text-sm">No results for "{historySearch}"</p>
              </div>
            )}

            {filteredReceipts.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReceipt(r)}
                className={`w-full ${dm ? 'bg-gray-800 hover:bg-gray-750' : 'bg-white hover:shadow-md'} rounded-2xl p-4 shadow-sm text-left active:shadow-sm transition-shadow`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`font-semibold truncate ${dm ? 'text-white' : 'text-gray-800'}`}>{r.storeName}</p>
                      {r.source === 'bank-sync' && (
                        <span className="shrink-0 text-[10px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">🏦 Bank</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(r.date).toLocaleDateString()} · {r.items.length} item{r.items.length !== 1 ? 's' : ''}
                      {r.notes && <span className="ml-1 text-blue-400">· {r.notes}</span>}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-blue-600 ml-3 shrink-0">
                    ${r.total.toFixed(2)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* HISTORY tab — detail view */}
        {tab === 'history' && selectedReceipt && (
          <div className="space-y-4">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="flex items-center gap-1 text-blue-600 text-sm font-medium"
            >
              ← Back
            </button>

            <div className="bg-blue-600 text-white rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg">{selectedReceipt.storeName}</p>
                {selectedReceipt.source === 'bank-sync' && (
                  <span className="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full">🏦 Auto-synced</span>
                )}
              </div>
              <p className="text-sm opacity-60">{new Date(selectedReceipt.date).toLocaleString()}</p>
              <p className="text-3xl font-bold mt-1">${selectedReceipt.total.toFixed(2)}</p>
            </div>

            <ItemList
              items={selectedReceipt.items}
              onItemChange={handleItemChange}
              editable
            />

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

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleShare(selectedReceipt)}
                className={`flex-1 border ${dm ? 'border-blue-700 text-blue-400' : 'border-blue-300 text-blue-600'} py-3 rounded-xl text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
              >
                Share 📤
              </button>
              <button
                onClick={() => exportReceiptsCsv([selectedReceipt])}
                className={`flex-1 border ${dm ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-600'} py-3 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
              >
                Export CSV ⬇
              </button>
            </div>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full border border-red-300 text-red-500 py-3 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Delete Receipt
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    removeReceipt(selectedReceipt.id);
                    setSelectedReceipt(null);
                  }}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals ──────────────────────────────────────────────── */}
      {budgetOpen && (
        <BudgetModal budgets={budgets} onSave={updateBudgets} onClose={() => setBudgetOpen(false)} />
      )}
      {bankImportOpen && (
        <BankImportModal onImport={handleBankImport} onClose={() => setBankImportOpen(false)} />
      )}

      {/* ── Toast ───────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-20 left-0 right-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 rounded-2xl shadow-lg">
            ✓ {toast}
          </div>
        </div>
      )}

      {/* ── Bottom nav ──────────────────────────────────────────── */}
      <nav className={`fixed bottom-0 left-0 right-0 ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t z-40`}>
        <div className="max-w-lg mx-auto flex">
          {NAV_TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-colors ${
                tab === id
                  ? 'text-blue-600'
                  : dm ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
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
