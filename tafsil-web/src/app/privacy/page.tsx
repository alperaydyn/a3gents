import type { Metadata } from "next";
import Link from "next/link";
import styles from "../gizlilik/page.module.css";

const LAST_UPDATED = "October 4, 2026";
const CONTACT_EMAIL = "merhaba@tafsil.net";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy and Data Protection Notice for the Tafsil iOS/Android application and tafsil.net web platform.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy · tafsil",
    description: "How your personal data is handled and protected in tafsil.",
  },
};

export default function PrivacyPage() {
  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>Transparency & Privacy</span>
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.subtitle}>
            Tafsil processes only the minimal data required to support your journey of understanding the Qur&apos;an.
            No ads, no third-party tracking, and your data is never sold.
          </p>
          <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>
        </header>

        <article className={styles.body}>
          <section id="scope">
            <h2>1. Scope and Data Controller</h2>
            <p>
              This Privacy Policy applies to the Tafsil mobile application (iOS & Android) and the tafsil.net website.
              The data controller is tafsil.net. For any privacy-related inquiries, contact us at:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section id="data-collected">
            <h2>2. Information We Process</h2>
            <h3>Account Data</h3>
            <ul>
              <li>
                <strong>Sign in with Apple:</strong> A unique identifier provided by Apple and, if permitted by you, your name
                and email address. If you choose &quot;Hide My Email,&quot; we only receive Apple&apos;s private relay email.
              </li>
              <li>
                <strong>Guest Mode:</strong> A randomized local identifier without any name or email address.
              </li>
            </ul>

            <h3>Usage and Progress Data</h3>
            <ul>
              <li>Chapters (Surahs) and verses read, timestamps, and reading duration</li>
              <li>Bookmarks, highlights, and personal reflections</li>
              <li>Explored concepts and semantic root queries</li>
              <li>Memorization (Hifz) practice sessions and spaced repetition schedules</li>
            </ul>
            <p>
              This data is stored locally on your device first. If you sign in, it is securely synced across your devices
              via our cloud infrastructure.
            </p>

            <h3>Data We Do Not Collect</h3>
            <ul>
              <li>We never collect precise location, device contacts, photos, or biometric data.</li>
              <li>We do not use advertising identifiers (IDFA/GAID) or conduct cross-app tracking.</li>
              <li>
                <strong>Microphone & Voice Privacy:</strong> In the Memorization Studio, speech recognition (reveal-on-recite)
                runs strictly on-device. Your audio is never recorded, transmitted, or stored on our servers.
              </li>
            </ul>
          </section>

          <section id="purposes">
            <h2>3. Purpose and Legal Basis</h2>
            <ul>
              <li>Creating and managing your user account — <em>Contractual necessity</em></li>
              <li>Syncing reading progress, bookmarks, and memorization sets across devices — <em>Contractual necessity</em></li>
              <li>Maintaining service security, performance, and abuse prevention — <em>Legitimate interest</em></li>
              <li>Aggregated, fully anonymized metrics to improve app stability — <em>Legitimate interest</em></li>
            </ul>
          </section>

          <section id="third-parties">
            <h2>4. Service Providers and Infrastructure</h2>
            <p>We do not sell or rent personal information to advertisers. We rely only on trusted infrastructure partners:</p>
            <ul>
              <li><strong>Apple</strong> — Authentication (Sign in with Apple) and App Store distribution</li>
              <li><strong>Hostinger</strong> — Secure application and encrypted database hosting</li>
              <li><strong>Cloudflare</strong> — Content delivery (CDN) and recitation audio distribution (requests are not linked to your personal profile)</li>
            </ul>
          </section>

          <section id="retention">
            <h2>5. Data Retention and Security</h2>
            <p>
              We retain your account and progress data for as long as your account remains active. All data transmission
              is encrypted using TLS 1.3 / HTTPS. Access to databases is strictly restricted and monitored.
            </p>
          </section>

          <section id="deletion-rights">
            <h2>6. Your Rights and Account Deletion</h2>
            <p>
              You have the right to access, rectify, or completely delete your personal data at any time.
            </p>
            <p>
              <strong>To delete your account and all associated data:</strong>
            </p>
            <ul>
              <li>
                Use the in-app <strong>&quot;Delete Account&quot;</strong> button found in <em>Profile / Settings</em>.
              </li>
              <li>
                Alternatively, email us from your registered email address at{" "}
                <a href={`mailto:${CONTACT_EMAIL}?subject=Account%20Deletion%20Request`}>{CONTACT_EMAIL}</a> with the subject
                &quot;Account Deletion Request&quot;. Your account and all stored synchronization data will be permanently and irreversibly purged within 48 hours.
              </li>
            </ul>
            <p>
              If using Guest Mode, simply uninstalling the application removes all local data permanently.
            </p>
          </section>

          <section id="children">
            <h2>7. Children&apos;s Privacy</h2>
            <p>
              Tafsil is suitable for general audiences and does not knowingly collect personal information from children
              under 13 years of age.
            </p>
          </section>

          <section id="changes">
            <h2>8. Changes to this Policy</h2>
            <p>
              We may update this policy periodically. Any significant revisions will be announced within the app or on this
              page. The latest version will always be published here.
            </p>
          </section>

          <p className={styles.back}>
            <Link href="/en">← Back to English Homepage</Link>
            <span style={{ margin: "0 12px", opacity: 0.4 }}>|</span>
            <Link href="/gizlilik">Türkçe Versiyon</Link>
          </p>
        </article>
      </div>
    </main>
  );
}
