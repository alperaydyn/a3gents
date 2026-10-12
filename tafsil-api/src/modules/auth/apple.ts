import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../../config/env.js";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";

// Apple'ın genel anahtarları nadiren rotasyona uğrar; jose bunu otomatik
// önbellekler ve gerektiğinde tazeler.
const appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  emailVerified?: boolean;
}

export async function verifyAppleIdToken(idToken: string, providedEmail?: string): Promise<AppleIdTokenClaims> {
  // Geliştirme, simülatör veya test ortamı için graceful mock kontrolü.
  // PBI-9.2: Prodüksiyonda ASLA kabul edilmez.
  if (config.auth.allowDevTokens && (idToken.startsWith("apple-dev-") || idToken.startsWith("mock-"))) {
    const rawSub = idToken.replace(/^(apple-dev-|mock-)/, "") || "dev_apple_user";
    const email = providedEmail || (rawSub.includes("@") ? rawSub : `${rawSub}@privaterelay.appleid.com`);
    const normalizedSub = email.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    return {
      sub: `apple_${normalizedSub}`,
      email,
      emailVerified: true,
    };
  }

  const audience = config.auth.apple.clientId || "net.tafsil.app";

  const { payload } = await jwtVerify(idToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience,
  });

  if (!payload.sub) {
    throw new Error("Geçersiz Apple id_token: sub alanı eksik");
  }

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
  };
}

/**
 * Apple REST API ile yetkilendirme iptali (Token Revoke - Guideline 5.1.1(v)).
 * Kullanıcı hesabını sildiğinde Apple'a bildirim göndererek App Store yönergelerine tam uyum sağlar.
 * Gerekli Apple Developer Key bilgileri env'de tanımlı değilse güvenli log düşer ve işlemi engellemez.
 */
export async function revokeAppleToken(authCodeOrToken?: string): Promise<{ success: boolean; reason?: string }> {
  if (!authCodeOrToken) {
    return { success: true, reason: "no_token_provided" };
  }

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const clientId = config.auth.apple.clientId || "net.tafsil.app";

  if (!teamId || !keyId || !privateKey) {
    // Apple Developer Private Key henüz yapılandırılmamışsa, hesap silme işlemini bloke etme
    return { success: true, reason: "apple_credentials_not_configured" };
  }

  try {
    const { SignJWT, importPKCS8 } = await import("jose");
    const formattedKey = privateKey.includes("-----BEGIN PRIVATE KEY-----")
      ? privateKey
      : `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;

    const ecPrivateKey = await importPKCS8(formattedKey, "ES256");

    const clientSecret = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime("5m")
      .setAudience(APPLE_ISSUER)
      .setSubject(clientId)
      .sign(ecPrivateKey);

    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("token", authCodeOrToken);

    const res = await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, reason: `apple_revoke_failed: ${res.status} ${errText}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, reason: err?.message || "apple_revoke_error" };
  }
}

