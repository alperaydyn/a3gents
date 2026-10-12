"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticStatusSchema = exports.DiagnosticReportSchema = exports.DiagnosticEventSchema = exports.DIAG_OPS = exports.DIAG_LAYERS = void 0;
const zod_1 = require("zod");
/**
 * İstemci tanılama raporu sözleşmesi (PBI-10.3).
 * Mobil `src/services/diagnostics/diagnosticReport.ts > DiagnosticReport` ile birebir uyumludur.
 * Şema bilinçli olarak toleranslıdır (`passthrough`): eski/yeni istemci sürümleri raporu
 * reddettirmeden gönderebilsin; yalnızca sorgulanan alanlar sıkı doğrulanır.
 */
exports.DIAG_LAYERS = [
    "L1_ZUSTAND",
    "L2_KV",
    "L3_SQLITE",
    "L4_SNAPSHOT",
    "L5_FILE",
    "NET_API",
    "NET_CDN",
    "NET_EXT",
    "SYS",
];
exports.DIAG_OPS = [
    "read",
    "write",
    "delete",
    "hit",
    "miss",
    "fallback",
    "request",
    "push",
    "pull",
    "download",
    "state",
];
exports.DiagnosticEventSchema = zod_1.z.object({
    ts: zod_1.z.number().int().positive(),
    layer: zod_1.z.enum(exports.DIAG_LAYERS),
    op: zod_1.z.enum(exports.DIAG_OPS),
    key: zod_1.z.string().max(400),
    status: zod_1.z.enum(["ok", "miss", "error"]).default("ok"),
    bytes: zod_1.z.number().int().nonnegative().optional(),
    durationMs: zod_1.z.number().int().nonnegative().optional(),
    count: zod_1.z.number().int().positive().default(1),
    detail: zod_1.z.string().max(600).optional(),
});
const SyncCountsSchema = zod_1.z
    .object({
    bookmarks: zod_1.z.number().int().nonnegative(),
    history: zod_1.z.number().int().nonnegative(),
    concepts: zod_1.z.number().int().nonnegative(),
    memorization: zod_1.z.number().int().nonnegative(),
})
    .partial();
exports.DiagnosticReportSchema = zod_1.z
    .object({
    report_version: zod_1.z.number().int().positive().default(1),
    generated_at: zod_1.z.string().max(40),
    install_id: zod_1.z.string().max(64).optional(),
    user_note: zod_1.z.string().max(1000).optional(),
    app: zod_1.z
        .object({
        version: zod_1.z.string().max(32).optional(),
        build: zod_1.z.string().max(32).optional(),
        runtime: zod_1.z.enum(["dev", "release"]).optional(),
        platform: zod_1.z.string().max(16).optional(),
        os_version: zod_1.z.string().max(32).optional(),
        device: zod_1.z.string().max(64).optional(),
        api_base: zod_1.z.string().max(255).optional(),
    })
        .passthrough(),
    auth: zod_1.z
        .object({
        is_guest: zod_1.z.boolean().optional(),
        has_server_token: zod_1.z.boolean().optional(),
        session_expired: zod_1.z.boolean().optional(),
    })
        .passthrough()
        .optional(),
    connectivity: zod_1.z
        .object({
        status: zod_1.z.string().max(20).optional(),
        networkType: zod_1.z.string().max(24).optional(),
        api: zod_1.z.object({ latencyMs: zod_1.z.number().nullable().optional() }).passthrough().optional(),
    })
        .passthrough()
        .optional(),
    last_sync: zod_1.z
        .object({
        at: zod_1.z.number(),
        ok: zod_1.z.boolean(),
        phase: zod_1.z.string().max(16),
        durationMs: zod_1.z.number().optional(),
        pushed: SyncCountsSchema.optional(),
        pulled: SyncCountsSchema.optional(),
        error: zod_1.z.string().max(300).optional(),
    })
        .nullable()
        .optional(),
    server_status: zod_1.z.record(zod_1.z.any()).nullable().optional(),
    storage: zod_1.z
        .object({
        totalBytes: zod_1.z.number().optional(),
        l2: zod_1.z.object({ logicalBytes: zod_1.z.number().optional(), physicalBytes: zod_1.z.number().nullable().optional() }).passthrough().optional(),
        l3: zod_1.z.object({ totalBytes: zod_1.z.number().optional() }).passthrough().optional(),
        l5: zod_1.z.object({ totalBytes: zod_1.z.number().optional() }).passthrough().optional(),
        userData: zod_1.z.object({ readingHistory: zod_1.z.number().optional() }).passthrough().optional(),
    })
        .passthrough()
        .optional(),
    layer_counters: zod_1.z.record(zod_1.z.any()).optional(),
    events: zod_1.z.array(exports.DiagnosticEventSchema).max(600).default([]),
})
    .passthrough();
exports.DiagnosticStatusSchema = zod_1.z.object({
    durum: zod_1.z.enum(["yeni", "inceleniyor", "cozuldu"]),
});
