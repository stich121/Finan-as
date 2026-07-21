import { create } from "zustand";
import type { AuthUser } from "@financas/shared";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  initializing: boolean;
  setSession: (user: AuthUser, accessToken: string) => void;
  clear: () => void;
  setInitializing: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  initializing: true,
  setSession: (user, accessToken) => set({ user, accessToken }),
  clear: () => set({ user: null, accessToken: null }),
  setInitializing: (value) => set({ initializing: value }),
}));
