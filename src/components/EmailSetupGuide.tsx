/**
 * EmailSetupGuide — onboarding for the email-ingestion channel.
 *
 * Explains, in plain language, the one-time setup the user must do so their
 * card provider emails a transaction alert that we can scan automatically.
 * Pure presentational component; styling matches BankConnectionModal.
 */

interface Step {
  n: number;
  title: string;
  detail: string;
  emoji: string;
}

const STEPS: Step[] = [
  {
    n: 1,
    emoji: '📧',
    title: 'Connect your Gmail account',
    detail:
      'A secure, read-only Google sign-in. We only ever look at bank/card alert emails — nothing else in your inbox.',
  },
  {
    n: 2,
    emoji: '🏦',
    title: 'Open your card or bank app',
    detail:
      'Log into your provider — Max, Cal, Isracard, Chase, or your bank.',
  },
  {
    n: 3,
    emoji: '🔔',
    title: 'Turn on transaction email alerts',
    detail:
      'Go to Settings → Alerts / Notifications and enable "Email notification for every transaction". That email is what we read.',
  },
];

interface Props {
  /** Kicks off the Gmail OAuth consent flow (gmail.readonly). */
  onConnectGmail: () => void;
  onClose: () => void;
}

export default function EmailSetupGuide({ onConnectGmail, onClose }: Props) {
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
              We scan your secure bank <strong>email alerts</strong> to log
              expenses automatically — <strong>no bank passwords</strong>, and
              read-only access to just those alert emails.
            </p>
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
            Already get these alerts? Just connect Gmail — past and future
            alerts will be picked up automatically. Receipt scanning keeps
            working exactly as before.
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-700 shrink-0 space-y-2">
          <button
            onClick={onConnectGmail}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2"
          >
            <span>📧</span> Connect Gmail
          </button>
          <button
            onClick={onClose}
            className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs py-1.5 transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
