import { useTranslation } from 'react-i18next';
import { usePreferences, Currency } from '../hooks/usePreferences';
import { Receipt } from '../types';
import { getConnectionStates } from '../lib/connections';
import Logo from './ui/Logo';
import Card from './ui/Card';
import SectionHeader from './ui/SectionHeader';
import ConnectionsPanel from './ConnectionsPanel';

interface Props {
  receipts: Receipt[];
  onComingSoon: () => void;
}

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'he', label: 'עברית' },
] as const;

const CURRENCIES: { id: Currency; label: string }[] = [
  { id: 'USD', label: 'USD ($)' },
  { id: 'ILS', label: 'ILS (₪)' },
  { id: 'EUR', label: 'EUR (€)' },
];

export default function SettingsPanel({ receipts, onComingSoon }: Props) {
  const { t } = useTranslation();
  const { language, setLanguage, currency, setCurrency, showDebug, setShowDebug } =
    usePreferences();

  const connections = getConnectionStates(receipts);

  return (
    <div className="space-y-6 animate-fade-up">
      <SectionHeader title={t('settings.language')} />
      <Card padding="sm">
        <div className="flex gap-2 p-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => setLanguage(lang.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors pressable ${
                language === lang.id
                  ? 'bg-brand-600 text-white'
                  : 'text-ink-secondary hover:bg-surface-muted'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </Card>

      <SectionHeader title={t('settings.currency')} />
      <Card padding="none" className="overflow-hidden">
        {CURRENCIES.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCurrency(c.id)}
            className={`w-full flex items-center justify-between px-4 py-3.5 text-start pressable ${
              i > 0 ? 'border-t border-[var(--color-border)]' : ''
            } ${currency === c.id ? 'bg-brand-50' : 'hover:bg-surface-muted'}`}
          >
            <span className="text-sm font-medium text-ink">{c.label}</span>
            {currency === c.id && (
              <span className="w-2 h-2 rounded-full bg-brand-600" />
            )}
          </button>
        ))}
      </Card>

      <SectionHeader title={t('settings.connections')} />
      <ConnectionsPanel connections={connections} onConnect={() => onComingSoon()} />

      <SectionHeader title={t('settings.developer')} />
      <Card padding="md">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-ink">{t('settings.showDebug')}</span>
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
            className="w-5 h-5 rounded accent-brand-600"
          />
        </label>
      </Card>

      <SectionHeader title={t('settings.about')} />
      <Card padding="lg" className="flex flex-col items-center text-center">
        <Logo variant="full" className="h-8 mb-3" />
        <p className="text-sm text-ink-muted">
          {t('settings.version', { version: '0.1.0' })}
        </p>
      </Card>
    </div>
  );
}

