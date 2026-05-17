import { useState } from 'react';
import { ReceiptItem } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';
import { UNCERTAIN_THRESHOLD } from '../utils/receiptInterpreter';
import { useCurrency } from '../contexts/CurrencyContext';
import ManualEditModal from './ManualEditModal';

interface Props {
  items: ReceiptItem[];
  onItemChange?: (item: ReceiptItem) => void;
  editable?: boolean;
}

export default function ItemList({ items, onItemChange, editable = false }: Props) {
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);
  const { fmt } = useCurrency();

  const handleSave = (updated: ReceiptItem) => {
    onItemChange?.(updated);
    setEditingItem(null);
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
        <p className="text-gray-400 text-sm">No items detected</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">
            Items ({items.length})
          </h3>
          {editable && (
            <span className="text-xs text-gray-400">Tap ✏️ to edit</span>
          )}
        </div>

        <ul className="divide-y divide-gray-50">
          {items.map((item) => {
            const meta = CATEGORY_META[item.category];
            const isUncertain = (item.confidence ?? 1.0) < UNCERTAIN_THRESHOLD;
            return (
              <li key={item.id} className={`flex items-center gap-3 px-4 py-3 ${isUncertain ? 'bg-amber-50' : ''}`}>
                <span className="text-xl shrink-0">{meta.emoji}</span>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm break-words">
                    {item.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span
                      className="inline-block text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: meta.color + '22',
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                    {isUncertain && (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {item.confidence !== undefined
                          ? `${Math.round(item.confidence * 100)}% confident`
                          : 'uncertain — verify'}
                      </span>
                    )}
                  </div>
                </div>

                <span className="font-semibold text-gray-900 text-sm shrink-0">
                  {fmt(item.amount)}
                </span>

                {editable && (
                  <button
                    onClick={() => setEditingItem(item)}
                    className="text-gray-300 hover:text-blue-500 transition-colors ml-1 shrink-0"
                    aria-label={`Edit ${item.name}`}
                  >
                    ✏️
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {editingItem && (
        <ManualEditModal
          item={editingItem}
          onSave={handleSave}
          onClose={() => setEditingItem(null)}
        />
      )}
    </>
  );
}
