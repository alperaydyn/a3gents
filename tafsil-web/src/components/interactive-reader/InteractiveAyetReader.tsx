"use client";

import React, { useState, useEffect } from "react";
import styles from "./InteractiveAyetReader.module.css";
import { AudioPlayerDock } from "../audio-player/AudioPlayerDock";
import { fetchReciters, fetchSurahAudioPlaylist } from "@/lib/api";
import { OfflineSyncManager } from "@/lib/sync";
import type { Reciter, SurahAudioPlaylist } from "@/lib/types";

interface InteractiveAyetReaderProps {
  sureId: number;
  sureNameTr: string;
  ayetNo: number;
  verseCount: number;
  metinAr: string;
  transliterasyon: string;
  mealTr: string;
}

export function InteractiveAyetReader({
  sureId,
  sureNameTr,
  ayetNo,
  verseCount,
  metinAr,
  transliterasyon,
  mealTr,
}: InteractiveAyetReaderProps) {
  const [isAudioOpen, setIsAudioOpen] = useState(false);
  const [currentAyah, setCurrentAyah] = useState(ayetNo);
  const [activeWordNo, setActiveWordNo] = useState<number | null>(null);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [selectedReciterId, setSelectedReciterId] = useState("mishary_alafasy");
  const [playlist, setPlaylist] = useState<SurahAudioPlaylist | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Check bookmark status on mount
  useEffect(() => {
    setIsBookmarked(OfflineSyncManager.isBookmarked(sureId, currentAyah));
    OfflineSyncManager.recordReadingProgress(sureId, currentAyah);
  }, [sureId, currentAyah]);

  // Load reciters and surah audio playlist
  useEffect(() => {
    let mounted = true;
    fetchReciters().then((list) => {
      if (mounted && list.length > 0) setReciters(list);
    });
    fetchSurahAudioPlaylist(sureId, selectedReciterId).then((pl) => {
      if (mounted && pl) setPlaylist(pl);
    });
    return () => {
      mounted = false;
    };
  }, [sureId, selectedReciterId]);

  const toggleBookmark = () => {
    if (isBookmarked) {
      OfflineSyncManager.removeBookmark(sureId, currentAyah);
      setIsBookmarked(false);
    } else {
      OfflineSyncManager.addBookmark(sureId, currentAyah, "Tefekkür");
      setIsBookmarked(true);
    }
  };

  const handleWordActive = (ayahNo: number, wordNo: number | null) => {
    if (ayahNo === currentAyah) {
      setActiveWordNo(wordNo);
    }
  };

  // Split arabic words
  const rawWords = metinAr.split(/\s+/).filter(Boolean);

  return (
    <div className={styles.readerContainer}>
      <div className={styles.actionRow}>
        <div className={styles.actionButtons}>
          <button
            className={`${styles.actionButton} ${isAudioOpen ? styles.actionButtonActive : ""}`}
            onClick={() => setIsAudioOpen(!isAudioOpen)}
            title="Kelime Senkron Ses Çalar"
          >
            <span>{isAudioOpen ? "🔊 Çalıyor" : "🎧 Dinle"}</span>
          </button>

          <button
            className={`${styles.actionButton} ${isBookmarked ? styles.actionButtonActive : ""}`}
            onClick={toggleBookmark}
            title={isBookmarked ? "Yer İmini Kaldır" : "Yer İmlerine Ekle"}
          >
            <span>{isBookmarked ? "★ Kaydedildi" : "☆ Yer İmi"}</span>
          </button>
        </div>

        <span className={styles.syncBadge} title="Çevrimdışı senkronize">
          <span className={styles.syncDot} />
          Çevrimdışı hazır
        </span>
      </div>

      <article className={styles.card}>
        <p className="eyebrow">
          {sureNameTr} suresi · {sureId}:{currentAyah} / {verseCount}
        </p>

        {/* Word chips with real-time audio sync highlighting */}
        <div className={styles.wordsContainer}>
          {rawWords.map((word, idx) => {
            const wordNo = idx + 1;
            const isActive = activeWordNo === wordNo;
            return (
              <span
                key={idx}
                className={`${styles.wordChip} ${isActive ? styles.wordChipActive : ""}`}
                data-word-no={wordNo}
              >
                {word}
              </span>
            );
          })}
        </div>

        <p className={styles.translit}>{transliterasyon}</p>
        <p className={styles.meal}>{mealTr}</p>
      </article>

      {/* Floating Audio Player Dock */}
      {isAudioOpen && (
        <AudioPlayerDock
          sureId={sureId}
          sureAdi={sureNameTr}
          currentAyahNo={currentAyah}
          totalAyah={verseCount}
          playlist={playlist}
          reciters={reciters}
          selectedReciterId={selectedReciterId}
          onReciterChange={setSelectedReciterId}
          onVerseChange={(newAyah) => {
            setCurrentAyah(newAyah);
            setActiveWordNo(null);
          }}
          onWordActive={handleWordActive}
          onClose={() => {
            setIsAudioOpen(false);
            setActiveWordNo(null);
          }}
        />
      )}
    </div>
  );
}
