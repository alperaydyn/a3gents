"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserActiveSubscription = getUserActiveSubscription;
exports.syncUserPremiumStatus = syncUserPremiumStatus;
exports.upsertSubscription = upsertSubscription;
const client_js_1 = require("../../db/client.js");
/**
 * Kullanıcının anlık aktif abonelik bilgisini döner.
 * Hakikat kaynağı (Single Source of Truth) `abonelikler` tablosudur.
 */
async function getUserActiveSubscription(userId) {
    const res = await (0, client_js_1.query)(`SELECT * FROM abonelikler 
     WHERE kullanici_id = $1 
       AND status IN ('active', 'trial') 
       AND current_period_end > NOW() 
     ORDER BY current_period_end DESC 
     LIMIT 1`, [userId]);
    return res.rows[0] ?? null;
}
/**
 * `kullanicilar.is_premium` denormalize önbellek bayrağını
 * `abonelikler` tablosundaki gerçek duruma göre günceller.
 */
async function syncUserPremiumStatus(userId) {
    const activeSub = await getUserActiveSubscription(userId);
    const isPremium = Boolean(activeSub);
    await (0, client_js_1.query)(`UPDATE kullanicilar SET is_premium = $1 WHERE id = $2`, [isPremium, userId]);
    return isPremium;
}
/**
 * StoreKit 2 veya Google Play Webhook'u / IAP doğrulaması sonrasında
 * abonelik kaydını oluşturan veya güncelleyen metod.
 */
async function upsertSubscription(data) {
    const res = await (0, client_js_1.query)(`INSERT INTO abonelikler (
       kullanici_id, store, original_transaction_id, product_id, 
       status, current_period_start, current_period_end, cancel_at_period_end, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (original_transaction_id) DO UPDATE SET
       status = EXCLUDED.status,
       product_id = EXCLUDED.product_id,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       updated_at = NOW()
     RETURNING *`, [
        data.userId,
        data.store,
        data.originalTransactionId,
        data.productId,
        data.status,
        data.periodStart.toISOString(),
        data.periodEnd.toISOString(),
        data.cancelAtPeriodEnd ?? false,
    ]);
    // Denormalize bayrağı senkronize et
    await syncUserPremiumStatus(data.userId);
    return res.rows[0];
}
