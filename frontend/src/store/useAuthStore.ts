import { create } from "zustand";
import { authApi } from "../lib/api";

type User = { id: number; email: string; full_name: string; role: string };

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  setToken: (token: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, full_name: string, password: string) => Promise<void>;
  fetchUser: () => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("aether_token"),
  loading: false,

  setToken: (token) => {
    localStorage.setItem("aether_token", token);
    set({ token });
  },

  login: async (email, password) => {
    set({ loading: true });
    const { data } = await authApi.login({ email, password });
    localStorage.setItem("aether_token", data.access_token);
    set({ token: data.access_token });
    const me = await authApi.me();
    set({ user: me.data, loading: false });
  },

  register: async (email, full_name, password) => {
    set({ loading: true });
    const { data } = await authApi.register({ email, full_name, password });
    localStorage.setItem("aether_token", data.access_token);
    set({ token: data.access_token });
    const me = await authApi.me();
    set({ user: me.data, loading: false });
  },

  fetchUser: async () => {
    const token = localStorage.getItem("aether_token");
    if (!token) return;
    try {
      const { data } = await authApi.me();
      set({ user: data, token });
    } catch {
      localStorage.removeItem("aether_token");
      set({ user: null, token: null });
    }
  },

  logout: () => {
    localStorage.removeItem("aether_token");
    set({ user: null, token: null });
  },
}));
