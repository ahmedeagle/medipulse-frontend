import axios from 'axios';
import { userManager } from '../auth/oidc';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Attach KC access token to every request.
 * Token lives in sessionStorage — managed entirely by oidc-client-ts.
 * We never read or write tokens manually.
 */
client.interceptors.request.use(async (config) => {
  // Short-circuit when the browser reports offline — fail fast with a clear,
  // localizable message so callers can render a friendly state instead of
  // waiting for the underlying network stack to time out.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const err: any = new Error('OFFLINE');
    err.code = 'OFFLINE';
    err.isOffline = true;
    err.response = { data: { message: 'لا يوجد اتصال بالإنترنت' } };
    throw err;
  }
  const user = await userManager.getUser();
  if (user?.access_token) {
    config.headers.Authorization = `Bearer ${user.access_token}`;
  }
  return config;
});

/**
 * On 401 redirect to KC — silent renew has already failed at this point.
 * Never show a broken state; always drive back through KC login.
 */
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Network/CORS failures (no response object) — flag as offline-like so the
    // UI can show the friendly banner instead of "Network Error".
    if (!error.response && !error.isOffline) {
      error.isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      error.response = { data: { message: error.isOffline ? 'لا يوجد اتصال بالإنترنت' : 'تعذّر الوصول إلى الخادم' } };
    }
    if (error.response?.status === 401) {
      await userManager.signinRedirect();
    }
    return Promise.reject(error);
  },
);

export default client;
