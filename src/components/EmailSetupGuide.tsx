/**
 * EmailSetupGuide — onboarding for the PUSH (auto-forward) email channel.
 *
 * The user gets a unique address `sync+<user_id>@<domain>` and sets a Gmail
 * filter to auto-forward bank/card alert emails to it. Our inbound webhook
 * parses them. No Gmail OAuth, no passwords, no polling.
 * Pure presentational component; styling matches BankConnectionModal.
 */
import { useState } from 'react';

// Domain where the inbound-email webhook receives mail (MX → provider).
const INBOUND_DOMAIN =
  (import.meta.env.VITE_INBOUND_EMAIL_DOMAIN as string | undefined) ??
  'inbound.smartreceipt.app';

const BANK_SENDERS = 'max.co.il, cal-online.co.il, isracard.co.il, leumi-card.co.il, chase.com';

interface Step {
  n: number;
  emoji: string;
  title: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    emoji: '📋',
    title: 'Copy your unique sync address',
    detail: 'It is tied to your account — emails sent here become your transactions.',
  },
  {
    n: 2,
    emoji: '⚙️',
    title: 'Create a Gmail filter',
    detail:
      'Gmail → Settings → Filters and Blocked Addresses → "Create a new filter".',
  },
  {
    n: 3,
    emoji: '↪️',
    title: 'Forward bank alerts to it',
    detail:
      `In the filter's "From" field add your bank/card senders (${BANK_SENDERS}), then choose "Forward it to" and add your sync address. Confirm the forwarding email Gmail sends.`,
  },
];

interface Props {
  /** Current signed-in user id — forms the unique forwarding address. */
  userId: string;
  /** Fired after the address is copied to the clipboard. */
  onCopied?: () => void;
  onClose: () => void;
}

export default function EmailSetupGuide({ userId, onCopied, onClose }: Props) {
  const address = `sync+${userId}@${INBOUND_DOMAIN}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* clipboard may be blocked; the address is still visible to copy manually */
    }
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Auto-track via email
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

          {/* Why */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/30 px-3 py-3 flex gap-2">
            <span className="text-lg leading-none shrink-0">🔒</span>
            <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
              You forward only your bank <strong>alert emails</strong> to a
              private address — <strong>no Gmail sign-in, no passwords</strong>,
              and we never touch the rest of your inbox.
            </p>
          </div>

          {/* The unique address */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Your sync address
            </p>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 min-w-0 truncate text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-2.5 select-all">
                {address}
              </code>
              <button
                onClick={copy}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg px-3 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Steps */}
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {s.n}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    <span className="mr-1">{s.emoji}</span>{s.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                    {s.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Once set up, every new bank alert is logged automatically within
            seconds — nothing to open or sync. Receipt scanning keeps working
            exactly as before.
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-700 shrink-0 space-y-2">
          <button
            onClick={copy}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            <span>📋</span> {copied ? 'Copied!' : 'Copy sync address'}
          </button>
          <button
            onClick={onClose}
            className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs py-1.5 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
