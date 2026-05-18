import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { getStoredLanguage, getDir } from './i18n';
import './styles/tokens.css';
import './index.css';

// Apply persisted language + direction before first paint (RTL for Hebrew).
const lang = getStoredLanguage();
document.documentElement.lang = lang;
document.documentElement.dir = getDir(lang);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CurrencyProvider>
        <App />
      </CurrencyProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
