import { randomBytes } from "crypto";
import { getPool, query } from "../../db/client.js";
import type { DiagnosticReportInput } from "./dto.js";

/** Okunması kolay, karışmayan karakterler (0/O, 1/I yok) */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateShortCode(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `TD-${out}`;
}

function clampInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
}

/**
 * İstemci tanılama raporlarını kalıcılaştırır (PBI-10.3).
 * Kimlik yalnızca doğrulanmış JWT'den gelir; gövdedeki `auth.user_id` asla güvenilmez ve saklanmaz.
 */
export class DiagnosticsService {
  async createReport(input: DiagnosticReportInput, userId: string | null): Promise<{ id: string; code: string; events: number }> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");

      const storage = (input.storage ?? {}) as any;
      const connectivity = (input.connectivity ?? {}) as any;
      const lastSync = input.last_sync ?? null;
      const serverStatus = (input.server_status ?? null) as any;
      const auth = { ...(input.auth ?? {}) } as Record<string, unknown>;
      delete auth.user_id; // istemci beyanı — JWT dışı kimlik saklanmaz

      const kvBytes = clampInt(storage?.l2?.physicalBytes) ?? clampInt(storage?.l2?.logicalBytes);

      let reportId = "";
      let code = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        code = generateShortCode();
        try {
          const res = await client.query<{ id: string }>(
            `INSERT INTO istemci_tanilama_raporlari (
               kisa_kod, kullanici_id, kurulum_id, rapor_surumu,
               platform, os_surumu, cihaz, uygulama_surumu, build_no, calisma_modu, api_adresi,
               baglanti_durumu, ag_tipi, api_gecikme_ms,
               son_senkron_basarili, son_senkron_zamani, oturum_suresi_doldu,
               toplam_yerel_bayt, kv_bayt, sqlite_bayt, ses_bayt,
               yerel_okuma_sayisi, sunucu_okuma_sayisi,
               kullanici_notu, katman_sayaclari, depolama_envanteri, baglanti, son_senkron, sunucu_durumu,
               olay_sayisi
             ) VALUES (
               $1, $2, $3, $4,
               $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14,
               $15, $16, $17,
               $18, $19, $20, $21,
               $22, $23,
               $24, $25, $26, $27, $28, $29,
               $30
             )
             RETURNING id`,
            [
              code,
              userId,
              input.install_id ?? null,
              input.report_version,
              input.app?.platform ?? null,
              input.app?.os_version ?? null,
              input.app?.device ?? null,
              input.app?.version ?? null,
              input.app?.build ?? null,
              input.app?.runtime ?? null,
              input.app?.api_base ?? null,
              connectivity?.status ?? null,
              connectivity?.networkType ?? null,
              clampInt(connectivity?.api?.latencyMs),
              lastSync ? lastSync.ok : null,
              lastSync ? new Date(lastSync.at) : null,
              Boolean(auth.session_expired),
              clampInt(storage?.totalBytes),
              kvBytes,
              clampInt(storage?.l3?.totalBytes),
              clampInt(storage?.l5?.totalBytes),
              clampInt(storage?.userData?.readingHistory),
              clampInt(serverStatus?.readingHistory),
              input.user_note ?? null,
              JSON.stringify(input.layer_counters ?? {}),
              JSON.stringify(storage),
              JSON.stringify({ ...connectivity, auth }),
              lastSync ? JSON.stringify(lastSync) : null,
              serverStatus ? JSON.stringify(serverStatus) : null,
              input.events.length,
            ]
          );
          reportId = res.rows[0].id;
          break;
        } catch (err: any) {
          // 23505 = unique_violation (kısa kod çakışması) → yeni kodla tekrar dene
          if (err?.code !== "23505" || attempt === 3) throw err;
        }
      }

      // Olayları tek sorguda toplu ekle (unnest) — 600 satıra kadar tek round-trip
      if (input.events.length > 0) {
        const ev = input.events;
        await client.query(
          `INSERT INTO istemci_veri_hareketleri
             (rapor_id, kullanici_id, olay_zamani, katman, islem, anahtar, durum, bayt, sure_ms, tekrar, detay)
           SELECT $1, $2, to_timestamp(t.ts / 1000.0), t.katman, t.islem, t.anahtar, t.durum, t.bayt, t.sure_ms, t.tekrar, t.detay
           FROM unnest(
             $3::bigint[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::int[], $10::int[], $11::text[]
           ) AS t(ts, katman, islem, anahtar, durum, bayt, sure_ms, tekrar, detay)`,
          [
            reportId,
            userId,
            ev.map((e) => e.ts),
            ev.map((e) => e.layer),
            ev.map((e) => e.op),
            ev.map((e) => e.key.slice(0, 200)),
            ev.map((e) => e.status),
            ev.map((e) => (e.bytes !== undefined ? Math.min(e.bytes, 2_147_483_647) : null)),
            ev.map((e) => (e.durationMs !== undefined ? Math.min(e.durationMs, 2_147_483_647) : null)),
            ev.map((e) => e.count),
            ev.map((e) => (e.detail ? e.detail.slice(0, 300) : null)),
          ]
        );
      }

      await client.query("COMMIT");
      return { id: reportId, code, events: input.events.length };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Kullanıcının kendi raporları (en yeni 20). */
  async listUserReports(userId: string) {
    const res = await query(
      `SELECT id, kisa_kod, created_at, baglanti_durumu, uygulama_surumu, build_no,
              toplam_yerel_bayt, olay_sayisi, durum
         FROM istemci_tanilama_raporlari
        WHERE kullanici_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [userId]
    );
    return res.rows;
  }

  /** Yönetici: son raporlar + katman bazlı hata özeti. */
  async listRecentReports(limit = 50) {
    const res = await query(
      `SELECT r.id, r.kisa_kod, r.created_at, r.kullanici_id, r.platform, r.uygulama_surumu, r.build_no,
              r.baglanti_durumu, r.son_senkron_basarili, r.toplam_yerel_bayt, r.olay_sayisi, r.durum,
              r.yerel_okuma_sayisi, r.sunucu_okuma_sayisi,
              COALESCE((SELECT COUNT(*)::int FROM istemci_veri_hareketleri h
                         WHERE h.rapor_id = r.id AND h.durum = 'error'), 0) AS hata_sayisi
         FROM istemci_tanilama_raporlari r
        ORDER BY r.created_at DESC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return res.rows;
  }

  /** Yönetici: kısa kodla tam rapor + olay akışı + katman özeti. */
  async getReportByCode(code: string) {
    const reportRes = await query(`SELECT * FROM istemci_tanilama_raporlari WHERE kisa_kod = $1`, [code.toUpperCase()]);
    const report = reportRes.rows[0];
    if (!report) return null;

    const [eventsRes, summaryRes] = await Promise.all([
      query(
        `SELECT olay_zamani, katman, islem, anahtar, durum, bayt, sure_ms, tekrar, detay
           FROM istemci_veri_hareketleri
          WHERE rapor_id = $1
          ORDER BY olay_zamani ASC, id ASC`,
        [report.id]
      ),
      query(
        `SELECT katman,
                SUM(tekrar)::int AS olay,
                SUM(CASE WHEN durum = 'error' THEN tekrar ELSE 0 END)::int AS hata,
                SUM(CASE WHEN islem IN ('miss','fallback') THEN tekrar ELSE 0 END)::int AS iska,
                ROUND(AVG(sure_ms))::int AS ort_sure_ms
           FROM istemci_veri_hareketleri
          WHERE rapor_id = $1
          GROUP BY katman
          ORDER BY katman`,
        [report.id]
      ),
    ]);

    return { report, layer_summary: summaryRes.rows, events: eventsRes.rows };
  }

  async updateStatus(code: string, durum: "yeni" | "inceleniyor" | "cozuldu") {
    const res = await query(
      `UPDATE istemci_tanilama_raporlari SET durum = $2 WHERE kisa_kod = $1 RETURNING kisa_kod, durum`,
      [code.toUpperCase(), durum]
    );
    return res.rows[0] ?? null;
  }
}
