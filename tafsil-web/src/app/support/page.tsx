import type { Metadata } from "next";
import Link from "next/link";
import styles from "../destek/page.module.css";

const CONTACT_EMAIL = "merhaba@tafsil.net";

export const metadata: Metadata = {
  title: "Support & Contact",
  description:
    "Customer support, FAQ, feedback channels, and account deletion assistance for the Tafsil iOS app and tafsil.net.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Support & Contact · tafsil",
    description: "Get assistance, report issues, or inquire about tafsil.",
  },
};

const FAQ_ITEMS = [
  {
    q: "Is the Tafsil app free? Does it contain advertisements?",
    a: "Yes. Tafsil is completely ad-free and all core features—reading, root morphology, semantic graphs, audio recitation, and memorization studio—are free. Our mission is to facilitate sincere contemplation and understanding of the Qur'an without commercial noise.",
  },
  {
    q: "Which Quranic translations and scholarly sources are used?",
    a: "The Arabic text adheres to the Uthmani script standards curated by Tanzil.net. Morphological analysis is powered by the Quranic Arabic Corpus, paired with established authoritative translations and word-by-word glossaries.",
  },
  {
    q: "How does progress synchronization work across devices?",
    a: "When you authenticate with Sign in with Apple, your bookmarks, reading logs, and memorization intervals are encrypted and securely synchronized across your devices. Guest accounts can link their profile at any time without losing local data.",
  },
  {
    q: "Does the Memorization Studio store my voice recordings?",
    a: "Never. The voice-guided recitation tracking (reveal-on-recite) operates strictly on-device using local inference. No audio streams or microphone samples are ever recorded, uploaded, or transmitted to our servers.",
  },
  {
    q: "How can I report a bug or suggest a translation correction?",
    a: "If you encounter a software bug, a typo in a translation, or a morphological discrepancy, please contact us at merhaba@tafsil.net with the Surah and verse number. Our editorial team reviews every inquiry promptly.",
  },
  {
    q: "How can I permanently delete my account and data?",
    a: "In full compliance with Apple App Store guidelines and privacy regulations, you can delete your account at any time. Navigate to 'Profile / Settings' within the mobile app and select 'Delete Account'. Alternatively, email merhaba@tafsil.net from your registered account with the subject 'Account Deletion Request'. Your account and all associated cloud data will be irreversibly erased within 48 hours.",
  },
];

export default function SupportPage() {
  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>Help & Contact</span>
          <h1 className={styles.title}>Support & Inquiries</h1>
          <p className={styles.subtitle}>
            Have a question, feedback, or need assistance with your account?
            We are here to help you.
          </p>
        </header>

        <div className={styles.contactCard}>
          <div className={styles.contactInfo}>
            <h3>Direct Customer Support</h3>
            <p>Our dedicated support team typically responds to inquiries within 24 hours.</p>
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Tafsil%20Support%20Inquiry`}
            className={styles.contactAction}
          >
            ✉️ {CONTACT_EMAIL}
          </a>
        </div>

        <article className={styles.body}>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          {FAQ_ITEMS.map((item, idx) => (
            <div key={idx} className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>{item.q}</h3>
              <p className={styles.faqAnswer}>{item.a}</p>
            </div>
          ))}
        </article>

        <div className={styles.back}>
          <Link href="/en">← Back to English Homepage</Link>
          <span style={{ margin: "0 12px", opacity: 0.4 }}>|</span>
          <Link href="/privacy">Privacy Policy</Link>
          <span style={{ margin: "0 12px", opacity: 0.4 }}>|</span>
          <Link href="/destek">Türkçe Versiyon</Link>
        </div>
      </div>
    </main>
  );
}
