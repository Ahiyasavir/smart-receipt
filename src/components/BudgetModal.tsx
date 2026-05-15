import { useState } from 'react';
import { Category, UserBudgets, BudgetPeriod } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';

const CATEGORIES = Object.keys(CATEGORY_META) as Category[];
const PERIOD_LABELS: { id: BudgetPeriod; label: string }[] = [
  { id: 'weekly',  label: 'Weekly'  },
  { id: 'monthly', label: 'Monthly' },
];

interface Props {
  budgets: UserBudgets;
  onSave: (budgets: UserBudgets) => void;
  onClose: () => void;
}

export default function BudgetModal({ budgets, onSave, onClose }: Props) {
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [values, setValues] = useState<Record<BudgetPeriod, Record<string, string>>>({
    weekly:  Object.fromEntries(CATEGORIES.map((c) => [c, String(budgets.weekly[c] ?? '')])),
    monthly: Object.fromEntries(CATEGORIES.map((c) => [c, String(budgets.monthly[c] ?? '')])),
  });

  const handleSave = () => {
    const toNum = (v: string) => { const n = parseFloat(v); return isNaN(n) || n <= 0 ? undefined : n; };
    const next: UserBudgets = {
      weekly:  Object.fromEntries(CATEGORIES.map((c) => [c, toNum(values.weekly[c])])),
      monthly: Object.fromEntries(CATEGORIES.map((c) => [c, toNum(values.monthly[c])])),
    };
    onSave(next);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Spending Budgets</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Period selector */}
        <div className="px-4 pt-3 shrink-0">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {PERIOD_LABELS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Category list */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {CATEGORIES.filter((c) => c !== 'other').map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xl w-7 shrink-0">{meta.emoji}</span>
                <span className="flex-1 text-sm text-gray-700">{meta.label}</span>
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    placeholder="No limit"
                    className="w-full border border-gray-200 rounded-lg pl-6 pr-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={values[period][cat]}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [period]: { ...v[period], [cat]: e.target.value } }))
                    }
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-4 pb-5 pt-2 shrink-0 border-t border-gray-100">
          <button
            onClick={handleSave}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            Save Budgets
          </button>
        </div>
      </div>
    </div>
  );
}
