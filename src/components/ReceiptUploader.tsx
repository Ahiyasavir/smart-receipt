import React, { useRef, useState, useCallback } from 'react';
import { Receipt, ReceiptItem } from '../types';
import { runOCR } from '../utils/ocr';
import { parseReceiptText, ParseResult } from '../utils/receiptParser';
import { classifyFailureMode, getScanExplanation, ScanDiagnostic } from '../utils/scanDiagnostics';
import { MOCK_RECEIPT_TEXT } from '../utils/mockReceipt';
import ItemList from './ItemList';
import RawOCRView from './RawOCRView';
import ParserDebugPanel from './ParserDebugPanel';

// ─── MVP scope ───────────────────────────────────────────────────────────────
// Supported: clear printed English supermarket receipts, flat and well-lit.
// Not supported: crumpled receipts, Hebrew/non-Latin scripts, camera captures,
//               handwritten text, multi-column layouts.

interface Props {
  onSave: (receipt: Receipt) => void;
}

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

// Build the persisted Receipt and the transient parse metadata separately.
function buildDraft(rawText: string): { receipt: Receipt; result: ParseResult } {
  const result = parseReceiptText(rawText);
  const receipt: Receipt = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    rawText,
    items: result.items,
    total: result.total,
    storeName: result.storeName,
  };
  return { receipt, result };
}

