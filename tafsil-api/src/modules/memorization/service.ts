import { query } from "../../db/client.js";
import type { EzberSessionDto, CreateSessionInput } from "./dto.js";

export interface EzberOturumuRow {
  id: string;
  kullanici_id: string;
  sure_id: number;
  baslangic_ayet: number;
  bitis_ayet: number;
  durum: "ogreniliyor" | "kor_okuma" | "tekrar_bekliyor" | "pekistirildi";
  repetition_number: number;
  interval_days: number;
  ease_factor: string | number;
  next_review_at: string;
  created_at: string;
  sure_adi_tr?: string;
}

export interface SM2Result {
  repetitionNumber: number;
  intervalDays: number;
  easeFactor: number;
  durum: "ogreniliyor" | "kor_okuma" | "tekrar_bekliyor" | "pekistirildi";
  nextReviewAt: Date;
}

/**
 * SM-2 Aralıklı Tekrar Algoritması (SuperMemo-2)
 *
 * EF' = max(1.30, EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
 * q < 3 -> repetition = 0, interval = 1
 * q >= 3 -> repetition++, interval: rep 1 -> 1 gün, rep 2 -> 6 gün, rep > 2 -> interval * EF'
 */
export function calculateSM2(
  currentRepetition: number,
  currentInterval: number,
  currentEaseFactor: number,
  quality: number,
  now: Date = new Date(),
): SM2Result {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const newEf = Math.max(1.3, Number((currentEaseFactor + efDelta).toFixed(2)));

  let newRepetition = currentRepetition;
  let newInterval = currentInterval;
  let newDurum: "ogreniliyor" | "kor_okuma" | "tekrar_bekliyor" | "pekistirildi";

  if (q < 3) {
    newRepetition = 0;
    newInterval = 1;
    newDurum = "ogreniliyor";
  } else {
    if (newRepetition === 0) {
      newInterval = 1;
      newDurum = "kor_okuma";
    } else if (newRepetition === 1) {
      newInterval = 6;
      newDurum = "tekrar_bekliyor";
    } else {
      newInterval = Math.max(1, Math.round(currentInterval * newEf));
      newDurum = newRepetition >= 3 ? "pekistirildi" : "tekrar_bekliyor";
    }
    newRepetition += 1;
  }

  const nextReviewAt = new Date(now.getTime() + newInterval * 24 * 60 * 60 * 1000);

  return {
    repetitionNumber: newRepetition,
    intervalDays: newInterval,
    easeFactor: newEf,
    durum: newDurum,
    nextReviewAt,
  };
}

function rowToDto(row: EzberOturumuRow): EzberSessionDto {
  return {
    id: row.id,
    kullaniciId: row.kullanici_id,
    sureId: row.sure_id,
    sureAdiTr: row.sure_adi_tr,
    baslangicAyet: row.baslangic_ayet,
    bitisAyet: row.bitis_ayet,
    durum: row.durum,
    repetitionNumber: row.repetition_number,
    intervalDays: row.interval_days,
    easeFactor: typeof row.ease_factor === "string" ? parseFloat(row.ease_factor) : row.ease_factor,
    nextReviewAt: new Date(row.next_review_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getUserSessions(kullaniciId: string): Promise<EzberSessionDto[]> {
  const res = await query<EzberOturumuRow>(
    `SELECT e.*, s.ad_tr as sure_adi_tr
     FROM ezber_oturumlari e
     LEFT JOIN sureler s ON s.id = e.sure_id
     WHERE e.kullanici_id = $1
     ORDER BY e.next_review_at ASC, e.created_at DESC`,
    [kullaniciId],
  );
  return res.rows.map(rowToDto);
}

export async function getDueSessions(kullaniciId: string): Promise<EzberSessionDto[]> {
  const res = await query<EzberOturumuRow>(
    `SELECT e.*, s.ad_tr as sure_adi_tr
     FROM ezber_oturumlari e
     LEFT JOIN sureler s ON s.id = e.sure_id
     WHERE e.kullanici_id = $1 AND e.next_review_at <= NOW()
     ORDER BY e.next_review_at ASC`,
    [kullaniciId],
  );
  return res.rows.map(rowToDto);
}

export async function createSession(
  kullaniciId: string,
  input: CreateSessionInput,
): Promise<EzberSessionDto> {
  const res = await query<EzberOturumuRow>(
    `INSERT INTO ezber_oturumlari (
       kullanici_id, sure_id, baslangic_ayet, bitis_ayet, durum, repetition_number, interval_days, ease_factor, next_review_at
     ) VALUES (
       $1, $2, $3, $4, 'ogreniliyor', 0, 1, 2.50, NOW()
     )
     RETURNING *`,
    [kullaniciId, input.sureId, input.baslangicAyet, input.bitisAyet],
  );

  const row = res.rows[0];
  const sureRes = await query<{ ad_tr: string }>(`SELECT ad_tr FROM sureler WHERE id = $1`, [input.sureId]);
  if (sureRes.rows[0]) {
    row.sure_adi_tr = sureRes.rows[0].ad_tr;
  }

  return rowToDto(row);
}

export async function evaluateSession(
  kullaniciId: string,
  sessionId: string,
  quality: number,
): Promise<EzberSessionDto | null> {
  const existing = await query<EzberOturumuRow>(
    `SELECT e.*, s.ad_tr as sure_adi_tr
     FROM ezber_oturumlari e
     LEFT JOIN sureler s ON s.id = e.sure_id
     WHERE e.id = $1 AND e.kullanici_id = $2`,
    [sessionId, kullaniciId],
  );
  if (!existing.rows[0]) return null;

  const row = existing.rows[0];
  const currentEf = typeof row.ease_factor === "string" ? parseFloat(row.ease_factor) : row.ease_factor;

  const sm2 = calculateSM2(row.repetition_number, row.interval_days, currentEf, quality);

  const updated = await query<EzberOturumuRow>(
    `UPDATE ezber_oturumlari
     SET repetition_number = $1,
         interval_days = $2,
         ease_factor = $3,
         durum = $4,
         next_review_at = $5
     WHERE id = $6
     RETURNING *`,
    [sm2.repetitionNumber, sm2.intervalDays, sm2.easeFactor, sm2.durum, sm2.nextReviewAt.toISOString(), sessionId],
  );

  const updatedRow = updated.rows[0];
  updatedRow.sure_adi_tr = row.sure_adi_tr;
  return rowToDto(updatedRow);
}
