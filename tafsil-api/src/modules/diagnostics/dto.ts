import { z } from "zod";

/**
 * İstemci tanılama raporu sözleşmesi (PBI-10.3).
 * Mobil `src/services/diagnostics/diagnosticReport.ts > DiagnosticReport` ile birebir uyumludur.
 * Şema bilinçli olarak toleranslıdır (`passthrough`): eski/yeni istemci sürümleri raporu
 * reddettirmeden gönderebilsin; yalnızca sorgulanan alanlar sıkı doğrulanır.
 */

export const DIAG_LAYERS = [
  "L1_ZUSTAND",
  "L2_KV",
  "L3_SQLITE",
  "L4_SNAPSHOT",
  "L5_FILE",
  "NET_API",
  "NET_CDN",
  "NET_EXT",
  "SYS",
] as const;

export const DIAG_OPS = [
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
] as const;

export const DiagnosticEventSchema = z.object({
  ts: z.number().int().positive(),
  layer: z.enum(DIAG_LAYERS),
  op: z.enum(DIAG_OPS),
  key: z.string().max(400),
  status: z.enum(["ok", "miss", "error"]).default("ok"),
  bytes: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  count: z.number().int().positive().default(1),
  detail: z.string().max(600).optional(),
});

const SyncCountsSchema = z
  .object({
    bookmarks: z.number().int().nonnegative(),
    history: z.number().int().nonnegative(),
    concepts: z.number().int().nonnegative(),
    memorization: z.number().int().nonnegative(),
  })
  .partial();

export const DiagnosticReportSchema = z
  .object({
    report_version: z.number().int().positive().default(1),
    generated_at: z.string().max(40),
    install_id: z.string().max(64).optional(),
    user_note: z.string().max(1000).optional(),
    app: z
      .object({
        version: z.string().max(32).optional(),
        build: z.string().max(32).optional(),
        runtime: z.enum(["dev", "release"]).optional(),
        platform: z.string().max(16).optional(),
        os_version: z.string().max(32).optional(),
        device: z.string().max(64).optional(),
        api_base: z.string().max(255).optional(),
      })
      .passthrough(),
    auth: z
      .object({
        is_guest: z.boolean().optional(),
        has_server_token: z.boolean().optional(),
        session_expired: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    connectivity: z
      .object({
        status: z.string().max(20).optional(),
        networkType: z.string().max(24).optional(),
        api: z.object({ latencyMs: z.number().nullable().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    last_sync: z
      .object({
        at: z.number(),
        ok: z.boolean(),
        phase: z.string().max(16),
        durationMs: z.number().optional(),
        pushed: SyncCountsSchema.optional(),
        pulled: SyncCountsSchema.optional(),
        error: z.string().max(300).optional(),
      })
      .nullable()
      .optional(),
    server_status: z.record(z.any()).nullable().optional(),
    storage: z
      .object({
        totalBytes: z.number().optional(),
        l2: z.object({ logicalBytes: z.number().optional(), physicalBytes: z.number().nullable().optional() }).passthrough().optional(),
        l3: z.object({ totalBytes: z.number().optional() }).passthrough().optional(),
        l5: z.object({ totalBytes: z.number().optional() }).passthrough().optional(),
        userData: z.object({ readingHistory: z.number().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    layer_counters: z.record(z.any()).optional(),
    events: z.array(DiagnosticEventSchema).max(600).default([]),
  })
  .passthrough();

export type DiagnosticReportInput = z.infer<typeof DiagnosticReportSchema>;

export const DiagnosticStatusSchema = z.object({
  durum: z.enum(["yeni", "inceleniyor", "cozuldu"]),
});
