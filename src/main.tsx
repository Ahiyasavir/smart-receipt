import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { CurrencyProvider } from './contexts/CurrencyContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <CurrencyProvider>
        <App />
      </CurrencyProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
