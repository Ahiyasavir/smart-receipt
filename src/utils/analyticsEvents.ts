/**
 * analyticsEvents — canonical event names for future usage tracking.
 *
 * NO tracking implementation here by design. When an analytics provider is
 * added later, call a single `track(name, props?)` with these constants at the
 * marked call sites — keeps event taxonomy in one place and prevents string
 * drift. Zero dependencies, zero runtime cost.
 */

export const ANALYTICS_EVENTS = {
  /** Onboarding finished (or skipped). */
  ONBOARDING_COMPLETED: 'onboarding_completed',
  /** First ever transaction/receipt for this user persisted. */
  FIRST_TRANSACTION_ADDED: 'first_transaction_added',
  /** Any transaction added (scan / CSV / email / scraper). props: { source }. */
  TRANSACTION_ADDED: 'transaction_added',
  /** User generated/copied their bank-sync forwarding address. */
  BANK_SYNC_ADDRESS_CREATED: 'bank_sync_address_created',
  /** First inbound transaction received → bank effectively connected. */
  BANK_CONNECTED: 'bank_connected',
  /** User changed an item's category (correction signal). */
  CATEGORY_CORRECTED: 'category_corrected',
  /** A streak / milestone threshold was crossed. props: { milestone }. */
  MILESTONE_REACHED: 'milestone_reached',
  /** CSV export performed. */
  DATA_EXPORTED: 'data_exported',
} as const;

export type AnalyticsEvent =
  typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];

/**
 * Placeholder sink. Intentionally a no-op until a provider is wired; calling it
 * now (optional) makes the eventual integration a one-line change here.
 */
export function track(_event: AnalyticsEvent, _props?: Record<string, unknown>): void {
  /* no-op: analytics provider not yet configured */
}
