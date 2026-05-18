import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReceiptItem } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';
import { UNCERTAIN_THRESHOLD } from '../utils/receiptInterpreter';
import { usePreferences } from '../hooks/usePreferences';
import ManualEditModal from './ManualEditModal';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Amount from './ui/Amount';

interface Props {
  items: ReceiptItem[];
  onItemChange?: (item: ReceiptItem) => void;
  editable?: boolean;
}

export default function ItemList({ items, onItemChange, editable = false }: Props) {
  const { t } = useTranslation();
  const { locale, currency } = usePreferences();
  const [editingItem, setEditingItem] = useState<ReceiptItem | null>(null);

  const handleSave = (updated: ReceiptItem) => {
    onItemChange?.(updated);
    setEditingItem(null);
  };

  if (items.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-ink-muted text-sm">No items detected</p>
      </Card>
    );
  }

  return (
    <>
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-semibold text-ink text-sm">
            {t('common.items', { count: items.length })}
          </h3>
        </div>

        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((item) => {
            const meta = CATEGORY_META[item.category];
            const isUncertain = (item.confidence ?? 1.0) < UNCERTAIN_THRESHOLD;
            return (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  isUncertain ? 'bg-amber-50/50' : ''
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: meta.color }}
                />

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink text-sm truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge variant="category" color={meta.color}>
                      {t(`categories.${item.category}`)}
                    </Badge>
                    {isUncertain && (
                      <Badge variant="warning">{t('detail.reviewSuggested')}</Badge>
                    )}
                  </div>
                </div>

                <Amount
                  value={item.amount}
                  locale={locale}
                  currency={currency}
                  size="sm"
                />

                {editable && (
                  <button
                    type="button"
                    onClick={() => setEditingItem(item)}
                    className="text-ink-faint hover:text-brand-600 transition-colors ms-1 shrink-0 p-1"
                    aria-label={`Edit ${item.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

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
