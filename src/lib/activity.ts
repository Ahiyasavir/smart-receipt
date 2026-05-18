import { Receipt, Category } from '../types';

export type ActivitySource = 'receipt' | 'bank' | 'email';

export interface ActivityItem {
  id: string;
  receiptId: string;
  merchant: string;
  name: string;
  amount: number;
  category: Category;
  confidence?: number;
  source: ActivitySource;
  date: string;
  raw: string;
}

export function buildActivityItems(receipts: Receipt[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const receipt of receipts) {
    for (const item of receipt.items) {
      items.push({
        id: item.id,
        receiptId: receipt.id,
        merchant: receipt.storeName,
        name: item.name,
        amount: item.amount,
        category: item.category,
        confidence: item.confidence,
        source: 'receipt',
        date: receipt.date,
        raw: item.raw,
      });
    }
  }

  return items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function groupActivityByDay(
  items: ActivityItem[],
  locale: string,
): { label: string; items: ActivityItem[] }[] {
  const groups = new Map<string, ActivityItem[]>();

  for (const item of items) {
    const key = new Date(item.date).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return Array.from(groups.entries()).map(([key, groupItems]) => {
    const date = new Date(key);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    let label: string;
    if (diffDays === 0) label = locale.startsWith('he') ? 'היום' : 'Today';
    else if (diffDays === 1) label = locale.startsWith('he') ? 'אתמול' : 'Yesterday';
    else
      label = new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }).format(date);

    return { label, items: groupItems };
  });
}
