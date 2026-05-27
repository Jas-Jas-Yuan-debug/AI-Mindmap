// Zustand store that mirrors the main-process AI provider auth state into the
// renderer so UI components can read it reactively. This store NEVER holds API
// keys, tokens, or any credential material — it only holds metadata (provider
// labels, which providers are configured, which is active).
//
// Call `refresh()` once on app start and after any key/auth mutation to sync
// from the main process.

import { create } from "zustand";
import type { ProviderId, ProviderMeta, AuthStatus } from "../../shared/platform.js";
import {
  aiListProviders,
  aiAuthStatus,
  aiGetActiveProvider,
  aiSetKey,
  aiClearAuth,
  aiSetActiveProvider,
} from "../ai/aiClient.js";

export interface AiProviderState {
  providers: ProviderMeta[];
  statuses: Record<ProviderId, AuthStatus>;
  active: ProviderId;
  /** True once the first successful refresh() has completed. */
  loaded: boolean;

  /** Load providers + statuses + active provider in parallel, then set loaded=true. */
  refresh(): Promise<void>;
  /** Set the API key for a provider, then refresh. */
  setKey(id: ProviderId, key: string): Promise<void>;
  /** Clear all stored credentials for a provider, then refresh. */
  clearAuth(id: ProviderId): Promise<void>;
  /** Switch the active provider and update local state immediately. */
  setActive(id: ProviderId): Promise<void>;
}

export const useAiProvider = create<AiProviderState>((set) => ({
  providers: [],
  statuses: {} as Record<ProviderId, AuthStatus>,
  active: "anthropic",
  loaded: false,

  async refresh() {
    const [providers, statuses, active] = await Promise.all([
      aiListProviders(),
      aiAuthStatus(),
      aiGetActiveProvider(),
    ]);
    set({ providers, statuses, active, loaded: true });
  },

  async setKey(id, key) {
    await aiSetKey(id, key);
    const [providers, statuses, active] = await Promise.all([
      aiListProviders(),
      aiAuthStatus(),
      aiGetActiveProvider(),
    ]);
    set({ providers, statuses, active, loaded: true });
  },

  async clearAuth(id) {
    await aiClearAuth(id);
    const [providers, statuses, active] = await Promise.all([
      aiListProviders(),
      aiAuthStatus(),
      aiGetActiveProvider(),
    ]);
    set({ providers, statuses, active, loaded: true });
  },

  async setActive(id) {
    await aiSetActiveProvider(id);
    set({ active: id });
  },
}));
