import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt } from '../types';
import { buildActivityItems, groupActivityByDay, ActivityItem } from '../lib/activity';
import { CATEGORY_META } from '../utils/categoryClassifier';
import { UNCERTAIN_THRESHOLD } from '../utils/receiptInterpreter';
import { usePreferences } from '../hooks/usePreferences';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Amount from './ui/Amount';
import EmptyState from './ui/EmptyState';
import SectionHeader from './ui/SectionHeader';
import TransactionDetailSheet from './TransactionDetailSheet';
import { IconActivity } from './icons/NavIcons';
import { formatRelativeDate } from '../lib/format';

interface Props {
  receipts: Receipt[];
  onNavigateCapture?: () => void;
}

export default function ActivityFeed({ receipts, onNavigateCapture }: Props) {
  const { t } = useTranslation();
  const { locale, currency } = usePreferences();
  const [selected, setSelected] = useState<ActivityItem | null>(null);

  const items = useMemo(() => buildActivityItems(receipts), [receipts]);
  const groups = useMemo(
    () => groupActivityByDay(items, locale),
    [items, locale],
  );

  const selectedReceipt = selected
    ? receipts.find((r) => r.id === selected.receiptId)
    : null;

  if (items.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={<IconActivity />}
          title={t('activity.emptyTitle')}
          description={t('activity.emptyDescription')}
          actionLabel={t('activity.emptyCta')}
          onAction={onNavigateCapture}
        />
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-5 animate-fade-up">
        {groups.map((group) => (
          <section key={group.label}>
            <SectionHeader title={group.label} />
            <div className="space-y-2">
              {group.items.map((item) => {
                const meta = CATEGORY_META[item.category];
                const isUncertain =
                  (item.confidence ?? 1) < UNCERTAIN_THRESHOLD;

                return (
                  <Card
                    key={item.id}
                    padding="md"
                    onClick={() => setSelected(item)}
                    className="!p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: meta.color + '18' }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-ink text-sm truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-ink-muted truncate">
                          {item.merchant}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <Badge variant="category" color={meta.color}>
                            {t(`categories.${item.category}`)}
                          </Badge>
                          <Badge variant="source">
                            {t(`sources.${item.source}`)}
                          </Badge>
                          {isUncertain && (
                            <Badge variant="warning">
                              {t('detail.reviewSuggested')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <Amount
                          value={item.amount}
                          locale={locale}
                          currency={currency}
                          size="md"
                        />
                        <p className="text-xs text-ink-faint mt-0.5">
                          {formatRelativeDate(item.date, locale)}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <TransactionDetailSheet
        item={selected}
        receipt={selectedReceipt}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

