"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicUser = toPublicUser;
function toPublicUser(user, emailOverride) {
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
