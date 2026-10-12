import type { Metadata } from "next";
import Link from "next/link";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Understand the Qur'an through its internal context",
  description:
    "An editorial, multi-layered digital platform deciphering Quranic concepts from within their own context, semantic graphs, and Arabic morphological roots.",
  alternates: { canonical: "/en" },
};

const MODES = [
  {
    title: "Discovery",
    desc: "Read fluidly with unobtrusive contextual depth. When you encounter complex themes, historical and conceptual context unfolds naturally beside the text.",
  },
  {
    title: "Learning",
    desc: "Structured, step-by-step contemplation. View transliteration, translation, and root concepts side-by-side without losing your rhythm.",
  },
  {
    title: "Focus",
    desc: "Pure, distraction-free recitation. The noble Arabic script takes center stage, accompanied by serene word-synchronized audio.",
  },
];

const FEATURES = [
  {
    title: "Concept Graph (DAG)",
    desc: "Explore inter-verse semantic connections with a directed acyclic graph—synonyms, polarities, and thematic progressions.",
  },
  {
    title: "Morphological Root Engine",
    desc: "Trace every Arabic word to its triliteral/quadriliteral root, lemma, and grammatical paradigm with mathematical precision.",
  },
  {
    title: "Memorization Studio",
    desc: "Strengthen retention using spaced repetition (SM-2) and voice-activated recitation tracking (reveal-on-recite).",
  },
  {
    title: "Word-Synchronized Recitation",
    desc: "Follow studio-quality audio with synchronized, karaoke-style word highlighting across Arabic and English translations.",
  },
  {
    title: "Thematic Study Sessions",
    desc: "Ask a question; discover a curated reading path connecting relevant concepts, chapters, and cross-referenced verses.",
  },
  {
    title: "Offline-First Reliability",
    desc: "Core reading, morphological lexicons, and memorization decks work seamlessly without an active internet connection.",
  },
];

export default function EnglishHomePage() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <p className="eyebrow">tafsil</p>
          <h1 className={styles.headline}>
            With what intention
            <br />
            do you approach the Qur&apos;an?
          </h1>
          <p className={styles.sub}>
            A contemplative reading experience interpreting Quranic concepts through their
            intrinsic linguistic context, semantic cross-references, and Arabic root morphology.
          </p>
          <div className={styles.ctaRow} id="download">
            <a className={styles.badge} href="#" aria-disabled>
              App Store — Coming Soon
            </a>
            <a className={styles.badge} href="#" aria-disabled>
              Google Play — Coming Soon
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section} id="how-it-works">
        <div className="container">
          <p className="eyebrow">Three Reading Modes</p>
          <h2 className={styles.sectionTitle}>Tailored to your contemplative mindset</h2>
          <div className={styles.modeGrid}>
            {MODES.map((m) => (
              <div key={m.title} className={styles.modeCard}>
                <h3 className={styles.modeTitle}>{m.title}</h3>
                <p className={styles.modeDesc}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <p className="eyebrow">Core Capabilities</p>
          <h2 className={styles.sectionTitle}>Fluid on the surface, rigorous in depth</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`container ${styles.footerLinksCard || ""}`}>
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <h3 style={{ fontSize: "20px", marginBottom: "12px" }}>Ready to explore?</h3>
            <p style={{ color: "var(--mut)", marginBottom: "20px" }}>
              Have questions or reviewing our application? Check our support and privacy pages.
            </p>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/privacy" className={styles.badge}>
                Privacy Policy
              </Link>
              <Link href="/support" className={styles.badge}>
                Support & Contact
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
