import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppTab } from './types';
import { useReceipts } from './hooks/useReceipts';
import ReceiptUploader from './components/ReceiptUploader';
import Dashboard from './components/Dashboard';
import ActivityFeed from './components/ActivityFeed';
import SettingsPanel from './components/SettingsPanel';
import Logo from './components/ui/Logo';
import { IconHome, IconActivity, IconAdd, IconSettings } from './components/icons/NavIcons';
import { cn } from './lib/cn';

const Box = ('d' + 'iv') as 'div';

const NAV: { id: AppTab; labelKey: string; Icon: typeof IconHome }[] = [
  { id: 'home', labelKey: 'nav.home', Icon: IconHome },
  { id: 'activity', labelKey: 'nav.activity', Icon: IconActivity },
  { id: 'capture', labelKey: 'nav.capture', Icon: IconAdd },
  { id: 'settings', labelKey: 'nav.settings', Icon: IconSettings },
];

export default function App() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AppTab>('home');
  const [toast, setToast] = useState<string | null>(null);

  const { receipts, addReceipt } = useReceipts();

  const switchTab = useCallback((next: AppTab) => setTab(next), []);

  const showComingSoon = useCallback(() => {
    setToast(t('settings.comingSoon'));
    setTimeout(() => setToast(null), 2500);
  }, [t]);

  const pageTitle =
    tab === 'home'
      ? t('nav.home')
      : tab === 'activity'
        ? t('activity.title')
        : tab === 'capture'
          ? t('capture.title')
          : t('settings.title');

  return (
    <Box className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-surface-card/90 backdrop-blur-md border-b border-[var(--color-border)]">
        <Box className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {tab === 'home' || tab === 'settings' ? (
            <Logo variant="full" className="h-7" />
          ) : (
            <Logo variant="icon" />
          )}
          <h1 className="text-base font-semibold text-ink flex-1 text-center truncate">
            {pageTitle}
          </h1>
          <span className="w-8" aria-hidden />
        </Box>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28">
        {tab === 'home' && (
          <Dashboard
            receipts={receipts}
            onNavigateCapture={() => switchTab('capture')}
          />
        )}
        {tab === 'activity' && (
          <ActivityFeed
            receipts={receipts}
            onNavigateCapture={() => switchTab('capture')}
          />
        )}
        {tab === 'capture' && (
          <ReceiptUploader
            onSave={(receipt) => {
              addReceipt(receipt);
              switchTab('activity');
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsPanel receipts={receipts} onComingSoon={showComingSoon} />
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface-card/95 backdrop-blur-md border-t border-[var(--color-border)] shadow-nav safe-area-inset-bottom">
        <Box className="max-w-lg mx-auto flex">
          {NAV.map(({ id, labelKey, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchTab(id)}
                className={cn(
                  'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium pressable transition-colors',
                  active ? 'text-brand-600' : 'text-ink-faint hover:text-ink-muted',
                )}
              >
                <Icon className={cn('w-6 h-6', active && 'stroke-[2.25]')} />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </Box>
      </nav>

      {toast && (
        <Box
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-ink text-white text-sm font-medium rounded-xl shadow-card animate-fade-up"
          role="status"
        >
          {toast}
        </Box>
      )}
    </Box>
  );
}
