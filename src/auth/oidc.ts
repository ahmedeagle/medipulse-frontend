import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const kcUrl    = import.meta.env.VITE_KC_URL;
const kcRealm  = import.meta.env.VITE_KC_REALM;
const clientId = import.meta.env.VITE_KC_CLIENT_ID;

/**
 * Singleton UserManager — the only place tokens are managed.
 *
 * Security choices:
 * - sessionStorage (not localStorage) — tokens cleared on tab close
 * - PKCE (code + code_challenge) — default for public clients in oidc-client-ts
 * - automaticSilentRenew — renews access token before it expires (no user disruption)
 * - RS256 validated by KC, not by us — we never touch raw tokens
 */
export const userManager = new UserManager({
  authority:                `${kcUrl}/realms/${kcRealm}`,
  client_id:                clientId,
  redirect_uri:             `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type:            'code',
  scope:                    'openid profile email roles tenant-claims',
  userStore:                new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew:     true,
  silent_redirect_uri:      `${window.location.origin}/silent-renew.html`,
  loadUserInfo:             true,
});

/**
 * Extracts the MediPulse role from KC realm_access claim.
 * Order matters — first match wins.
 */
export function getRoleFromToken(user: { profile?: any; access_token?: string } | null): string | null {
  // Try ID token first (profile)
  let roles: string[] = user?.profile?.realm_access?.roles ?? [];

  // Fallback: decode access token (roles are always there even if not in ID token)
  if (!roles.length && user?.access_token) {
    try {
      const payload = JSON.parse(atob(user.access_token.split('.')[1]));
      roles = payload?.realm_access?.roles ?? [];
    } catch { /* ignore decode errors */ }
  }

  if (roles.includes('system-admin'))   return 'system_admin';
  if (roles.includes('chain-admin'))    return 'chain_admin';
  if (roles.includes('pharmacy-admin')) return 'pharmacy_admin';
  if (roles.includes('supplier-admin')) return 'supplier_admin';
  return null;
}

/** Returns the root dashboard path for a given role. */
export function getDashboardPath(role: string | null): string {
  if (role === 'pharmacy_admin') return '/pharmacy';
  if (role === 'supplier_admin') return '/supplier';
  if (role === 'system_admin')   return '/admin';
  if (role === 'chain_admin')    return '/chain';
  return '/login';
}
