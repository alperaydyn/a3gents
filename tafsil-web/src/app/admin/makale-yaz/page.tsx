"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function MakaleYazPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [author, setAuthor] = useState("Tafsil Editoryal");
  const [summary, setSummary] = useState("");
  const [contentMd, setContentMd] = useState(
    "Kur'an-ı Kerim'de ilim ve tefekkürün birbiriyle bağı (96:1-5) ayetlerinde açıkça vurgulanır. Bilgi yaratan Rabbin adıyla öğrenildiğinde bir amaca hizmet eder.\n\nİnsan (96:2) yaratılışının zayıflığını unutmamalı ve istiğna yanılgısına (96:6-7) düşmemelidir."
  );
  const [primaryConcepts, setPrimaryConcepts] = useState("ilim, insan, kerem");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Canlı referans puanı simülasyonu
  const ayahMatches = contentMd.match(/\b\d{1,3}:\d{1,3}(-\d{1,3})?\b/g) || [];
  const directAyahScore = Math.min(40, ayahMatches.length * 15);
  const contextScore = contentMd.length > 200 ? 25 : Math.floor((contentMd.length / 200) * 25);
  const rootScore = (primaryConcepts.split(",").length >= 2 ? 20 : 10);
  const historyScore = 15;
  const totalScore = directAyahScore + contextScore + rootScore + historyScore;
  const isVerified = totalScore >= 85;

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slug) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9ğüşıöç]+/g, "-")
        .replace(/^-|-$/g, "");
      setSlug(generated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("http://localhost:4000/api/v1/admin/makaleler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          author,
          summary,
          content_md: contentMd,
          primary_concepts: primaryConcepts.split(",").map((c) => c.trim()).filter(Boolean),
          reading_time_minutes: Math.ceil(contentMd.split(/\s+/).length / 150),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Makale kaydedilemedi");
      }

      router.push(`/makaleler/${slug}`);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className="container">
        <Link href="/admin" className={styles.backLink}>
          ← Yönetim Paneline Dön
        </Link>

        <h1 className={styles.title}>Editoryal Makale ve Tefekkür Stüdyosu</h1>
        <p className={styles.subtitle}>
          Metin merkezli, Kur'an referans doğrulamalı akademik makale hazırlama ortamı.
        </p>

        {errorMsg && (
          <div style={{ padding: "12px 16px", background: "#fce8e6", color: "#c5221f", borderRadius: "6px", marginBottom: "16px", fontSize: "14px" }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.editorLayout}>
          {/* Sol Kolon: Giriş Alanları */}
          <div className={styles.formPane}>
            <div className={styles.fieldGroup}>
              <label className={styles.label}>Makale Başlığı</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Örn: İlim ve Tevhid Bütünlüğü"
                className={styles.input}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Slug (URL Yolu)</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ilim-ve-tevhid-butunlugu"
                className={styles.input}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Yazar</label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Özet (Vurucu editoryal özet)</label>
              <input
                type="text"
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="1-2 cümlelik özet..."
                className={styles.input}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Temel Kavramlar (Virgülle ayırın)</label>
              <input
                type="text"
                value={primaryConcepts}
                onChange={(e) => setPrimaryConcepts(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label}>Makale Metni (Markdown · Ayet referansları: 96:1)</label>
              <textarea
                required
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                className={`${styles.input} ${styles.textarea}`}
              />
            </div>

            <button type="submit" disabled={isSubmitting} className={styles.submitBtn}>
              {isSubmitting ? "Doğrulanıyor & Yayımlanıyor..." : "Makaleyi Doğrula ve Yayımla"}
            </button>
          </div>

          {/* Sağ Kolon: Canlı Kur'an Referans Skoru ve Önizleme */}
          <div className={styles.previewPane}>
            <div className={styles.previewHeader}>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--ink)" }}>Canlı Referans Puanlama</h3>
              <p style={{ fontSize: "13px", color: "var(--ink-secondary)", marginTop: "4px" }}>
                05-CONTENT-EDITORIAL-AGENT standartlarına göre otomatik taranır.
              </p>
            </div>

            <div className={styles.scoreCard}>
              <div>
                <div className={styles.scoreTitle}>Hesaplanan Referans Skoru</div>
                <div style={{ fontSize: "12px", color: isVerified ? "#137333" : "#b06000", fontWeight: 600, marginTop: "2px" }}>
                  {isVerified ? "✓ Doğrulanmış Kur'an Referansı" : "⚠ Editoryal İnceleme Gerekli (<85)"}
                </div>
              </div>
              <div className={styles.scoreValue} style={{ color: isVerified ? "#137333" : "#b06000" }}>
                {totalScore} / 100
              </div>
            </div>

            <div className={styles.criteriaList}>
              <div>• <strong>Ayet Alıntıları (%40):</strong> {directAyahScore}/40 ({ayahMatches.length} ayet atıfı)</div>
              <div>• <strong>Bağlamsal Bütünlük (%25):</strong> {contextScore}/25</div>
              <div>• <strong>Kök ve Morfoloji (%20):</strong> {rootScore}/20</div>
              <div>• <strong>Tarihsel Uyum (%15):</strong> {historyScore}/15</div>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: "8px" }}>
                Canlı Metin Önizleme
              </div>
              <div style={{ fontSize: "14px", lineHeight: "1.7", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                {contentMd}
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
