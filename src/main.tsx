import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from 'react-oidc-context';
import { I18nextProvider } from 'react-i18next';
import App from './App';
import { userManager } from './auth/oidc';
import { ErrorBoundary } from './components/ErrorBoundary';
import i18n from './i18n';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // 60s stale: aggressive enough for live inventory, conservative enough to avoid hammering
      staleTime: 60_000,
      // Keep unused cache for 10 min — cheap re-navigations don't refetch
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      // Don't retry failed requests while offline
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <AuthProvider userManager={userManager}>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </AuthProvider>
      </I18nextProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
