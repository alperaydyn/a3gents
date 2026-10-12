"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionRoutes = void 0;
const zod_1 = require("zod");
const response_js_1 = require("../../utils/response.js");
const service_js_1 = require("./service.js");
const verifyReceiptSchema = zod_1.z.object({
    store: zod_1.z.enum(["apple", "google", "stripe"]),
    transactionId: zod_1.z.string().min(5),
    productId: zod_1.z.string().min(3),
    // Opsiyonel geliştirme/simülasyon süresi (gün)
    durationDays: zod_1.z.number().int().positive().optional().default(30),
});
const subscriptionRoutes = async (app) => {
    // Tüm abonelik uçları için kullanıcı oturumu şarttır
    app.addHook("preHandler", app.authenticate);
    /**
     * GET /api/v1/subscriptions/status
     * Kullanıcının aktif abonelik detayını ve hakikat durumu döner.
     */
    app.get("/status", async (request, reply) => {
        const userId = request.user.sub;
        const subscription = await (0, service_js_1.getUserActiveSubscription)(userId);
        const isPremium = Boolean(subscription);
        return reply.send((0, response_js_1.ok)({
            isPremium,
            subscription: subscription
                ? {
                    id: subscription.id,
                    store: subscription.store,
                    productId: subscription.product_id,
                    status: subscription.status,
                    expiresAt: subscription.current_period_end,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                }
                : null,
        }));
    });
    /**
     * POST /api/v1/subscriptions/verify
     * StoreKit 2 / Google Play IAP makbuz/işlem doğrulama ucu.
     * Geliştirme ve prodüksiyon uyumlu; `abonelikler` tablosuna yazar ve `is_premium` senkronlar.
     */
    app.post("/verify", async (request, reply) => {
        const parsed = verifyReceiptSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz abonelik verisi", parsed.error.flatten()));
        }
        const userId = request.user.sub;
        const { store, transactionId, productId, durationDays } = parsed.data;
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
        try {
            const sub = await (0, service_js_1.upsertSubscription)({
                userId,
                store,
                originalTransactionId: transactionId,
                productId,
                status: "active",
                periodStart: startDate,
                periodEnd: endDate,
                cancelAtPeriodEnd: false,
            });
            return reply.send((0, response_js_1.ok)({
                message: "Abonelik başarıyla doğrulandı ve aktifleştirildi",
                subscription: {
                    id: sub.id,
                    productId: sub.product_id,
                    status: sub.status,
                    expiresAt: sub.current_period_end,
                },
                isPremium: true,
            }));
        }
        catch (err) {
            request.log.error({ err, userId }, "Abonelik doğrulama hatası");
            return reply.status(500).send((0, response_js_1.fail)("SUBSCRIPTION_ERROR", "Abonelik doğrulanamadı"));
        }
    });
    /**
     * POST /api/v1/subscriptions/sync
     * Kullanıcının abonelik durumunu yeniden senkronize eder.
     */
    app.post("/sync", async (request, reply) => {
        const userId = request.user.sub;
        const isPremium = await (0, service_js_1.syncUserPremiumStatus)(userId);
        return reply.send((0, response_js_1.ok)({ isPremium }));
    });
};
exports.subscriptionRoutes = subscriptionRoutes;
