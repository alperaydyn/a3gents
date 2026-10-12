import crypto from "crypto";
import { query } from "../../db/client.js";

/**
 * Şifre hash'leme fonksiyonu (Kriptografik PBKDF2 / SHA-512).
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { hash: `${salt}:${hash}`, salt };
}

export function verifyPassword(password: string, combinedHash: string): boolean {
  const [salt, originalHash] = combinedHash.split(":");
  if (!salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}

/**
 * Tek kullanımlık şifre sıfırlama talebi oluşturur (15 dakika TTL).
 */
export async function createPasswordResetRequest(email: string): Promise<{ token: string; resetUrl: string } | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const userRes = await query<{ id: string; email: string }>(
    `SELECT id, email FROM kullanicilar WHERE email = $1`,
    [normalizedEmail]
  );

  const user = userRes.rows[0];
  if (!user) {
    // Güvenlik (User Enumeration Koruması): E-posta bulunamasa bile hata döndürülmez
    return null;
  }

  // 32 baytlık kriptografik rastgele ham token
  const rawToken = crypto.randomBytes(32).toString("hex");
  // Veritabanında saklanacak SHA-256 hash'i (veritabanı sızsa bile token kullanılamaz)
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

  await query(
    `INSERT INTO sifre_sifirlama_talepleri (kullanici_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt.toISOString()]
  );

  const resetUrl = `https://new.tafsil.net/auth/reset-password?token=${rawToken}`;
  return { token: rawToken, resetUrl };
}

/**
 * Gönderilen token ile şifreyi sıfırlar.
 */
export async function completePasswordReset(rawToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");

  const reqRes = await query<{ id: string; kullanici_id: string }>(
    `SELECT id, kullanici_id 
     FROM sifre_sifirlama_talepleri 
     WHERE token_hash = $1 
       AND used_at IS NULL 
       AND expires_at > NOW()`,
    [tokenHash]
  );

  const requestRecord = reqRes.rows[0];
  if (!requestRecord) {
    return { success: false, message: "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş." };
  }

  const { hash } = hashPassword(newPassword);

  // Şifreyi güncelle
  await query(
    `UPDATE kullanicilar SET password_hash = $1 WHERE id = $2`,
    [hash, requestRecord.kullanici_id]
  );

  // Token'ı kullanıldı olarak işaretle (replay attack engeli)
  await query(
    `UPDATE sifre_sifirlama_talepleri SET used_at = NOW() WHERE id = $1`,
    [requestRecord.id]
  );

  return { success: true, message: "Şifreniz başarıyla güncellendi." };
}
