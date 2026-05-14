import { CategorySummary } from '../types';

interface Props {
  summaries: CategorySummary[];
  totalSpend: number;
}

export default function CategoryBreakdown({ summaries, totalSpend }: Props) {
  if (summaries.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
        <p className="text-gray-400 text-sm">No category data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800 text-sm">Category Breakdown</h3>
      </div>

      <ul className="divide-y divide-gray-50">
        {summaries.map((s) => {
          const pct = totalSpend > 0 ? (s.total / totalSpend) * 100 : 0;
          return (
            <li key={s.category} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{s.emoji}</span>
                  <span className="text-sm font-medium text-gray-700">{s.label}</span>
                  <span className="text-xs text-gray-400">({s.count})</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-gray-900 text-sm">
                    ${s.total.toFixed(2)}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: s.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
