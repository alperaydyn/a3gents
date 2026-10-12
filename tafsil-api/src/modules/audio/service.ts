import { query } from "../../db/client.js";
import type { Reciter, SurahAudioPlaylist, VerseAudioItem, WordTimestamp } from "./dto.js";

const DEFAULT_RECITERS: Reciter[] = [
  {
    id: "mishary_alafasy",
    name: "Mishary Rashid Alafasy",
    language: "ar",
    description: "Hafs 'an 'Asim tilaveti, stüdyo kaydı ve hassas kelime zaman damgaları",
    has_word_timestamps: true
  },
  {
    id: "abdulbasit_murattal",
    name: "Abdulbasit Abdussamed (Murattal)",
    language: "ar",
    description: "Geleneksel Mısır tilavet ekolü, murattal usulü",
    has_word_timestamps: true
  },
  {
    id: "hamdi_yazir_tr",
    name: "Elmalılı Hamdi Yazır (Seslendirme)",
    language: "tr",
    description: "Türkçe tefsirli meal stüdyo seslendirmesi",
    has_word_timestamps: false
  }
];

export class AudioService {
  async listReciters(): Promise<Reciter[]> {
    const dbReciters = await query(
      "SELECT DISTINCT kari_id as id, kari_adi as name, dil as language FROM ses_kaynaklari"
    );

    if (dbReciters.rows.length === 0) {
      return DEFAULT_RECITERS;
    }

    const merged = new Map<string, Reciter>();
    DEFAULT_RECITERS.forEach((r: Reciter) => merged.set(r.id, r));
    dbReciters.rows.forEach((r: any) => {
      const existing = merged.get(r.id);
      merged.set(r.id, {
        id: r.id,
        name: r.name,
        language: r.language,
        description: existing?.description || "Seslendirme kaydı",
        has_word_timestamps: existing?.has_word_timestamps ?? true
      });
    });

    return Array.from(merged.values());
  }

  async getSurahAudioPlaylist(sureId: number, reciterId: string = "mishary_alafasy"): Promise<SurahAudioPlaylist> {
    const surahRes = await query("SELECT id, ad_tr, ayet_sayisi FROM sureler WHERE id = $1", [sureId]);
    if (surahRes.rows.length === 0) {
      throw new Error(`Sure #${sureId} bulunamadı`);
    }
    const sure = surahRes.rows[0];

    const reciters = await this.listReciters();
    const activeReciter = reciters.find((r: Reciter) => r.id === reciterId) || reciters[0];

    // Fetch audio tracks from ses_kaynaklari
    const audioRes = await query(
      `SELECT ayet_no, ses_url, format 
       FROM ses_kaynaklari 
       WHERE sure_id = $1 AND kari_id = $2 
       ORDER BY ayet_no ASC`,
      [sureId, activeReciter.id]
    );

    const audioMap = new Map<number, { ses_url: string; format: string }>();
    audioRes.rows.forEach((row: any) => {
      audioMap.set(row.ayet_no, { ses_url: row.ses_url, format: row.format });
    });

    // Fetch words and their timestamps for all verses in this surah
    const wordsRes = await query(
      `SELECT a.ayet_no, k.kelime_no, k.metin_ar, k.metin_tr, k.start_ms, k.end_ms
       FROM ayetler a
       JOIN kelimeler k ON k.ayet_id = a.id
       WHERE a.sure_id = $1
       ORDER BY a.ayet_no ASC, k.kelime_no ASC`,
      [sureId]
    );

    const wordsByAyah = new Map<number, WordTimestamp[]>();
    wordsRes.rows.forEach((w: any) => {
      if (!wordsByAyah.has(w.ayet_no)) {
        wordsByAyah.set(w.ayet_no, []);
      }
      wordsByAyah.get(w.ayet_no)!.push({
        kelime_no: w.kelime_no,
        metin_ar: w.metin_ar,
        metin_tr: w.metin_tr,
        start_ms: w.start_ms,
        end_ms: w.end_ms
      });
    });

    const verses: VerseAudioItem[] = [];
    const totalAyah = sure.ayet_sayisi;

    for (let ayetNo = 1; ayetNo <= totalAyah; ayetNo++) {
      const audioInfo = audioMap.get(ayetNo);
      // Fallback canonical audio url from Cloudflare R2 if not in DB
      const r2Base = process.env.AUDIO_BASE_URL || "https://pub-1e751d4548754d5eb3de46964f0f8d9d.r2.dev";
      const sesUrl = audioInfo?.ses_url || `${r2Base}/audio/${sureId}_${ayetNo}.mp3`;
      const format = audioInfo?.format || "audio/mp3";
      const words = wordsByAyah.get(ayetNo) || [];

      // Calculate max end_ms as duration estimate
      const maxEndMs = words.reduce((max: number, w: WordTimestamp) => Math.max(max, w.end_ms), 0);

      verses.push({
        ayet_no: ayetNo,
        ses_url: sesUrl,
        format,
        duration_ms: maxEndMs > 0 ? maxEndMs : undefined,
        words
      });
    }

    return {
      sure_id: sureId,
      sure_adi: sure.ad_tr,
      reciter: activeReciter,
      verses
    };
  }
}
