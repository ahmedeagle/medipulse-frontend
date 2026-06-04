import { create } from 'zustand';
import type { User } from '../types';

/**
 * Stores the local user profile fetched from GET /auth/me.
 * Identity and tokens are managed entirely by react-oidc-context + Keycloak.
 * This store only caches the app-level profile (tenant, role, name).
 */
interface ProfileStore {
  profile: User | null;
  setProfile: (user: User) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  profile: null,

  setProfile: (user: User) => set({ profile: user }),

  clearProfile: () => set({ profile: null }),
}));
