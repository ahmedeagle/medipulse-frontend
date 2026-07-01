import { useAuth } from 'react-oidc-context';
import { Navigate } from 'react-router-dom';
import { getRoleFromToken, getDashboardPath } from '../../auth/oidc';

export default function LoginPage() {
  const auth = useAuth();

  if (auth.isAuthenticated) {
    return <Navigate to={getDashboardPath(getRoleFromToken(auth.user))} replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-4xl">💊</span>
            <span className="text-3xl font-bold text-gray-900">Bnoov</span>
          </div>
          <p className="text-gray-500 text-sm">AI-Powered Pharmacy Procurement Intelligence</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Welcome</h1>
          <p className="text-gray-500 text-sm mb-8">
            Sign in securely via your Bnoov account
          </p>

          {auth.error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Authentication error: {auth.error.message}
            </div>
          )}

          <button
            onClick={() => auth.signinRedirect()}
            disabled={auth.isLoading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {auth.isLoading ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Redirecting…
              </>
            ) : (
              'Sign in with Bnoov'
            )}
          </button>

          <p className="mt-6 text-xs text-gray-400">
            Secured by Keycloak · Your credentials never touch this app
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} Bnoov. All rights reserved.
        </p>
      </div>
    </div>
  );
}
