import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getDir, setStoredLanguage } from '../i18n';

const CURRENCY_KEY = 'spendora_currency';
const DEBUG_KEY = 'spendora_show_debug';

export type Currency = 'USD' | 'ILS' | 'EUR';

export function usePreferences() {
  const { i18n } = useTranslation();
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const stored = localStorage.getItem(CURRENCY_KEY);
    return (stored as Currency) || 'USD';
  });
  const [showDebug, setShowDebugState] = useState(() => {
    return localStorage.getItem(DEBUG_KEY) === 'true';
  });

  const locale = i18n.language === 'he' ? 'he-IL' : 'en-US';
  const dir = getDir(i18n.language);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = dir;
  }, [i18n.language, dir]);

  const setLanguage = useCallback(
    (lang: string) => {
      setStoredLanguage(lang);
      i18n.changeLanguage(lang);
    },
    [i18n],
  );

  const setCurrency = useCallback((c: Currency) => {
    localStorage.setItem(CURRENCY_KEY, c);
    setCurrencyState(c);
  }, []);

  const setShowDebug = useCallback((v: boolean) => {
    localStorage.setItem(DEBUG_KEY, String(v));
    setShowDebugState(v);
  }, []);

  return {
    language: i18n.language,
    locale,
    dir,
    currency,
    showDebug,
    setLanguage,
    setCurrency,
    setShowDebug,
  };
}
