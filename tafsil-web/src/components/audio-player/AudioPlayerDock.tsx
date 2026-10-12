"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./AudioPlayerDock.module.css";
import type { Reciter, SurahAudioPlaylist } from "@/lib/types";

interface AudioPlayerDockProps {
  sureId: number;
  sureAdi: string;
  currentAyahNo: number;
  totalAyah: number;
  playlist: SurahAudioPlaylist | null;
  reciters: Reciter[];
  selectedReciterId: string;
  onReciterChange: (reciterId: string) => void;
  onVerseChange: (ayahNo: number) => void;
  onWordActive: (ayahNo: number, wordNo: number | null) => void;
  onClose?: () => void;
}

export function AudioPlayerDock({
  sureId,
  sureAdi,
  currentAyahNo,
  totalAyah,
  playlist,
  reciters,
  selectedReciterId,
  onReciterChange,
  onVerseChange,
  onWordActive,
  onClose,
}: AudioPlayerDockProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Find the current verse audio info from playlist
  const currentVerseAudio = playlist?.verses?.find((v) => v.ayet_no === currentAyahNo);

  // Handle play/pause when audio source changes
  useEffect(() => {
    if (audioRef.current && currentVerseAudio?.ses_url) {
      audioRef.current.src = currentVerseAudio.ses_url;
      audioRef.current.playbackRate = playbackRate;
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  }, [currentAyahNo, currentVerseAudio?.ses_url, playbackRate]);

  // Track active word based on currentTime in milliseconds
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const currentMs = Math.round(audio.currentTime * 1000);
      setCurrentTime(audio.currentTime);

      if (currentVerseAudio?.words && currentVerseAudio.words.length > 0) {
        const activeWord = currentVerseAudio.words.find(
          (w) => currentMs >= w.start_ms && currentMs < w.end_ms
        );
        if (activeWord) {
          onWordActive(currentAyahNo, activeWord.kelime_no);
        } else {
          onWordActive(currentAyahNo, null);
        }
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      onWordActive(currentAyahNo, null);
      if (currentAyahNo < totalAyah) {
        onVerseChange(currentAyahNo + 1);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [currentAyahNo, currentVerseAudio, onWordActive, onVerseChange, totalAyah]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      onWordActive(currentAyahNo, null);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handlePrev = () => {
    if (currentAyahNo > 1) {
      onVerseChange(currentAyahNo - 1);
    }
  };

  const handleNext = () => {
    if (currentAyahNo < totalAyah) {
      onVerseChange(currentAyahNo + 1);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [0.75, 1.0, 1.25, 1.5];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <aside className={styles.dockContainer} role="region" aria-label="Sesli Tilavet Oynatıcısı">
      <audio ref={audioRef} preload="metadata" />

      {/* Top row: Surah/Ayah title, Reciter selector, Close button */}
      <div className={styles.topRow}>
        <div className={styles.verseInfo}>
          <span className={styles.surahBadge}>{sureAdi}</span>
          <span className={styles.verseTitle}>Ayet {currentAyahNo} / {totalAyah}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {reciters.length > 0 && (
            <select
              className={styles.reciterSelect}
              value={selectedReciterId}
              onChange={(e) => onReciterChange(e.target.value)}
              aria-label="Kâri Seçimi"
            >
              {reciters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.language.toUpperCase()})
                </option>
              ))}
            </select>
          )}

          {onClose && (
            <button
              className={styles.closeButton}
              onClick={onClose}
              title="Oynatıcıyı Kapat"
              aria-label="Kapat"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className={styles.controlsRow}>
        <div className={styles.mainControls}>
          <button
            className={styles.navButton}
            onClick={handlePrev}
            disabled={currentAyahNo <= 1}
            title="Önceki Ayet"
            aria-label="Önceki Ayet"
          >
            ⏮
          </button>

          <button
            className={styles.playPauseButton}
            onClick={togglePlay}
            title={isPlaying ? "Duraklat" : "Dinle"}
            aria-label={isPlaying ? "Duraklat" : "Dinle"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button
            className={styles.navButton}
            onClick={handleNext}
            disabled={currentAyahNo >= totalAyah}
            title="Sonraki Ayet"
            aria-label="Sonraki Ayet"
          >
            ⏭
          </button>
        </div>

        <div className={styles.progressSection}>
          <span className={styles.timeText}>{formatTime(currentTime)}</span>
          <input
            type="range"
            className={styles.progressBar}
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            aria-label="İlerleme Çubuğu"
          />
          <span className={styles.timeText}>{formatTime(duration)}</span>
        </div>

        <button
          className={styles.speedButton}
          onClick={cyclePlaybackRate}
          title="Oynatma Hızı"
        >
          {playbackRate}x
        </button>
      </div>
    </aside>
  );
}
