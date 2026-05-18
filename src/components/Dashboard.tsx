import { useTranslation } from 'react-i18next';
import { Receipt, Category, CategorySummary } from '../types';
import { CATEGORY_META } from '../utils/categoryClassifier';
import { getConnectionStates } from '../lib/connections';
import { usePreferences } from '../hooks/usePreferences';
import CategoryBreakdown from './CategoryBreakdown';
import ConnectionsPanel from './ConnectionsPanel';
import Card from './ui/Card';
import Amount from './ui/Amount';
import EmptyState from './ui/EmptyState';
import SectionHeader from './ui/SectionHeader';
import { IconChart } from './icons/NavIcons';

interface Props {
  receipts: Receipt[];
  onNavigateCapture?: () => void;
}

function buildSummaries(receipts: Receipt[]): {
  summaries: CategorySummary[];
  total: number;
  itemCount: number;
} {
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

export default function Dashboard({ receipts, onNavigateCapture }: Props) {
  const { t } = useTranslation();
  const { locale, currency } = usePreferences();
  const { summaries, total, itemCount } = buildSummaries(receipts);
  const connections = getConnectionStates(receipts);

  if (receipts.length === 0) {
    return (
      <Card padding="none" className="animate-fade-up">
        <EmptyState
          icon={<IconChart />}
          title={t('home.emptyTitle')}
          description={t('home.emptyDescription')}
          actionLabel={t('home.emptyCta')}
          onAction={onNavigateCapture}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <Card padding="lg" className="bg-brand-600 border-brand-700/30 text-white !shadow-card-hover">
        <p className="text-xs font-medium uppercase tracking-wider opacity-80">
          {t('home.totalSpend')}
        </p>
        <Amount
          value={total}
          locale={locale}
          currency={currency}
          size="hero"
          className="!text-white mt-1"
        />
        <p className="text-sm opacity-70 mt-2">
          {t('home.receiptsTracked', { count: receipts.length })}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card padding="md">
          <p className="text-xs text-ink-muted">{t('home.itemsTracked')}</p>
          <p className="text-2xl font-bold text-ink tabular-nums mt-1">{itemCount}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs text-ink-muted">{t('home.activeCategories')}</p>
          <p className="text-2xl font-bold text-ink tabular-nums mt-1">{summaries.length}</p>
        </Card>
      </div>

      <section>
        <SectionHeader title={t('home.connections')} />
        <ConnectionsPanel connections={connections} compact />
      </section>

      <CategoryBreakdown summaries={summaries} totalSpend={total} />
    </div>
  );
}

