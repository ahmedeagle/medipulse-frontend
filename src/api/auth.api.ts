import client from './client';

/**
 * Auth API — login/logout are handled by Keycloak OIDC redirect.
 * This module only exposes app-level profile calls that go through our NestJS API.
 */
export const authApi = {
  /** Fetch current user profile (also triggers lazy profile creation on first login). */
  me: () => client.get('/auth/me'),

  /** Onboard a new pharmacy or supplier (system_admin only). */
  register: (data: {
    email: string;
    firstName: string;
    lastName: string;
    tenantName: string;
    tenantType: 'pharmacy' | 'supplier';
  }) => client.post('/auth/register', data),
};
