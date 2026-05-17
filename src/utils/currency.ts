export const CURRENCIES = [
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', flag: '🇮🇱' },
  { code: 'USD', symbol: '$', name: 'US Dollar',       flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro',            flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound',  flag: '🇬🇧' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen',   flag: '🇯🇵' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc',  flag: '🇨🇭' },
] as const;

export type CurrencyCode = typeof CURRENCIES[number]['code'];

const STORAGE_KEY = 'smartreceipt_currency';

export function getSavedCurrency(): CurrencyCode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return (CURRENCIES.find((c) => c.code === saved)?.code ?? 'ILS') as CurrencyCode;
}

export function saveCurrency(code: CurrencyCode): void {
  localStorage.setItem(STORAGE_KEY, code);
}

export function getCurrencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? '₪';
}

/** Format an amount with the currency symbol, e.g. ₪12.50 */
export function fmt(amount: number, symbol: string): string {
  return `${symbol}${Math.abs(amount).toFixed(2)}`;
}
