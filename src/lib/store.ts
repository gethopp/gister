import { create } from 'zustand';
import { clearAllData, getSetting, setSetting, type UserProfile } from './db';
import { syncGists } from './sync';

/**
 * Global app state (Zustand). Dexie stays the source of truth for persisted
 * data; this store mirrors it for synchronous access across components and
 * holds runtime-only state like sync progress.
 */
interface AppState {
  /** True once persisted settings have been loaded from Dexie. */
  isHydrated: boolean;
  token: string | null;
  profile: UserProfile | null;
  isSyncing: boolean;
  syncError: string | null;
  lastSyncAt: string | null;

  hydrate: () => Promise<void>;
  completeLogin: (args: {
    token: string;
    profile: UserProfile;
    enterpriseHost: string;
    clientId: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  runSync: () => Promise<void>;
}

export const useAppStore = create<AppState>()((set, get) => ({
  isHydrated: false,
  token: null,
  profile: null,
  isSyncing: false,
  syncError: null,
  lastSyncAt: null,

  hydrate: async () => {
    const [token, profile, lastSyncAt] = await Promise.all([
      getSetting('accessToken'),
      getSetting('profile'),
      getSetting('lastSyncAt'),
    ]);
    set({
      token: token ?? null,
      profile: profile ?? null,
      lastSyncAt: lastSyncAt ?? null,
      isHydrated: true,
    });
  },

  completeLogin: async ({ token, profile, enterpriseHost, clientId }) => {
    await setSetting('accessToken', token);
    await setSetting('profile', profile);
    await setSetting('enterpriseHost', enterpriseHost);
    await setSetting('clientId', clientId);
    set({ token, profile });
  },

  logout: async () => {
    await clearAllData();
    set({ token: null, profile: null, lastSyncAt: null, syncError: null });
  },

  runSync: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true, syncError: null });
    try {
      await syncGists();
      set({ lastSyncAt: new Date().toISOString() });
    } catch (e) {
      set({ syncError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ isSyncing: false });
    }
  },
}));
