import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

const CONTACT_EMAIL = "merhaba@tafsil.net";

export const metadata: Metadata = {
  title: "Destek ve İletişim",
  description:
    "tafsil uygulaması ve web platformu hakkında yardım, sıkça sorulan sorular, hata bildirimleri ve iletişim bilgileri.",
  alternates: { canonical: "/destek" },
  openGraph: {
    title: "Destek ve İletişim · tafsil",
    description: "tafsil ile ilgili sorularınız, geri bildirimleriniz ve yardım kanalları.",
  },
};

const FAQ_ITEMS = [
  {
    q: "tafsil uygulaması ücretli mi? Reklam içerir mi?",
    a: "Hayır. tafsil, Kur'an-ı Kerim'i kendi iç bağlamında ve kavram örgüsüyle anlamak isteyenler için tamamen reklamsız ve temel özellikleri ücretsiz bir projedir. Ticari bir hedef gözetmez.",
  },
  {
    q: "Hangi mealler ve kaynaklar kullanılıyor?",
    a: "Arapça orijinal metin için Tanzil.net Mushaf standartları, morfolojik analiz için Quranic Arabic Corpus ve güvenilir mealler (başta Diyanet İşleri Başkanlığı olmak üzere karşılaştırmalı mealler) esas alınmaktadır.",
  },
  {
    q: "Okuma ve ezber ilerlemem cihazlar arasında nasıl eşitlenir?",
    a: "Apple ile Giriş yaptığınızda okuma geçmişiniz, yer imleriniz ve ezber ilerlemeniz sunucularımız üzerinden uçtan uca güvenli bir şekilde diğer cihazlarınızla eşitlenir. Misafir modundaki verileriniz ise hesap bağladığınız anda yeni hesabınıza aktarılır.",
  },
  {
    q: "Ezber Stüdyosu ses kayıtlarımı saklıyor mu?",
    a: "Kesinlikle hayır. Ezber Stüdyosu'nda tilavetiniz esnasında çalışan ses algılama (reveal-on-recite) tamamen cihazınızın yerel işlemcisi üzerinde gerçekleşir. Sesiniz hiçbir şekilde sunucularımıza yüklenmez veya kaydedilmez.",
  },
  {
    q: "Bir hata veya eksiklik fark ettim, nasıl bildirebilirim?",
    a: "Ayet metni, meal, kelime kökü eşleşmesi veya teknik bir aksaklık fark ederseniz lütfen ilgili sure/ayet numarasını ve detayları belirterek merhaba@tafsil.net adresine e-posta gönderiniz. Editoryal ekibimiz en kısa sürede inceleyecektir.",
  },
  {
    q: "Hesabımı ve tüm verilerimi nasıl silebilirim?",
    a: "Hesabınızı ve sunucularımızda saklanan tüm senkronizasyon verilerinizi kalıcı olarak silmek için mobil uygulama içindeki 'Profil / Ayarlar' sekmesinden 'Hesabımı Sil' butonunu kullanabilirsiniz. Dilerseniz kayıtlı e-posta adresinizden merhaba@tafsil.net adresine silme talebi iletebilirsiniz; talebiniz en geç 48 saat içinde işleme alınarak tüm kayıtlarınız geri dönülemez biçimde imha edilir.",
  },
];

export default function DestekPage() {
  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>Yardım & İletişim</span>
          <h1 className={styles.title}>Destek ve İletişim</h1>
          <p className={styles.subtitle}>
            Sorularınız, geri bildirimleriniz veya hesap işlemleriniz için doğrudan ekibimize ulaşabilir,
            sıkça sorulan soruları inceleyebilirsiniz.
          </p>
        </header>

        <div className={styles.contactCard}>
          <div className={styles.contactInfo}>
            <h3>Doğrudan İletişim</h3>
            <p>Destek talepleriniz için e-posta yoluyla 24 saat içinde dönüş sağlıyoruz.</p>
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=tafsil%20Destek%20Talebi`}
            className={styles.contactAction}
          >
            ✉️ {CONTACT_EMAIL}
          </a>
        </div>

        <article className={styles.body}>
          <h2 className={styles.sectionTitle}>Sıkça Sorulan Sorular</h2>
          {FAQ_ITEMS.map((item, idx) => (
            <div key={idx} className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>{item.q}</h3>
              <p className={styles.faqAnswer}>{item.a}</p>
            </div>
          ))}
        </article>

        <div className={styles.back}>
          <Link href="/">← Ana Sayfaya Dön</Link>
          <Link href="/gizlilik">Gizlilik Politikası →</Link>
        </div>
      </div>
    </main>
  );
}
