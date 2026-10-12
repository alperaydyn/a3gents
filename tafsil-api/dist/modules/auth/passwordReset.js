"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.createPasswordResetRequest = createPasswordResetRequest;
exports.completePasswordReset = completePasswordReset;
const crypto_1 = __importDefault(require("crypto"));
const client_js_1 = require("../../db/client.js");
/**
 * Şifre hash'leme fonksiyonu (Kriptografik PBKDF2 / SHA-512).
 */
function hashPassword(password) {
    const salt = crypto_1.default.randomBytes(16).toString("hex");
    const hash = crypto_1.default.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return { hash: `${salt}:${hash}`, salt };
}
function verifyPassword(password, combinedHash) {
    const [salt, originalHash] = combinedHash.split(":");
    if (!salt || !originalHash)
        return false;
    const hash = crypto_1.default.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(originalHash));
}
/**
 * Tek kullanımlık şifre sıfırlama talebi oluşturur (15 dakika TTL).
 */
async function createPasswordResetRequest(email) {
    const normalizedEmail = email.toLowerCase().trim();
    const userRes = await (0, client_js_1.query)(`SELECT id, email FROM kullanicilar WHERE email = $1`, [normalizedEmail]);
    const user = userRes.rows[0];
    if (!user) {
        // Güvenlik (User Enumeration Koruması): E-posta bulunamasa bile hata döndürülmez
        return null;
    }
    // 32 baytlık kriptografik rastgele ham token
    const rawToken = crypto_1.default.randomBytes(32).toString("hex");
    // Veritabanında saklanacak SHA-256 hash'i (veritabanı sızsa bile token kullanılamaz)
    const tokenHash = crypto_1.default.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika
    await (0, client_js_1.query)(`INSERT INTO sifre_sifirlama_talepleri (kullanici_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`, [user.id, tokenHash, expiresAt.toISOString()]);
    const resetUrl = `https://new.tafsil.net/auth/reset-password?token=${rawToken}`;
    return { token: rawToken, resetUrl };
}
/**
 * Gönderilen token ile şifreyi sıfırlar.
 */
async function completePasswordReset(rawToken, newPassword) {
    const tokenHash = crypto_1.default.createHash("sha256").update(rawToken.trim()).digest("hex");
    const reqRes = await (0, client_js_1.query)(`SELECT id, kullanici_id 
     FROM sifre_sifirlama_talepleri 
     WHERE token_hash = $1 
       AND used_at IS NULL 
       AND expires_at > NOW()`, [tokenHash]);
    const requestRecord = reqRes.rows[0];
    if (!requestRecord) {
        return { success: false, message: "Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş." };
    }
    const { hash } = hashPassword(newPassword);
    // Şifreyi güncelle
    await (0, client_js_1.query)(`UPDATE kullanicilar SET password_hash = $1 WHERE id = $2`, [hash, requestRecord.kullanici_id]);
    // Token'ı kullanıldı olarak işaretle (replay attack engeli)
    await (0, client_js_1.query)(`UPDATE sifre_sifirlama_talepleri SET used_at = NOW() WHERE id = $1`, [requestRecord.id]);
    return { success: true, message: "Şifreniz başarıyla güncellendi." };
}
