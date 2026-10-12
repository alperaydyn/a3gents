import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyAppleIdToken, revokeAppleToken } from "./apple.js";
import { verifyGoogleIdToken } from "./google.js";
import { findOrCreateUser, createGuestUser, linkGuestUser, getUserById, deleteUserAccount } from "../users/service.js";
import { toPublicUser } from "../users/dto.js";
import { ok, fail } from "../../utils/response.js";

const loginSchema = z.object({
  provider: z.enum(["apple", "google"]),
  idToken: z.string().min(10),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

const linkSchema = z.object({
  provider: z.enum(["apple", "google"]),
  idToken: z.string().min(10),
  guestUserId: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  /**
   * Apple / Google OAuth Giriş Ucu (PBI-4.4)
   * Client'tan gelen idToken doğrulanır, kullanıcı bulunur veya yaratılır, Fastify JWT üretilir.
   */
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz istek gövdesi", parsed.error.flatten()));
    }
    const { provider, idToken, email, name } = parsed.data;

    let claims: { sub: string; email?: string };
    try {
      claims = provider === "apple" ? await verifyAppleIdToken(idToken, email) : await verifyGoogleIdToken(idToken, email);
    } catch (err) {
      request.log.warn({ err, provider }, "OAuth id_token doğrulaması başarısız");
      return reply.status(401).send(fail("AUTH_FAILED", "Kimlik doğrulama başarısız oldu"));
    }

    const effectiveEmail = claims.email || email;
    const user = await findOrCreateUser(provider, claims.sub, name, effectiveEmail);
    const token = await reply.jwtSign({ sub: user.id, authProvider: provider });

    const publicUser = toPublicUser(user, effectiveEmail);

    return reply.send(ok({ token, user: publicUser }));
  });

  /**
   * Misafir / Anonim Mod Oturumu (PBI-4.5)
   * Hesap açmadan okumak isteyen kullanıcılar için geçici misafir oturumu ve JWT üretir.
   */
  app.post("/guest", async (_request, reply) => {
    const user = await createGuestUser();
    const token = await reply.jwtSign({ sub: user.id, authProvider: "guest" });

    return reply.send(ok({ token, user: toPublicUser(user) }));
  });

  /**
   * Misafir Hesabını Apple / Google Hesabına Bağlama (Account Linking - PBI-4.5)
   * Misafir modunda oluşturulan yer imleri, okuma geçmişi ve ezber oturumlarını kalıcı hesaba aktarır.
   */
  app.post("/link", async (request, reply) => {
    const parsed = linkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz istek gövdesi", parsed.error.flatten()));
    }
    const { provider, idToken, guestUserId, email, name } = parsed.data;

    // Header token'ından veya body'den misafir ID'sini belirle
    let effectiveGuestId = guestUserId;
    if (!effectiveGuestId && request.headers.authorization) {
      try {
        const decoded = await request.jwtVerify<{ sub: string; authProvider: string }>();
        effectiveGuestId = decoded.sub;
      } catch {
        // Token çözülemediyse devam et
      }
    }

    if (!effectiveGuestId) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Bağlanacak misafir kullanıcı ID'si bulunamadı"));
    }

    let claims: { sub: string; email?: string };
    try {
      claims = provider === "apple" ? await verifyAppleIdToken(idToken, email) : await verifyGoogleIdToken(idToken, email);
    } catch (err) {
      request.log.warn({ err, provider }, "Account linking id_token doğrulaması başarısız");
      return reply.status(401).send(fail("AUTH_FAILED", "Kimlik doğrulama başarısız oldu"));
    }

    const effectiveEmail = claims.email || email;
    const user = await linkGuestUser(effectiveGuestId, provider, claims.sub, name, effectiveEmail);
    const token = await reply.jwtSign({ sub: user.id, authProvider: provider });

    const publicUser = toPublicUser(user, effectiveEmail);

    return reply.send(ok({ token, user: publicUser, linked: true }));
  });

  /**
   * Aktif Oturum ve Kullanıcı Doğrulama (PBI-4.4)
   */
  app.get("/me", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await getUserById(request.user.sub);
    if (!user) {
      return reply.status(404).send(fail("USER_NOT_FOUND", "Kullanıcı bulunamadı"));
    }
    return reply.send(ok(toPublicUser(user)));
  });

  /**
   * Şifre Sıfırlama Talebi (PBI-4.6.4)
   * Kullanıcının e-posta adresine 15 dakika geçerli kriptografik sıfırlama bağlantısı üretir.
   */
  app.post("/forgot-password", async (request, reply) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçerli bir e-posta adresi giriniz"));
    }

    const { createPasswordResetRequest } = await import("./passwordReset.js");
    const result = await createPasswordResetRequest(parsed.data.email);

    return reply.send(
      ok({
        message: "Eğer bu e-posta adresi ile bir hesap mevcutsa, şifre sıfırlama talimatları gönderilmiştir.",
        ...(process.env.NODE_ENV !== "production" && result ? { resetUrl: result.resetUrl } : {}),
      })
    );
  });

  /**
   * Şifre Sıfırlama Tamamlama (PBI-4.6.4)
   */
  app.post("/reset-password", async (request, reply) => {
    const schema = z.object({
      token: z.string().min(20),
      newPassword: z.string().min(8, "Şifre en az 8 karakter olmalıdır"),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(fail("VALIDATION_ERROR", "Geçersiz şifre veya bağlantı", parsed.error.flatten()));
    }

    const { completePasswordReset } = await import("./passwordReset.js");
    const result = await completePasswordReset(parsed.data.token, parsed.data.newPassword);
    if (!result.success) {
      return reply.status(400).send(fail("INVALID_TOKEN", result.message));
    }

    return reply.send(ok({ message: result.message }));
  });

  /**
   * Kullanıcı Hesabını Silme (PBI-AUTH.2 / App Store Guideline 5.1.1(v))
   * Oturumu açık olan kullanıcının tüm verilerini (okuma geçmişi, kavram geçmişi, yer imleri, ezberler)
   * ve profilini kalıcı olarak siler. Apple kullanıcısı ise Apple token iptal çağrısını gerçekleştirir.
   */
  app.delete("/me", { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.user.sub;
    const bodySchema = z
      .object({
        appleAuthCode: z.string().optional(),
      })
      .optional();

    const parsed = bodySchema?.safeParse(request.body);
    const appleAuthCode = parsed?.success ? parsed.data?.appleAuthCode : undefined;

    const user = await getUserById(userId);
    if (!user) {
      return reply.status(404).send(fail("USER_NOT_FOUND", "Silinecek kullanıcı bulunamadı"));
    }

    if (user.auth_provider === "apple") {
      try {
        await revokeAppleToken(appleAuthCode);
      } catch (err) {
        request.log.warn({ err, userId }, "Apple token revoke sırasında uyarı (işleme devam ediliyor)");
      }
    }

    const deleted = await deleteUserAccount(userId);
    if (!deleted) {
      return reply.status(500).send(fail("DELETE_FAILED", "Kullanıcı hesabı silinemedi"));
    }

    request.log.info({ userId, provider: user.auth_provider }, "Kullanıcı hesabı ve tüm verileri silindi");
    return reply.send(ok({ deleted: true, message: "Hesabınız ve tüm verileriniz kalıcı olarak silindi." }));
  });
}

