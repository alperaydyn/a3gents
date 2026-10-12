import type { Kullanici } from "./service.js";

export interface PublicUser {
  id: string;
  authProvider: string;
  isGuest: boolean;
  name?: string;
  email?: string;
  role?: string;
  tercihModu: string;
  dil: string;
  isPremium: boolean;
  createdAt: string;
}

export function toPublicUser(user: Kullanici, emailOverride?: string): PublicUser {
  return {
    id: user.id,
    authProvider: user.auth_provider,
    isGuest: user.auth_provider === "guest" || user.auth_provider === "anonymous",
    name: user.name || (user.auth_provider === "guest" || user.auth_provider === "anonymous" ? "Misafir Okuyucu" : undefined),
    email: emailOverride || user.email,
    role: user.role || "user",
    tercihModu: user.tercih_modu,
    dil: user.dil,
    isPremium: user.is_premium,
    createdAt: user.created_at,
  };
}
