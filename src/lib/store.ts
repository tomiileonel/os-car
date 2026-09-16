"use client";

import { create } from "zustand";
import { api } from "@/lib/api-client";
import type { AdminSession } from "@/lib/oscar";

interface SessionStore {
  admin: AdminSession | null;
  loaded: boolean;
  setAdmin: (admin: AdminSession | null) => void;
  refresh: () => Promise<void>;
}

/** Sesión del operario (cookie httpOnly + este store solo refleja estado). */
export const useSession = create<SessionStore>((set) => ({
  admin: null,
  loaded: false,
  setAdmin: (admin) => set({ admin, loaded: true }),
  refresh: async () => {
    try {
      const data = await api.get<{ admin: AdminSession | null }>("/api/admin/auth/session");
      set({ admin: data.admin, loaded: true });
    } catch {
      set({ admin: null, loaded: true });
    }
  },
}));
