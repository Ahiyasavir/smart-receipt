import { useState, useRef } from 'react';
import { Receipt, ReceiptItem } from '../types';
import { classifyCategory } from '../utils/categoryClassifier';

interface Props {
  onImport: (receipts: Receipt[]) => void;
  onClose: () => void;
}

// Try to parse a bank CSV. Handles most common formats:
// - Date, Description, Amount  (positive = income, negative = expense)
// - Date, Description, Debit, Credit
function parseBankCsv(text: string): Receipt[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect header row
  const header = lines[0].toLowerCase().replace(/"/g, '');
  const cols   = header.split(',').map((c) => c.trim());

  const dateIdx = cols.findIndex((c) => /^date/.test(c));
  const descIdx = cols.findIndex((c) => /desc|narr|merchant|payee|detail/.test(c));
  const amtIdx  = cols.findIndex((c) => /^amount$|^debit$|^withdrawal/.test(c));

  if (dateIdx < 0 || descIdx < 0 || amtIdx < 0) {
    throw new Error(
      'Could not identify Date, Description, and Amount columns. ' +
      `Found: ${cols.join(', ')}`
    );
  }

  const receipts: Receipt[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    // Parse CSV respecting quoted fields
    const fields: string[] = [];
    let cur = '', inQ = false;
    for (const ch of raw + ',') {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }

    const dateStr = fields[dateIdx] ?? '';
    const desc    = fields[descIdx] ?? '';
    const amtStr  = (fields[amtIdx] ?? '').replace(/[$,]/g, '');
    const amount  = parseFloat(amtStr);

    if (!dateStr || !desc || isNaN(amount) || amount <= 0) continue; // skip income / blanks

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;

    const cat = classifyCategory(desc);
    const item: ReceiptItem = {
      id:       crypto.randomUUID(),
      name:     desc,
      amount,
      category: cat,
      raw:      raw,
    };

    receipts.push({
      id:        crypto.randomUUID(),
      date:      date.toISOString(),
      storeName: desc,
      rawText:   raw,
      items:     [item],
      total:     amount,
      source:    'bank-import',
    });
  }

  return receipts;
}

export default function BankImportModal({ onImport, onClose }: Props) {
  const fileRef   = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Receipt[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLoading(false);
      try {
        const parsed = parseBankCsv(ev.target?.result as string);
        if (parsed.length === 0) {
          setError('No expense rows found. Make sure the file has expense (debit) rows with positive amounts.');
          return;
        }
        setPreview(parsed);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!preview) return;
    onImport(preview);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Import Bank Statement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
          {!preview ? (
            <>
              <p className="text-sm text-gray-600">
                Export a CSV from your bank (most banks offer this in the transactions or history section),
                then upload it here. Expenses are imported as individual receipts with automatic category detection.
              </p>
              <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">Supported formats:</p>
                <p>• Date, Description, Amount</p>
                <p>• Date, Description, Debit, Credit</p>
                <p>Works with Chase, Bank of America, Barclays, and most major banks.</p>
              </div>
              {error && (
                <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700">{error}</div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="w-full border-2 border-dashed border-blue-300 rounded-xl py-8 text-blue-600 text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Parsing…' : '📂 Choose CSV file'}
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                Found <strong>{preview.length}</strong> expense rows. Review below:
              </p>
              <ul className="divide-y divide-gray-100 text-sm max-h-60 overflow-y-auto">
                {preview.slice(0, 50).map((r) => (
                  <li key={r.id} className="py-2 flex justify-between">
                    <span className="truncate text-gray-700 max-w-[60%]">{r.storeName}</span>
                    <span className="text-blue-600 font-medium">${r.total.toFixed(2)}</span>
                  </li>
                ))}
                {preview.length > 50 && (
                  <li className="py-2 text-gray-400 text-xs">…and {preview.length - 50} more</li>
                )}
              </ul>
              <button
                onClick={() => { setPreview(null); setError(null); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← Choose a different file
              </button>
            </>
          )}
        </div>

        {preview && (
          <div className="px-4 pb-5 pt-2 shrink-0 border-t border-gray-100">
            <button
              onClick={handleImport}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
            >
              Import {preview.length} Transactions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
