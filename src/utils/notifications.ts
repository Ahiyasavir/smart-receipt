import { Receipt, UserBudgets } from '../types';
import { CATEGORY_META } from './categoryClassifier';

const NOTIFIED_KEY = (key: string) => `smartreceipt_notif_${key}`;

function already(key: string): boolean {
  return !!localStorage.getItem(NOTIFIED_KEY(key));
}
function markSent(key: string): void {
  localStorage.setItem(NOTIFIED_KEY(key), '1');
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notificationsSupported(): boolean {
  return 'Notification' in window;
}

export function notificationsGranted(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

function notify(title: string, body: string, tag: string) {
  if (!notificationsGranted()) return;
  try {
    new Notification(title, { body, icon: '/icon-192.png', tag });
  } catch { /* ignore — some browsers block outside user gesture */ }
}

/** Check return deadlines and fire notifications for items due within 3 days */
export function checkReturnDeadlines(receipts: Receipt[]): void {
  const now = Date.now();
  for (const r of receipts) {
    if (!r.returnDeadline) continue;
    const daysLeft = Math.ceil((new Date(r.returnDeadline).getTime() - now) / 86400000);
    if (daysLeft < 0 || daysLeft > 3) continue;
    const key = `return_${r.id}_${daysLeft}`;
    if (already(key)) continue;
    const urgency = daysLeft === 0 ? 'Last day to return!' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to return`;
    notify(`⏰ Return deadline — ${r.storeName}`, urgency, key);
    markSent(key);
  }
}

/** Check category budgets and fire notifications when ≥ 85% spent */
export function checkBudgetAlerts(receipts: Receipt[], budgets: UserBudgets, symbol: string): void {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

  const monthlySpend: Record<string, number> = {};
  for (const r of receipts) {
    if (new Date(r.date) < monthStart) continue;
    for (const item of r.items) {
      monthlySpend[item.category] = (monthlySpend[item.category] ?? 0) + item.amount;
    }
  }

  for (const [cat, budget] of Object.entries(budgets.monthly)) {
    if (!budget) continue;
    const spent = monthlySpend[cat] ?? 0;
    const pct = spent / budget;
    if (pct < 0.85) continue;
    const key = `budget_${cat}_${monthKey}_${pct >= 1 ? 'over' : '85'}`;
    if (already(key)) continue;
    const label = CATEGORY_META[cat as keyof typeof CATEGORY_META]?.label ?? cat;
    const title = pct >= 1 ? `🚨 Budget exceeded — ${label}` : `⚠️ Budget alert — ${label}`;
    const body  = pct >= 1
      ? `You've exceeded your ${symbol}${budget.toFixed(0)} budget (spent ${symbol}${spent.toFixed(2)})`
      : `${Math.round(pct * 100)}% used — ${symbol}${(budget - spent).toFixed(2)} remaining`;
    notify(title, body, key);
    markSent(key);
  }
}
