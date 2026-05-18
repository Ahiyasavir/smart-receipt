import React, { createContext, useContext, useState, useCallback } from 'react';
import { CurrencyCode, getSavedCurrency, saveCurrency, getCurrencySymbol, fmt as fmtUtil } from '../utils/currency';
import { convert as convertRate } from '../utils/exchangeRates';

interface CurrencyCtx {
  currency: CurrencyCode;
  symbol:   string;
  /** Format a value ALREADY in the display currency. */
  fmt:      (amount: number) => string;
  /** Convert from a transaction's original currency into the display currency. */
  convert:  (amount: number, fromCurrency?: string | null) => number;
  /** Convert from original currency, then format. Use for stored amounts. */
  fmtFrom:  (amount: number, fromCurrency?: string | null) => string;
  setCurrency: (code: CurrencyCode) => void;
}

const CurrencyContext = createContext<CurrencyCtx>({
  currency: 'ILS',
  symbol:   '₪',
  fmt:      (n) => `₪${Math.abs(n).toFixed(2)}`,
  convert:  (n) => n,
  fmtFrom:  (n) => `₪${Math.abs(n).toFixed(2)}`,
  setCurrency: () => {},
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(getSavedCurrency);
  const symbol = getCurrencySymbol(currency);
  const fmt    = useCallback((n: number) => fmtUtil(n, symbol), [symbol]);
  const convert = useCallback(
    (n: number, from?: string | null) => convertRate(n, from, currency),
    [currency],
  );
  const fmtFrom = useCallback(
    (n: number, from?: string | null) => fmtUtil(convertRate(n, from, currency), symbol),
    [currency, symbol],
  );

  const setCurrency = useCallback((code: CurrencyCode) => {
    saveCurrency(code);
    setCurrencyState(code);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, symbol, fmt, convert, fmtFrom, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
