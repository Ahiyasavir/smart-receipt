export interface ReceiptItem {
  id: string;
  name: string;
  amount: number;
  category: Category;
  raw: string; // original OCR line, kept for debugging
  confidence?: number; // 0–1; absent means unknown (treated as certain)
}

export interface Receipt {
  id: string;
  date: string;       // ISO timestamp
  storeName: string;
  rawText: string;    // full OCR output
  items: ReceiptItem[];
  total: number;
  notes?: string;
  imageDataUrl?: string; // not persisted to DB
  source?: 'scan' | 'bank-sync' | 'bank-import';
  externalId?: string;
}

export type Category =
  | 'food'
  | 'groceries'
  | 'transport'
  | 'entertainment'
  | 'health'
  | 'shopping'
  | 'utilities'
  | 'other';

export interface CategorySummary {
  category: Category;
  label: string;
  total: number;
  count: number;
  color: string;
  emoji: string;
}

export type AppTab = 'scan' | 'dashboard' | 'history';

export type BudgetPeriod = 'weekly' | 'monthly';
export type BudgetSettings = Partial<Record<Category, number>>;
export interface UserBudgets {
  weekly: BudgetSettings;
  monthly: BudgetSettings;
}

export interface UserProfile {
  id: string;
  name: string;
  emoji: string;
  color: string; // hex accent color
}
