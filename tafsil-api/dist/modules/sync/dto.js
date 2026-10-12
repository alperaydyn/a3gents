"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncPullSchema = exports.SyncPushSchema = exports.MemorizationSessionSyncItemSchema = exports.ConceptHistorySyncItemSchema = exports.ReadingHistorySyncItemSchema = exports.BookmarkSyncItemSchema = void 0;
const zod_1 = require("zod");
exports.BookmarkSyncItemSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    sure_id: zod_1.z.number().int().min(1).max(114),
    ayet_no: zod_1.z.number().int().min(1),
    etiket: zod_1.z.string().max(64).default("Genel"),
    notlar: zod_1.z.string().optional().nullable(),
    updated_at: zod_1.z.string().optional()
});
exports.ReadingHistorySyncItemSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    sure_id: zod_1.z.number().int().min(1).max(114),
    ayet_no: zod_1.z.number().int().min(1),
    okunma_suresi_sn: zod_1.z.number().int().min(0).default(0),
    okundu_tarihi: zod_1.z.string().optional()
});
exports.ConceptHistorySyncItemSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    kavram_slug: zod_1.z.string().min(1).max(64),
    kavram_adi: zod_1.z.string().min(1).max(128),
    incelenme_suresi_sn: zod_1.z.number().int().min(0).default(0),
    created_at: zod_1.z.string().optional()
});
exports.MemorizationSessionSyncItemSchema = zod_1.z.object({
    id: zod_1.z.string().optional(),
    sure_id: zod_1.z.number().int().min(1).max(114),
    baslangic_ayet: zod_1.z.number().int().min(1),
    bitis_ayet: zod_1.z.number().int().min(1),
    durum: zod_1.z.string().default("ogreniliyor"),
    baslik: zod_1.z.string().max(128).optional().nullable(),
    repetition_number: zod_1.z.number().int().default(0),
    interval_days: zod_1.z.number().int().default(1),
    ease_factor: zod_1.z.number().default(2.5),
    next_review_at: zod_1.z.string().optional()
});
exports.SyncPushSchema = zod_1.z.object({
    user_id: zod_1.z.string().min(1).optional(),
    client_timestamp: zod_1.z.string().optional(),
    bookmarks: zod_1.z.array(exports.BookmarkSyncItemSchema).default([]),
    reading_history: zod_1.z.array(exports.ReadingHistorySyncItemSchema).default([]),
    concept_history: zod_1.z.array(exports.ConceptHistorySyncItemSchema).default([]),
    memorization_sessions: zod_1.z.array(exports.MemorizationSessionSyncItemSchema).default([])
});
exports.SyncPullSchema = zod_1.z.object({
    user_id: zod_1.z.string().min(1).optional(),
    last_synced_at: zod_1.z.string().optional()
});
