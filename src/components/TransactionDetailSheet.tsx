import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityItem } from '../lib/activity';
import { Receipt, ReceiptItem } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';
import { UNCERTAIN_THRESHOLD } from '../utils/receiptInterpreter';
import { usePreferences } from '../hooks/usePreferences';
import Sheet from './ui/Sheet';
import Amount from './ui/Amount';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';

interface Props {
  item: ActivityItem | null;
  receipt?: Receipt | null;
  open: boolean;
  onClose: () => void;
  onDeleteReceipt?: (id: string) => void;
  onItemChange?: (item: ReceiptItem) => void;
}

export default function TransactionDetailSheet({
  item,
  receipt,
  open,
  onClose,
  onDeleteReceipt,
}: Props) {
  const { t } = useTranslation();
  const { locale, currency } = usePreferences();
  const [showRaw, setShowRaw] = useState(false);

  if (!item) return null;

  const meta = CATEGORY_META[item.category];
  const isUncertain = (item.confidence ?? 1) < UNCERTAIN_THRESHOLD;
  const confidencePct = Math.round((item.confidence ?? 1) * 100);

  return (
    <Sheet open={open} onClose={onClose} title={item.name}>
      <div className="space-y-5">
        <div className="text-center py-2">
          <Amount value={item.amount} locale={locale} currency={currency} size="hero" />
          <p className="text-sm text-ink-muted mt-1">{item.merchant}</p>
        </div>

        <DetailRow label={t('detail.merchant')} value={item.merchant} />
        <DetailRow label={t('detail.category')}>
          <Badge variant="category" color={meta.color}>
            {t(`categories.${item.category}`)}
          </Badge>
        </DetailRow>
        <DetailRow label={t('detail.source')}>
          <Badge variant="source">{t(`sources.${item.source}`)}</Badge>
        </DetailRow>
        <DetailRow label={t('detail.confidence')}>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-surface-muted rounded-full overflow-hidden max-w-[120px]">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  isUncertain ? 'bg-status-warning' : 'bg-status-success',
                )}
                style={{ width: `${confidencePct}%` }}
              />
            </div>
            <span className="text-sm text-ink-secondary">
              {isUncertain ? t('detail.reviewSuggested') : t('detail.highConfidence')}
            </span>
          </div>
        </DetailRow>
        <DetailRow
          label={t('detail.date')}
          value={formatDateTime(item.date, locale)}
        />
        <DetailRow label={t('detail.notes')} value={t('detail.noNotes')} />

        <div>
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-sm font-medium text-brand-600 pressable"
          >
            {t('detail.rawText')} {showRaw ? '▲' : '▼'}
          </button>
          {showRaw && (
            <pre className="mt-2 p-3 bg-surface-muted rounded-xl text-xs text-ink-secondary font-mono whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
              {item.raw || '—'}
            </pre>
          )}
        </div>

        {receipt && onDeleteReceipt && (
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              onDeleteReceipt(receipt.id);
              onClose();
            }}
          >
            {t('detail.deleteReceipt')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm text-ink-muted shrink-0">{label}</span>
      {children ?? (
        <span className="text-sm font-medium text-ink text-end">{value}</span>
      )}
    </div>
  );
}

