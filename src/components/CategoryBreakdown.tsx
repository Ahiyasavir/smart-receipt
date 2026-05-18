import { useTranslation } from 'react-i18next';
import { CategorySummary } from '../types';
import { usePreferences } from '../hooks/usePreferences';
import Card from './ui/Card';
import Amount from './ui/Amount';
import ProgressBar from './ui/ProgressBar';
import SectionHeader from './ui/SectionHeader';

interface Props {
  summaries: CategorySummary[];
  totalSpend: number;
}

export default function CategoryBreakdown({ summaries, totalSpend }: Props) {
  const { t } = useTranslation();
  const { locale, currency } = usePreferences();

  if (summaries.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title={t('home.categoryBreakdown')} />
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-[var(--color-border)]">
          {summaries.map((s) => {
            const pct = totalSpend > 0 ? (s.total / totalSpend) * 100 : 0;
            return (
              <li key={s.category} className="px-4 py-3.5 space-y-2">
                <span className="flex items-center justify-between gap-3 w-full">
                  <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-sm font-medium text-ink truncate">
                      {t(`categories.${s.category}`)}
                    </span>
                    <span className="text-xs text-ink-faint shrink-0">
                      ({s.count})
                    </span>
                  </span>
                  <span className="text-end shrink-0 flex flex-col items-end">
                    <Amount
                      value={s.total}
                      locale={locale}
                      currency={currency}
                      size="sm"
                    />
                    <span className="text-xs text-ink-faint">
                      {pct.toFixed(0)}%
                    </span>
                  </span>
                </span>
                <ProgressBar value={pct} color={s.color} />
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
