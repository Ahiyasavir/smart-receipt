import { Receipt, Category, CategorySummary } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';
import CategoryBreakdown from './CategoryBreakdown';

interface Props {
  receipts: Receipt[];
}

function buildSummaries(
  receipts: Receipt[],
): { summaries: CategorySummary[]; total: number; itemCount: number } {
  const map: Partial<Record<Category, CategorySummary>> = {};
  let total = 0;
  let itemCount = 0;

  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const meta = CATEGORY_META[item.category];
      if (!map[item.category]) {
        map[item.category] = {
          category: item.category,
          label: meta.label,
          total: 0,
          count: 0,
          color: meta.color,
          emoji: meta.emoji,
        };
      }
      map[item.category]!.total += item.amount;
      map[item.category]!.count += 1;
      total += item.amount;
      itemCount += 1;
    }
  }

  const summaries = (Object.values(map) as CategorySummary[]).sort(
    (a, b) => b.total - a.total,
  );

  return { summaries, total: Math.round(total * 100) / 100, itemCount };
}

export default function Dashboard({ receipts }: Props) {
  const { summaries, total, itemCount } = buildSummaries(receipts);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-600 text-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide opacity-70">Total Spend</p>
          <p className="text-2xl font-bold mt-1">${total.toFixed(2)}</p>
          <p className="text-xs opacity-60 mt-1">
            {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="bg-emerald-500 text-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide opacity-70">Items Tracked</p>
          <p className="text-2xl font-bold mt-1">{itemCount}</p>
          <p className="text-xs opacity-60 mt-1">
            {summaries.length} categor{summaries.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>

      {receipts.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm">
          <div className="text-5xl mb-3">🧾</div>
          <p className="font-semibold text-gray-600">No receipts yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Scan your first receipt to see spending insights
          </p>
        </div>
      ) : (
        <CategoryBreakdown summaries={summaries} totalSpend={total} />
      )}
    </div>
  );
}
