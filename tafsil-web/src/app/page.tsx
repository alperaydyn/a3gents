import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Kur'an'ı kendi iç bağlamından anlayın",
};

const MODES = [
  {
    title: "Keşif",
    desc: "Metni sade ve akıcı oku. Tartışmalı yerlerde arka planı sen sormadan kenarda anlatır.",
  },
  {
    title: "Öğrenme",
    desc: "Adım adım ilerle. Okunuşu, meali ve kavramları yan yana gör, düzenini kaybetme.",
  },
  {
    title: "Odak",
    desc: "Kesintisiz oku ya da dinle. Arapça metin ortada kalır, hiçbir şey akışını bölmez.",
  },
];

const FEATURES = [
  {
    title: "Kavram ağı (DAG)",
    desc: "Kavramlar arası semantik bağlantıları yönlü çevrimsiz bir grafla keşfet — eş anlam, zıt anlam, sebep-sonuç.",
  },
  {
    title: "Morfolojik kök motoru",
    desc: "Her kelimeyi üçlü/dörtlü kök, lemma ve vezin seviyesinde ilişkilendiren deterministik altyapı.",
  },
  {
    title: "Ezber stüdyosu",
    desc: "SM-2 tekrar algoritması ve sesli okurken beliren kelimelerle (reveal-on-recite) etkileşimli ezber.",
  },
  {
    title: "Kelime senkron okuma",
    desc: "Orijinal tilavet ve Türkçe meal seslendirmesi üzerinde karaoke tarzı kelime vurgulama.",
  },
  {
    title: "Anlama çalışmaları",
    desc: "Bir soru yaz; ilgili kavramları, sureleri ve ayetleri bir araya getiren okuma rotası hazırlanır.",
  },
  {
    title: "Çevrimdışı okuma",
    desc: "Temel okuma, mealler ve ezber stüdyosu tamamen çevrimdışı çalışır.",
  },
];

export default function HomePage() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <p className="eyebrow">tafsil</p>
          <h1 className={styles.headline}>
            Kur&apos;an&apos;a hangi
            <br />
            niyetle geliyorsun?
          </h1>
          <p className={styles.sub}>
            Kavramları Kur&apos;an&apos;ın kendi iç bağlamından, ayetler arası semantik
            bağlantılardan ve Arapça morfolojik kök matematiğinden yola çıkarak
            anlamlandıran bir okuma deneyimi.
          </p>
          <div className={styles.ctaRow} id="uygulama">
            <a className={styles.badge} href="#" aria-disabled>
              App Store — yakında
            </a>
            <a className={styles.badge} href="#" aria-disabled>
              Google Play — yakında
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section} id="nasil-calisir">
        <div className="container">
          <p className="eyebrow">Üç arayüz modu</p>
          <h2 className={styles.sectionTitle}>Nasıl okuduğuna göre şekillenir</h2>
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
          <p className="eyebrow">Temel özellikler</p>
          <h2 className={styles.sectionTitle}>Yüzeyde akıcı, derinde yapılandırılmış</h2>
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

      <section className={styles.sampleSection}>
        <div className={`container ${styles.sampleInner}`}>
          <p className="eyebrow">Örnek</p>
          <p className={`arabic ${styles.sampleArabic}`}>
            ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِى خَلَقَ
          </p>
          <p className={styles.sampleMeal}>&ldquo;Yaratan Rabbinin adıyla oku!&rdquo;</p>
          <Link href="/ayet/96/1" className={styles.sampleLink}>
            Alak 96:1 sayfasını gör →
          </Link>
        </div>
      </section>
    </main>
  );
}
