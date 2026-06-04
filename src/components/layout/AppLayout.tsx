import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useTranslation } from 'react-i18next';
import { TopNav } from './TopNav';
import { useProfileStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';

export function AppLayout() {
  const auth = useAuth();
  const { i18n } = useTranslation();
  const { profile, setProfile } = useProfileStore();

  useEffect(() => {
    if (auth.isAuthenticated && !profile) {
      authApi.me().then((res) => setProfile(res.data)).catch(() => {});
    }
  }, [auth.isAuthenticated]);

  const isRTL = i18n.language === 'ar';

  return (
    <div className={`min-h-screen bg-gray-50 ${isRTL ? 'font-arabic' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <TopNav />
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
