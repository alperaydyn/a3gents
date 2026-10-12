import { query } from "../../db/client.js";

export interface SubscriptionRecord {
  id: string;
  kullanici_id: string;
  store: "apple" | "google" | "stripe";
  original_transaction_id: string;
  product_id: string;
  status: "active" | "trial" | "past_due" | "canceled" | "expired";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Kullanıcının anlık aktif abonelik bilgisini döner.
 * Hakikat kaynağı (Single Source of Truth) `abonelikler` tablosudur.
 */
export async function getUserActiveSubscription(userId: string): Promise<SubscriptionRecord | null> {
  const res = await query<SubscriptionRecord>(
    `SELECT * FROM abonelikler 
     WHERE kullanici_id = $1 
       AND status IN ('active', 'trial') 
       AND current_period_end > NOW() 
     ORDER BY current_period_end DESC 
     LIMIT 1`,
    [userId]
  );

  return res.rows[0] ?? null;
}

/**
 * `kullanicilar.is_premium` denormalize önbellek bayrağını
 * `abonelikler` tablosundaki gerçek duruma göre günceller.
 */
export async function syncUserPremiumStatus(userId: string): Promise<boolean> {
  const activeSub = await getUserActiveSubscription(userId);
  const isPremium = Boolean(activeSub);

  await query(
    `UPDATE kullanicilar SET is_premium = $1 WHERE id = $2`,
    [isPremium, userId]
  );

  return isPremium;
}

/**
 * StoreKit 2 veya Google Play Webhook'u / IAP doğrulaması sonrasında
 * abonelik kaydını oluşturan veya güncelleyen metod.
 */
export async function upsertSubscription(data: {
  userId: string;
  store: "apple" | "google" | "stripe";
  originalTransactionId: string;
  productId: string;
  status: "active" | "trial" | "past_due" | "canceled" | "expired";
  periodStart: Date;
  periodEnd: Date;
  cancelAtPeriodEnd?: boolean;
}): Promise<SubscriptionRecord> {
  const res = await query<SubscriptionRecord>(
    `INSERT INTO abonelikler (
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
     RETURNING *`,
    [
      data.userId,
      data.store,
      data.originalTransactionId,
      data.productId,
      data.status,
      data.periodStart.toISOString(),
      data.periodEnd.toISOString(),
      data.cancelAtPeriodEnd ?? false,
    ]
  );

  // Denormalize bayrağı senkronize et
  await syncUserPremiumStatus(data.userId);

  return res.rows[0];
}
