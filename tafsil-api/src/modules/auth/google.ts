import { OAuth2Client } from "google-auth-library";
import { config } from "../../config/env.js";

const client = new OAuth2Client(config.auth.google.clientId || undefined);

export interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  emailVerified?: boolean;
}

export async function verifyGoogleIdToken(idToken: string, providedEmail?: string): Promise<GoogleIdTokenClaims> {
  // Geliştirme, simülatör veya test ortamı için graceful mock kontrolü.
  // PBI-9.2: Prodüksiyonda ASLA kabul edilmez (aksi halde e-posta bilen herkes hesaba girebilir).
  if (config.auth.allowDevTokens && (idToken.startsWith("google-dev-") || idToken.startsWith("mock-"))) {
    const rawSub = idToken.replace(/^(google-dev-|mock-)/, "");
    const email = providedEmail || (rawSub.includes("@") ? rawSub : `${rawSub}@gmail.com`);
    // Aynı e-posta ile giriş yapan tüm emülatörlerin aynı kullanıcı kimliğine bağlanması için deterministik sub
    const normalizedSub = email.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    return {
      sub: `google_${normalizedSub}`,
      email,
      emailVerified: true,
    };
  }

  if (!config.auth.google.clientId) {
    throw new Error("GOOGLE_CLIENT_ID yapılandırılmamış");
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.auth.google.clientId,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new Error("Geçersiz Google id_token: payload boş");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
  };
}
