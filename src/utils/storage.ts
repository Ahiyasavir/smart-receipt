import { Receipt, UserProfile, UserBudgets } from '../types';

// ── Key helpers ───────────────────────────────────────────────────────────────
const PROFILES_KEY         = 'smartreceipt_profiles';
const CURRENT_USER_KEY     = 'smartreceipt_current_user';
const receiptsKey = (uid: string) => `smartreceipt_receipts_${uid}`;

// Legacy key — migrated on first load
const LEGACY_KEY = 'receipt_scanner_v1';

// ── Profiles ──────────────────────────────────────────────────────────────────
export function loadProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? (JSON.parse(raw) as UserProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveProfile(profile: UserProfile): void {
  const all = loadProfiles();
  const idx = all.findIndex((p) => p.id === profile.id);
  if (idx >= 0) all[idx] = profile;
  else all.push(profile);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
}

export function deleteProfile(id: string): void {
  const all = loadProfiles().filter((p) => p.id !== id);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(all));
  localStorage.removeItem(receiptsKey(id));
}

// ── Current user ──────────────────────────────────────────────────────────────
export function getCurrentUserId(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(id: string): void {
  localStorage.setItem(CURRENT_USER_KEY, id);
}

// ── Receipts (per-user) ───────────────────────────────────────────────────────

// Migrate legacy single-user data into the given user's namespace (runs once)
export function migrateLegacyReceipts(userId: string): void {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  const userKey = receiptsKey(userId);
  if (!localStorage.getItem(userKey)) {
    localStorage.setItem(userKey, legacy);
  }
  localStorage.removeItem(LEGACY_KEY);
}

export function loadReceipts(userId: string): Receipt[] {
  try {
    const raw = localStorage.getItem(receiptsKey(userId));
    return raw ? (JSON.parse(raw) as Receipt[]) : [];
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: Receipt, userId: string): void {
  const all = loadReceipts(userId);
  const idx = all.findIndex((r) => r.id === receipt.id);
  if (idx >= 0) {
    all[idx] = receipt;
  } else {
    all.unshift(receipt); // newest first
  }
  localStorage.setItem(receiptsKey(userId), JSON.stringify(all));
}

export function deleteReceipt(id: string, userId: string): void {
  const all = loadReceipts(userId).filter((r) => r.id !== id);
  localStorage.setItem(receiptsKey(userId), JSON.stringify(all));
}

export function clearAllReceipts(userId: string): void {
  localStorage.removeItem(receiptsKey(userId));
}

// ── Budgets (per-user) ────────────────────────────────────────────────────────
const budgetsKey = (uid: string) => `smartreceipt_budgets_${uid}`;

const DEFAULT_BUDGETS: UserBudgets = { weekly: {}, monthly: {} };

export function loadBudgets(userId: string): UserBudgets {
  try {
    const raw = localStorage.getItem(budgetsKey(userId));
    return raw ? (JSON.parse(raw) as UserBudgets) : DEFAULT_BUDGETS;
  } catch {
    return DEFAULT_BUDGETS;
  }
}

export function saveBudgets(budgets: UserBudgets, userId: string): void {
  localStorage.setItem(budgetsKey(userId), JSON.stringify(budgets));
}
