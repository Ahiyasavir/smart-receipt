import React, { createContext, useContext, useState, useCallback } from 'react';
import { CurrencyCode, getSavedCurrency, saveCurrency, getCurrencySymbol, fmt as fmtUtil } from '../utils/currency';

interface CurrencyCtx {
  currency: CurrencyCode;
  symbol:   string;
  fmt:      (amount: number) => string;
  setCurrency: (code: CurrencyCode) => void;
}

const CurrencyContext = createContext<CurrencyCtx>({
  currency: 'ILS',
  symbol:   '₪',
  fmt:      (n) => `₪${Math.abs(n).toFixed(2)}`,
  setCurrency: () => {},
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(getSavedCurrency);
  const symbol = getCurrencySymbol(currency);
  const fmt    = useCallback((n: number) => fmtUtil(n, symbol), [symbol]);

  const setCurrency = useCallback((code: CurrencyCode) => {
    saveCurrency(code);
    setCurrencyState(code);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, symbol, fmt, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
