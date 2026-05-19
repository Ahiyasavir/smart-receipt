/**
 * BankConnectionModal — the bank-data ingestion entry point.
 *
 * Two real paths:
 *   1. CSV Import   — user downloads a CSV from their bank and uploads it here.
 *                     Works immediately, no backend required.
 *   2. Auto Sync    — instructions to configure the GitHub Actions scraper that
 *                     uses israeli-bank-scrapers.  Honest about what it requires.
 *
 * Neither path stores bank credentials in the frontend.
 */

import { useState, useRef } from 'react';
import { Receipt, ReceiptItem, BankConnection, Category } from '../types';
import { classifyCategory } from '../utils/categoryClassifier';
import { normalizeMerchantName, merchantKey } from '../utils/merchantNormalizer';
import { MerchantOverrides } from '../hooks/useMerchantOverrides';

// ── Supported banks ────────────────────────────────────────────────────────────

interface BankDef {
  id: string;
  name: string;
  nameHe: string;
  emoji: string;
  color: string;
  csvGuide: string;   // how to export a CSV from this bank's website
  csvUrl?: string;    // direct link to the transactions/history page
}

const BANKS: BankDef[] = [
  {
    id: 'hapoalim', name: 'Bank Hapoalim', nameHe: 'בנק הפועלים',
    emoji: '🏦', color: '#E2001A',
    csvGuide: 'Log in → Accounts → Transaction history → Export → CSV',
    csvUrl: 'https://www.bankhapoalim.co.il',
  },
  {
    id: 'leumi', name: 'Bank Leumi', nameHe: 'בנק לאומי',
    emoji: '🏦', color: '#005CA9',
    csvGuide: 'Log in → My accounts → Transactions → Download → Excel/CSV',
    csvUrl: 'https://hb2.bankleumi.co.il',
  },
  {
    id: 'discount', name: 'Discount Bank', nameHe: 'בנק דיסקונט',
    emoji: '🏦', color: '#F7941D',
    csvGuide: 'Log in → Account activity → Filter dates → Export to Excel',
    csvUrl: 'https://www.discountbank.co.il',
  },
  {
    id: 'mizrahi', name: 'Mizrahi Tefahot', nameHe: 'מזרחי טפחות',
    emoji: '🏦', color: '#00A651',
    csvGuide: 'Log in → My accounts → Account movements → Export → CSV',
    csvUrl: 'https://www.mizrahi-tefahot.co.il',
  },
  {
    id: 'max', name: 'Max / Leumi Card', nameHe: 'מקס',
    emoji: '💳', color: '#7B2D8B',
    csvGuide: 'Log in → Transactions → Download transactions → CSV',
    csvUrl: 'https://www.max.co.il',
  },
  {
    id: 'beinleumi', name: "First Int'l Bank", nameHe: 'בנק הבינלאומי',
    emoji: '🏦', color: '#003087',
    csvGuide: 'Log in → Accounts → Transaction history → Export to Excel',
    csvUrl: 'https://www.fibi.co.il',
  },
  {
    id: 'yahav', name: 'Bank Yahav', nameHe: 'בנק יהב',
    emoji: '🏦', color: '#006B3F',
    csvGuide: 'Log in → My accounts → Account movements → Export',
    csvUrl: 'https://www.bank-yahav.co.il',
  },
  {
    id: 'other', name: 'Other bank', nameHe: 'בנק אחר',
    emoji: '🏛️', color: '#6B7280',
    csvGuide: 'Most banks offer CSV export in the transaction history page. Look for "Export", "Download", or "Excel" buttons.',
  },
];

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseBankCsv(
  text: string,
  bankId: string,
  overrides: MerchantOverrides,
): Receipt[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerRaw = lines[0].replace(/"/g, '');
  const cols = headerRaw.split(',').map((c) => c.trim().toLowerCase());

  const dateIdx = cols.findIndex((c) => /^date|^תאריך/.test(c));
  const descIdx = cols.findIndex((c) => /desc|narr|merchant|payee|detail|תיאור|פירוט/.test(c));
  const amtIdx  = cols.findIndex((c) => /^amount$|^debit$|^withdrawal$|חיוב|סכום/.test(c));

  if (dateIdx < 0 || descIdx < 0 || amtIdx < 0) {
    throw new Error(
      `Columns not found (date=${dateIdx}, desc=${descIdx}, amount=${amtIdx}). ` +
      `Found: ${cols.join(', ')}`
    );
  }

  const receipts: Receipt[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Parse CSV respecting quoted fields
    const fields: string[] = [];
    let cur = '', inQ = false;
    for (const ch of lines[i] + ',') {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }

    const dateStr = fields[dateIdx] ?? '';
    const rawDesc = fields[descIdx] ?? '';
    const amtRaw  = fields[amtIdx] ?? '';
    const amtStr  = amtRaw.replace(/[$,₪€£]/g, '');
    const amount  = Math.abs(parseFloat(amtStr));
    const currency = amtRaw.includes('$') ? 'USD'
                   : amtRaw.includes('€') ? 'EUR'
                   : amtRaw.includes('£') ? 'GBP'
                   : 'ILS';

    if (!dateStr || !rawDesc || isNaN(amount) || amount <= 0) continue;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const merchant = normalizeMerchantName(rawDesc);
    const key      = merchantKey(rawDesc);
    const cat: Category = overrides[key] ?? classifyCategory(rawDesc, merchant);

    const item: ReceiptItem = {
      id:       crypto.randomUUID(),
      name:     merchant,
      amount,
      category: cat,
      raw:      lines[i],
    };

    receipts.push({
      id:         crypto.randomUUID(),
      date:       date.toISOString(),
      storeName:  merchant,
      rawText:    lines[i],
      items:      [item],
      total:      amount,
      currency,
      source:     'bank-import',
      externalId: `${bankId}_csv_${key}_${date.toISOString().split('T')[0]}_${amount}`,
    });
  }

  return receipts;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Screen = 'select-bank' | 'connect-options' | 'csv-upload' | 'csv-preview' | 'auto-sync-guide';

interface Props {
  connections: BankConnection[];
  overrides:   MerchantOverrides;
  onImport:    (receipts: Receipt[], bankId: string, bankName: string) => void;
  onClose:     () => void;
}

export default function BankConnectionModal({ connections, overrides, onImport, onClose }: Props) {
  const [screen,        setScreen]        = useState<Screen>('select-bank');
  const [selectedBank,  setSelectedBank]  = useState<BankDef | null>(null);
  const [preview,       setPreview]       = useState<Receipt[] | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [loading,       setLoading]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const connectedIds = new Set(connections.map((c) => c.bankId));

  // ── handlers ────────────────────────────────────────────────────────────────

  const selectBank = (bank: BankDef) => {
    setSelectedBank(bank);
    setError(null);
    setScreen('connect-options');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBank) return;
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLoading(false);
      try {
        const parsed = parseBankCsv(ev.target?.result as string, selectedBank.id, overrides);
        if (parsed.length === 0) {
          setError(
            'No expense rows found. Make sure the file contains expense (debit) rows. ' +
            'If amounts are negative in your file, the parser may be skipping them — try a different export format.'
          );
          return;
        }
        setPreview(parsed);
        setScreen('csv-preview');
      } catch (err) {
        setError((err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!preview || !selectedBank) return;
    onImport(preview, selectedBank.id, selectedBank.name);
    onClose();
  };

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            {screen !== 'select-bank' && (
              <button
                onClick={() => {
                  setScreen(screen === 'csv-preview' ? 'csv-upload' : screen === 'csv-upload' || screen === 'auto-sync-guide' ? 'connect-options' : 'select-bank');
                  setError(null);
                  setPreview(null);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm mr-1"
              >←</button>
            )}
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {screen === 'select-bank'      && 'Connect a Bank'}
              {screen === 'connect-options'  && selectedBank?.name}
              {screen === 'csv-upload'       && 'Upload Statement'}
              {screen === 'csv-preview'      && 'Review Transactions'}
              {screen === 'auto-sync-guide'  && 'Auto Sync Setup'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4">

          {/* ── Screen: select bank ── */}
          {screen === 'select-bank' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Select your bank to import transactions or set up automatic sync.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {BANKS.map((bank) => {
                  const connected = connectedIds.has(bank.id);
                  return (
                    <button
                      key={bank.id}
                      onClick={() => selectBank(bank)}
                      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all active:scale-[0.97] ${
                        connected
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                      }`}
                    >
                      {connected && (
                        <span className="absolute top-1.5 right-1.5 text-[9px] bg-emerald-500 text-white px-1.5 rounded-full font-bold">✓</span>
                      )}
                      <span className="text-2xl">{bank.emoji}</span>
                      <div>
                        <p className="text-xs font-semibold text-gray-800 dark:text-white leading-tight">{bank.name}</p>
                        <p className="text-[10px] text-gray-400 leading-tight">{bank.nameHe}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {connections.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Connected</p>
                  {connections.map((c) => (
                    <div key={c.bankId} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{c.bankName}</span>
                      <span className="text-gray-400">
                        {c.transactionCount} txn{c.transactionCount !== 1 ? 's' : ''}
                        {c.lastSync && ` · ${new Date(c.lastSync).toLocaleDateString()}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Screen: connection options ── */}
          {screen === 'connect-options' && selectedBank && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <span className="text-3xl">{selectedBank.emoji}</span>
                <div>
                  <p className="font-semibold text-gray-800 dark:text-white text-sm">{selectedBank.name}</p>
                  <p className="text-xs text-gray-400">{selectedBank.nameHe}</p>
                </div>
              </div>

              {/* Path 1: CSV Import */}
              <button
                onClick={() => setScreen('csv-upload')}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-[var(--brand-200)] dark:border-blue-800 bg-[var(--brand-50)] dark:bg-blue-900/20 hover:border-blue-400 transition-colors text-left"
              >
                <span className="text-2xl mt-0.5">📂</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-[var(--brand-800)] dark:text-[var(--brand-300)]">Import CSV File</p>
                  <p className="text-xs text-[var(--brand-600)] dark:text-[var(--brand-400)] mt-0.5">
                    Download a statement from your bank and upload it here. Works immediately.
                  </p>
                  <p className="text-[11px] text-[var(--brand-600)] dark:text-[var(--brand-600)] mt-1.5 font-medium">
                    {selectedBank.csvGuide}
                  </p>
                </div>
              </button>

              {/* Path 2: Auto Sync */}
              <button
                onClick={() => setScreen('auto-sync-guide')}
                className="w-full flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 transition-colors text-left"
              >
                <span className="text-2xl mt-0.5">⚡</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-800 dark:text-white">Auto Sync</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Transactions sync automatically every 6 hours using a GitHub Actions scraper.
                    Requires technical setup.
                  </p>
                </div>
                <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-semibold shrink-0 mt-0.5">Dev</span>
              </button>
            </div>
          )}

          {/* ── Screen: CSV upload ── */}
          {screen === 'csv-upload' && selectedBank && (
            <div className="space-y-4">
              <div className="bg-[var(--brand-50)] dark:bg-blue-900/20 rounded-xl p-3 text-xs text-[var(--brand-700)] dark:text-[var(--brand-300)] space-y-2">
                <p className="font-semibold">How to export from {selectedBank.name}:</p>
                <p>{selectedBank.csvGuide}</p>
                {selectedBank.csvUrl && (
                  <a
                    href={selectedBank.csvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--brand-600)] dark:text-[var(--brand-400)] hover:underline"
                  >
                    Open {selectedBank.name} ↗
                  </a>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <p className="font-semibold text-gray-700 dark:text-gray-300">Supported CSV formats:</p>
                <p>• Date, Description, Amount (positive = expense)</p>
                <p>• Date, Description, Debit, Credit</p>
                <p>• Hebrew column names (תאריך, תיאור, חיוב)</p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="w-full border-2 border-dashed border-[var(--brand-300)] dark:border-[var(--brand-700)] rounded-xl py-10 text-[var(--brand-600)] dark:text-[var(--brand-400)] text-sm font-medium hover:bg-[var(--brand-50)] dark:hover:bg-blue-900/10 transition-colors disabled:opacity-50"
              >
                {loading ? '⏳ Parsing…' : '📂 Choose CSV file'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {/* ── Screen: CSV preview ── */}
          {screen === 'csv-preview' && preview && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Found <strong>{preview.length}</strong> expense transactions.
                Categories were assigned automatically — you can correct them after import.
              </p>

              {/* Source breakdown */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {(['bank-import'] as const).map(() => {
                  const total = preview.reduce((s, r) => s + r.total, 0);
                  const cats = [...new Set(preview.flatMap((r) => r.items.map((i) => i.category)))].slice(0, 3);
                  return (
                    <>
                      <div key="total" className="bg-[var(--brand-50)] dark:bg-blue-900/20 rounded-xl p-2">
                        <p className="text-[10px] text-gray-400 uppercase">Total</p>
                        <p className="text-sm font-bold text-[var(--brand-700)] dark:text-[var(--brand-300)]">
                          {total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                      <div key="txns" className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2">
                        <p className="text-[10px] text-gray-400 uppercase">Txns</p>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{preview.length}</p>
                      </div>
                      <div key="cats" className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-2">
                        <p className="text-[10px] text-gray-400 uppercase">Categories</p>
                        <p className="text-sm font-bold text-purple-700 dark:text-purple-300">{cats.length}</p>
                      </div>
                    </>
                  );
                })}
              </div>

              {/* Transaction list */}
              <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm max-h-56 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700">
                {preview.slice(0, 60).map((r) => (
                  <li key={r.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-gray-800 dark:text-gray-200 text-xs font-medium">{r.storeName}</p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(r.date).toLocaleDateString()} · {r.items[0]?.category}
                      </p>
                    </div>
                    <span className="text-[var(--brand-600)] dark:text-[var(--brand-400)] font-semibold text-xs shrink-0">
                      {r.total.toFixed(2)}
                    </span>
                  </li>
                ))}
                {preview.length > 60 && (
                  <li className="px-3 py-2 text-gray-400 text-xs text-center">
                    …and {preview.length - 60} more
                  </li>
                )}
              </ul>

              <p className="text-[11px] text-gray-400 text-center">
                Merchant names were cleaned up automatically. You can re-categorise any transaction after import.
              </p>
            </div>
          )}

          {/* ── Screen: auto-sync guide ── */}
          {screen === 'auto-sync-guide' && selectedBank && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                <p className="font-semibold mb-1">⚡ Auto Sync requires technical setup</p>
                <p>
                  Auto sync uses the open-source <strong>israeli-bank-scrapers</strong> library running
                  as a GitHub Actions workflow. It logs into your bank, fetches transactions, and writes
                  them directly to your Spendora account every 6 hours.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Setup steps:</p>

                {[
                  {
                    n: '1',
                    title: 'Fork or clone the repo',
                    body: 'The scraper lives in the smart-receipt repository.',
                  },
                  {
                    n: '2',
                    title: 'Add GitHub Secrets',
                    body: `Go to your repo → Settings → Secrets → Actions, then add:\n` +
                      `SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID\n` +
                      `Plus your bank credentials — see the workflow file for the exact secret names.`,
                  },
                  {
                    n: '3',
                    title: 'Enable the workflow',
                    body: 'The bank-sync.yml workflow will run automatically every 6 hours.',
                  },
                  {
                    n: '4',
                    title: 'Your transactions appear here',
                    body: 'New transactions show up with a 🏦 badge in History and Dashboard.',
                  },
                ].map((step) => (
                  <div key={step.n} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-[var(--brand-100)] dark:bg-blue-900/40 text-[var(--brand-600)] dark:text-[var(--brand-400)] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {step.n}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white">{step.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 whitespace-pre-line">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400">
                <p className="font-semibold mb-1">Why not simpler?</p>
                <p>
                  Israeli bank websites don't offer a public API. The scraper automates a real browser
                  login using Puppeteer. For security, credentials must stay on your own server — never
                  in a shared cloud function.
                </p>
              </div>

              <p className="text-xs text-center text-gray-400">
                In the meantime, use <strong>CSV Import</strong> for instant results.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {(screen === 'csv-preview') && (
          <div className="px-4 pb-5 pt-2 shrink-0 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={handleImport}
              className="w-full bg-[var(--brand-600)] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[var(--brand-700)] transition-colors"
            >
              Import {preview?.length} Transactions
            </button>
          </div>
        )}

        {(screen === 'auto-sync-guide') && (
          <div className="px-4 pb-5 pt-2 shrink-0 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={() => setScreen('csv-upload')}
              className="w-full bg-[var(--brand-600)] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[var(--brand-700)] transition-colors"
            >
              Use CSV Import Instead
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
