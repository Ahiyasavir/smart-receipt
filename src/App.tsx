import { useState } from 'react';
import { AppTab, Receipt, ReceiptItem } from './types';
import { useReceipts } from './hooks/useReceipts';
import ReceiptUploader from './components/ReceiptUploader';
import Dashboard from './components/Dashboard';
import ItemList from './components/ItemList';

const NAV_TABS = [
  { id: 'scan'      as const, label: 'Scan',      icon: '📷' },
  { id: 'dashboard' as const, label: 'Dashboard',  icon: '📊' },
  { id: 'history'   as const, label: 'History',    icon: '🗂️' },
];

export default function App() {
  const [tab,             setTab]             = useState<AppTab>('scan');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  const { receipts, addReceipt, updateItem, removeReceipt } = useReceipts();

  const switchTab = (t: AppTab) => {
    setTab(t);
    setSelectedReceipt(null);
  };

  // Update one item in the selected receipt and persist
  const handleItemChange = (item: ReceiptItem) => {
    if (!selectedReceipt) return;
    updateItem(selectedReceipt.id, item);
    // Also update local state for immediate UI feedback
    const items = selectedReceipt.items.map((i) => (i.id === item.id ? item : i));
    const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    setSelectedReceipt({ ...selectedReceipt, items, total });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">🧾 Receipt Scanner</h1>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-28">

        {/* SCAN tab */}
        {tab === 'scan' && (
          <ReceiptUploader
            onSave={(receipt) => {
              addReceipt(receipt);
              switchTab('history');
            }}
          />
        )}

        {/* DASHBOARD tab */}
        {tab === 'dashboard' && <Dashboard receipts={receipts} />}

        {/* HISTORY tab — list view */}
        {tab === 'history' && !selectedReceipt && (
          <div className="space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              Saved Receipts
            </h2>

            {receipts.length === 0 && (
              <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
                <div className="text-4xl mb-2">🗂️</div>
                <p className="text-gray-400 text-sm">No saved receipts yet</p>
              </div>
            )}

            {receipts.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedReceipt(r)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm text-left hover:shadow-md active:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{r.storeName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(r.date).toLocaleDateString()} · {r.items.length} items
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
              <p className="font-bold text-lg">{selectedReceipt.storeName}</p>
              <p className="text-sm opacity-60">
                {new Date(selectedReceipt.date).toLocaleString()}
              </p>
              <p className="text-3xl font-bold mt-1">
                ${selectedReceipt.total.toFixed(2)}
              </p>
            </div>

            <ItemList
              items={selectedReceipt.items}
              onItemChange={handleItemChange}
              editable
            />

            <button
              onClick={() => {
                removeReceipt(selectedReceipt.id);
                setSelectedReceipt(null);
              }}
              className="w-full border border-red-300 text-red-500 py-3 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
            >
              Delete Receipt
            </button>
          </div>
        )}
      </main>

      {/* ── Bottom navigation ────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-inset-bottom">
        <div className="max-w-lg mx-auto flex">
          {NAV_TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition-colors ${
                tab === id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
