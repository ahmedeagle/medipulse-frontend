import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import { getRoleFromToken, getDashboardPath } from '../../auth/oidc';

/**
 * Handles the OIDC redirect callback from Keycloak.
 * KC redirects here after login with ?code=... in the URL.
 * oidc-client-ts exchanges the code for tokens automatically.
 * We just wait for isAuthenticated then redirect to the correct dashboard.
 */
export default function OidcCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.isAuthenticated) {
      const role = getRoleFromToken(auth.user);
      navigate(getDashboardPath(role), { replace: true });
    }
  }, [auth.isAuthenticated]);

  if (auth.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Login failed</h2>
          <p className="text-sm text-gray-500 mb-6">{auth.error.message}</p>
          <button
            onClick={() => auth.signinRedirect()}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mx-auto mb-4" />
        <p className="text-sm text-gray-500">Completing sign in…</p>
      </div>
    </div>
  );
}
