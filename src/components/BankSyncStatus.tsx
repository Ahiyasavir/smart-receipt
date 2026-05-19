/**
 * BankSyncStatus — one-line live state for the email bank-sync channel.
 * Surfaces connection clarity in Settings without opening the modal.
 * Pure read of useBankSync; no actions here.
 */
import { useBankSync } from '../hooks/useBankSync';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function BankSyncStatus({ userId }: { userId: string }) {
  const s = useBankSync(userId);

  const view = s.loading
    ? { dot: 'bg-gray-300 dark:bg-gray-600', text: 'Checking…', cls: 'text-gray-400' }
    : !s.alias
      ? { dot: 'bg-gray-300 dark:bg-gray-600', text: 'Not set up — tap to connect', cls: 'text-gray-400' }
      : !s.enabled
        ? { dot: 'bg-amber-400', text: 'Paused', cls: 'text-amber-600 dark:text-amber-400' }
        : s.connected
          ? { dot: 'bg-emerald-500', text: `Connected · last ${timeAgo(s.lastReceivedAt)}`, cls: 'text-emerald-600 dark:text-emerald-400' }
          : { dot: 'bg-[var(--brand-400)] badge-sync-pulse', text: 'Waiting for first transaction…', cls: 'text-blue-600 dark:text-[var(--brand-400)]' };

  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${view.dot}`} />
      <span className={`text-xs ${view.cls}`}>{view.text}</span>
    </span>
  );
}
