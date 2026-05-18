/**
 * EmailSetupGuide — productized "Connect your bank" UX.
 *
 * Pure human language: no webhook URLs, tokens, Supabase, or jargon. Shows the
 * user's private forwarding address, a 3-step setup, live connection status,
 * and management actions (regenerate address / pause). State comes from
 * useBankSync; data isolation + non-guessable alias are enforced server-side.
 */
import { useState } from 'react';
import { useBankSync } from '../hooks/useBankSync';

const BANK_SENDERS = 'max.co.il, cal-online.co.il, isracard.co.il, leumi-card.co.il, chase.com';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

interface Props {
  userId: string;
  onToast?: (m: string) => void;
  onClose: () => void;
}

export default function EmailSetupGuide({ userId, onToast, onClose }: Props) {
  const sync = useBankSync(userId);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    if (!sync.address) return;
    try { await navigator.clipboard.writeText(sync.address); } catch { /* visible to copy manually */ }
    setCopied(true);
    onToast?.('Sync address copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = async () => {
    if (!confirm('Generate a new address? The old one stops working — you must update your Gmail forwarding rule.')) return;
    setBusy(true);
    await sync.regenerate();
    setBusy(false);
    onToast?.('New address generated');
  };

  const togglePause = async () => {
    setBusy(true);
    await sync.setEnabled(!sync.enabled);
    setBusy(false);
    onToast?.(sync.enabled ? 'Bank sync paused' : 'Bank sync resumed');
  };

  // Status pill
  const status = sync.loading
    ? { dot: 'bg-gray-300', text: 'Loading…', cls: 'text-gray-500' }
    : !sync.enabled
      ? { dot: 'bg-amber-400', text: 'Paused', cls: 'text-amber-600 dark:text-amber-400' }
      : sync.connected
        ? { dot: 'bg-emerald-500', text: `Connected · last transaction ${timeAgo(sync.lastReceivedAt)}`, cls: 'text-emerald-600 dark:text-emerald-400' }
        : { dot: 'bg-blue-400 animate-pulse', text: 'Waiting for your first transaction…', cls: 'text-blue-600 dark:text-blue-400' };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Connect your bank</h2>
          <button onClick={onClose} aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${status.dot}`} />
            <span className={`text-xs font-medium ${status.cls}`}>{status.text}</span>
          </div>

          {/* Why */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 px-3 py-3 flex gap-2">
            <span className="text-lg leading-none shrink-0">🔒</span>
            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
              Your bank already emails you for every purchase. Forward those
              alerts to your private address and they’re logged automatically —
              <strong> no bank password, no app to open</strong>.
            </p>
          </div>

          {/* Address */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Your private sync address</p>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2.5 select-all">
                {sync.loading ? '…' : sync.address}
              </code>
              <button onClick={copy} disabled={sync.loading}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-3 transition-colors">
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Steps */}
          <ol className="space-y-3">
            {[
              { e: '📋', t: 'Copy your sync address', d: 'It’s unique to you and private — keep it to yourself.' },
              { e: '⚙️', t: 'Open Gmail → Settings → Filters', d: '“Filters and Blocked Addresses” → “Create a new filter”.' },
              { e: '↪️', t: 'Forward your bank alerts to it', d: `In “From” add your bank/card senders (${BANK_SENDERS}), then choose “Forward it to” and pick your sync address. Confirm the code Gmail emails you.` },
            ].map((s, i) => (
              <li key={i} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-200">{i + 1}</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white"><span className="mr-1">{s.e}</span>{s.t}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* Manage (only once an address exists) */}
          {!sync.loading && sync.alias && (
            <div className="flex gap-2 pt-1">
              <button onClick={togglePause} disabled={busy}
                className="flex-1 text-xs font-medium rounded-lg py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                {sync.enabled ? 'Pause sync' : 'Resume sync'}
              </button>
              <button onClick={regenerate} disabled={busy}
                className="flex-1 text-xs font-medium rounded-lg py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                New address
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-700 shrink-0 space-y-2">
          <button onClick={copy} disabled={sync.loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2">
            <span>📋</span> {copied ? 'Copied!' : 'Copy sync address'}
          </button>
          <button onClick={onClose}
            className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs py-1.5 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