export default function ReceiptUploader({ onSave }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [scanState,      setScanState]      = useState<ScanState>('idle');
  const [progress,       setProgress]       = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [rawText,        setRawText]        = useState('');
  const [draft,          setDraft]          = useState<Receipt | null>(null);
  const [parseResult,    setParseResult]    = useState<ParseResult | null>(null);
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [diagnostic,     setDiagnostic]     = useState<ScanDiagnostic | null>(null);

  const reset = () => {
    setScanState('idle');
    setDraft(null);
    setParseResult(null);
    setRawText('');
    setPreviewUrl(null);
    setProgress(0);
    setProgressStatus('');
    setDiagnostic(null);
  };

  const processFile = useCallback(async (file: File) => {
    setScanState('scanning');
    setProgress(0);
    setDraft(null);
    setParseResult(null);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const text = await runOCR(file, (pct, status) => {
        setProgress(pct);
        setProgressStatus(status);
      });
      const { receipt, result } = buildDraft(text);
      setRawText(text);
      setDraft(receipt);
      setParseResult(result);
      setDiagnostic(classifyFailureMode(text, result));
      setScanState('done');
    } catch (err) {
      console.error('OCR error:', err);
      setScanState('error');
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) processFile(file);
  };

  const handleMockScan = () => {
    const { receipt, result } = buildDraft(MOCK_RECEIPT_TEXT);
    setRawText(MOCK_RECEIPT_TEXT);
    setDraft(receipt);
    setParseResult(result);
    setDiagnostic(classifyFailureMode(MOCK_RECEIPT_TEXT, result));
    setScanState('done');
    setPreviewUrl(null);
  };

  // Re-parse when the user edits raw OCR text; re-classify quality based on new parse.
  const handleRawTextChange = (newText: string) => {
    setRawText(newText);
    if (!draft) return;
    const result = parseReceiptText(newText);
    setDraft({ ...draft, rawText: newText, items: result.items, total: result.total, storeName: result.storeName });
    setParseResult(result);
    setDiagnostic(classifyFailureMode(newText, result));
  };

  const handleItemChange = (item: ReceiptItem) => {
    if (!draft) return;
    const items = draft.items.map((i) => (i.id === item.id ? item : i));
    const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    setDraft({ ...draft, items, total });
  };

  const handleSave = () => {
    if (!draft) return;
    onSave({ ...draft, imageDataUrl: undefined });
    reset();
  };

  /* ── Idle / Error ───────────────────────────────────────────── */
  if (scanState === 'idle' || scanState === 'error') {
    return (
      <div className="space-y-3">
        {/* Scope notice — honest about what works */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 space-y-1">
          <p className="font-semibold">Supported receipts only</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700">
            <li>Printed English supermarket receipts</li>
            <li>Flat, well-lit, in-focus photo or scan</li>
            <li>Standard single-column format</li>
          </ul>
          <p className="text-amber-600 pt-0.5">Hebrew and crumpled receipts are not supported yet.</p>
        </div>

        {/* Upload zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-blue-300 rounded-2xl p-8 text-center cursor-pointer hover:bg-blue-50 active:bg-blue-100 transition-colors select-none"
        >
          <div className="text-4xl mb-2">📄</div>
          <p className="text-gray-700 font-semibold">Upload receipt image</p>
          <p className="text-xs text-gray-400 mt-1">JPG · PNG · HEIC · drag &amp; drop</p>
        </div>

        <button
          onClick={handleMockScan}
          className="w-full text-blue-600 text-sm text-center py-2 hover:underline"
        >
          Use sample receipt (for testing)
        </button>

        {scanState === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
            OCR could not run on this file. Try a different image format or a smaller file.
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  /* ── Scanning ───────────────────────────────────────────────── */
  if (scanState === 'scanning') {
    return (
      <div className="space-y-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Receipt preview"
            className="w-full max-h-52 object-contain rounded-2xl bg-gray-100"
          />
        )}
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center space-y-3">
          <div className="text-3xl animate-pulse">🔍</div>
          <p className="font-semibold text-gray-700">Reading receipt…</p>
          <p className="text-xs text-gray-400 capitalize">{progressStatus || 'preparing…'}</p>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-500">{progress}%</p>
        </div>
      </div>
    );
  }

  /* ── Done ───────────────────────────────────────────────────── */
  if (!draft || !parseResult || !diagnostic) return null;

  const { mode } = diagnostic;
  const isErrorState = mode === 'empty' || mode === 'blurry' || mode === 'rotated' || mode === 'format-unsupported';

  // ── Failure states: specific explanation + retry ────────────────────────────
  if (isErrorState) {
    const { heading, detail, tips } = getScanExplanation(diagnostic);
    return (
      <div className="space-y-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Receipt"
            className="w-full max-h-44 object-contain rounded-2xl bg-gray-100"
          />
        )}

        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 space-y-2">
          <p className="font-semibold text-red-800">{heading}</p>
          <p className="text-sm text-red-700">{detail}</p>
          {tips.length > 0 && (
            <ul className="text-xs text-red-600 list-disc list-inside space-y-0.5 pt-1">
              {tips.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          )}
        </div>

        {/* Raw OCR text — expanded so the user can see what was actually extracted */}
        <RawOCRView rawText={rawText} onTextChange={handleRawTextChange} startExpanded />

        {parseResult?.classifiedLines && parseResult.classifiedLines.length > 0 && (
          <ParserDebugPanel lines={parseResult.classifiedLines} />
        )}

        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Good / partial: show item list with applicable warnings ────────────────
  const partialTips = getScanExplanation(diagnostic).tips;

  return (
    <div className="space-y-4">
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Receipt"
          className="w-full max-h-44 object-contain rounded-2xl bg-gray-100"
        />
      )}

      {/* Incomplete warning — significant amount unaccounted for + suspicious lines */}
      {parseResult.isIncomplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Receipt looks incomplete</p>
            <span className="text-xs font-mono text-amber-600">
              {Math.round(diagnostic.completenessRatio * 100)}% captured
            </span>
          </div>

          {/* Completeness bar */}
          <div className="w-full bg-amber-200 rounded-full h-1.5">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.round(diagnostic.completenessRatio * 100)}%` }}
            />
          </div>

          <p>
            {parseResult.suspiciousLines.length > 0
              ? `${parseResult.suspiciousLines.length} line${parseResult.suspiciousLines.length > 1 ? 's' : ''} had prices but couldn't be matched to items.`
              : 'Some items could not be read.'}{' '}
            Edit the raw OCR text below to correct and re-parse.
          </p>

          {/* Show up to 3 suspicious lines so the user can see what was dropped */}
          {parseResult.suspiciousLines.length > 0 && (
            <div className="text-xs text-amber-700 space-y-1">
              <p className="font-medium">Unmatched lines:</p>
              <div className="bg-amber-100 rounded-lg px-2 py-1.5 space-y-0.5 font-mono">
                {parseResult.suspiciousLines.slice(0, 3).map((line) => (
                  <p key={line} className="truncate text-amber-800">{line}</p>
                ))}
                {parseResult.suspiciousLines.length > 3 && (
                  <p className="text-amber-500 not-font-mono">
                    +{parseResult.suspiciousLines.length - 3} more — see raw text below
                  </p>
                )}
              </div>
            </div>
          )}

          {partialTips.length > 0 && (
            <div className="text-xs text-amber-700 pt-0.5">
              <p className="font-medium mb-0.5">Possible reasons:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {partialTips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Mismatch warning — shown when item sum diverges from detected total */}
      {!parseResult.isIncomplete && parseResult.mismatch && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Item total may be incomplete</p>
            <span className="text-xs font-mono text-amber-600">
              {Math.round(diagnostic.completenessRatio * 100)}% captured
            </span>
          </div>

          {diagnostic.completenessRatio < 0.90 && (
            <div className="w-full bg-amber-200 rounded-full h-1.5">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round(diagnostic.completenessRatio * 100)}%` }}
              />
            </div>
          )}

          <p>
            Parsed items sum to{' '}
            <strong>${parseResult.itemSum.toFixed(2)}</strong>, but the receipt
            total is{' '}
            <strong>${parseResult.total.toFixed(2)}</strong> (
            {Math.round(
              (Math.abs(parseResult.itemSum - parseResult.total) /
                parseResult.total) *
                100,
            )}
            % difference).
          </p>
          {partialTips.length > 0 && (
            <div className="text-xs text-amber-700 pt-0.5">
              <p className="font-medium mb-0.5">Possible reasons:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {partialTips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Detected total */}
      <div className="bg-blue-600 text-white rounded-2xl p-4 text-center">
        <p className="text-xs uppercase tracking-wide opacity-70">
          {parseResult.mismatch ? 'Receipt Total' : 'Total'}
        </p>
        <p className="text-3xl font-bold">${draft.total.toFixed(2)}</p>
        <p className="text-sm opacity-60 mt-0.5">{draft.storeName}</p>
      </div>

      {/* Scan quality summary — compact one-line indicator for good scans with caveats */}
      {mode === 'partial' && !parseResult.isIncomplete && !parseResult.mismatch && (
        <div className="flex items-center gap-2 px-1 text-xs text-gray-400">
          <div className="flex-1 bg-gray-100 rounded-full h-1">
            <div
              className="bg-blue-400 h-1 rounded-full"
              style={{ width: `${Math.round(diagnostic.completenessRatio * 100)}%` }}
            />
          </div>
          <span>{Math.round(diagnostic.completenessRatio * 100)}% of total captured</span>
        </div>
      )}

      {/* Item list */}
      <ItemList items={draft.items} onItemChange={handleItemChange} editable />

      {/* Raw OCR for manual correction */}
      <RawOCRView rawText={rawText} onTextChange={handleRawTextChange} />

      {parseResult?.classifiedLines && parseResult.classifiedLines.length > 0 && (
        <ParserDebugPanel lines={parseResult.classifiedLines} />
      )}

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-50"
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700"
        >
          Save Receipt
        </button>
      </div>
    </div>
  );
}
