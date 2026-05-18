import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import he from '../locales/he.json';

const STORAGE_KEY = 'spendora_language';

export function getStoredLanguage(): string {
  return localStorage.getItem(STORAGE_KEY) ?? 'en';
}

export function setStoredLanguage(lang: string): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

export function getDir(lang: string): 'ltr' | 'rtl' {
  return lang === 'he' ? 'rtl' : 'ltr';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: getStoredLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
