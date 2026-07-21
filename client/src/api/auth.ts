import type { AuthUser, LoginInput, RegisterInput } from "@financas/shared";
import { api } from "../lib/api";

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export const authApi = {
  register: (input: RegisterInput) => api.post<AuthResponse>("/auth/register", input).then((r) => r.data),
  login: (input: LoginInput) => api.post<AuthResponse>("/auth/login", input).then((r) => r.data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get<AuthUser>("/auth/me").then((r) => r.data),
};
