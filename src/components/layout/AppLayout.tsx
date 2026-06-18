import { Outlet, useLocation } from 'react-router-dom';
import { Suspense } from 'react';
import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useTranslation } from 'react-i18next';
import { TopNav } from './TopNav';
import { ChatWidget } from '../ChatWidget';
import { useProfileStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';

// Only the POS terminal itself needs fullscreen — sub-routes (/sales, /shifts, etc.) are normal scrollable report pages
const FULLSCREEN_ROUTES = ['/pharmacy/pos']

export function AppLayout() {
  const auth = useAuth();
  const { i18n } = useTranslation();
  const { profile, setProfile } = useProfileStore();
  const location = useLocation();

  useEffect(() => {
    if (auth.isAuthenticated && !profile) {
      authApi.me().then((res) => setProfile(res.data)).catch(() => {});
    }
  }, [auth.isAuthenticated]);

  const isRTL = i18n.language === 'ar';
  const isFullscreen = FULLSCREEN_ROUTES.includes(location.pathname)

  return (
    <div className={`min-h-screen bg-gray-50 ${isRTL ? 'font-arabic' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <TopNav />
      <ChatWidget />
      <main className={isFullscreen
        ? 'h-[calc(100vh-56px)] overflow-hidden'
        : 'max-w-screen-2xl mx-auto px-4 sm:px-6 py-6'
      }>
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
          </div>
        }>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
