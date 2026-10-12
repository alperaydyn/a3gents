import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

const LAST_UPDATED = "3 Ekim 2026";
const CONTACT_EMAIL = "merhaba@tafsil.net";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description:
    "tafsil uygulaması ve tafsil.net'te hangi kişisel verilerin, hangi amaçla ve nasıl işlendiğine dair KVKK uyumlu gizlilik politikası ve aydınlatma metni.",
  alternates: { canonical: "/gizlilik" },
  openGraph: {
    title: "Gizlilik Politikası · tafsil",
    description: "tafsil'de kişisel verilerinizin nasıl işlendiği.",
  },
};

export default function GizlilikPage() {
  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.hero}>
          <span className={styles.badge}>Aydınlatma Metni</span>
          <h1 className={styles.title}>Gizlilik Politikası</h1>
          <p className={styles.subtitle}>
            tafsil, Kur&apos;an&apos;ı anlama yolculuğunuzu desteklemek için gereken en az veriyi işler. Reklam yoktur,
            takip yoktur, verileriniz satılmaz.
          </p>
          <p className={styles.updated}>Son güncelleme: {LAST_UPDATED}</p>
        </header>

        <article className={styles.body}>
          <section id="kapsam">
            <h2>1. Kapsam ve Veri Sorumlusu</h2>
            <p>
              Bu politika, tafsil iOS/Android uygulaması (&quot;Uygulama&quot;) ve tafsil.net web sitesi için geçerlidir. 6698
              sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) kapsamında veri sorumlusu tafsil.net&apos;tir.
              Sorularınız için: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section id="toplanan-veriler">
            <h2>2. İşlediğimiz Veriler</h2>
            <h3>Hesap verileri</h3>
            <ul>
              <li>
                <strong>Apple ile Giriş:</strong> Apple&apos;ın size özel ürettiği kullanıcı tanımlayıcısı ve (izin verirseniz)
                ad ile e-posta adresiniz. &quot;E-postamı gizle&quot; seçeneğini kullanırsanız yalnızca Apple&apos;ın yönlendirme adresini
                alırız.
              </li>
              <li>
                <strong>Misafir modu:</strong> Ad veya e-posta olmadan rastgele bir kullanıcı kimliği oluşturulur.
              </li>
            </ul>
            <h3>Kullanım ve ilerleme verileri</h3>
            <ul>
              <li>Okuduğunuz sure/ayetler, okuma süreleri ve tarihleri</li>
              <li>Yer imleri ve eklediğiniz notlar</li>
              <li>İncelediğiniz kavramlar</li>
              <li>Ezber oturumlarınız ve tekrar planınız</li>
            </ul>
            <p>
              Bu veriler önce cihazınızda saklanır; giriş yaptıysanız cihazlarınız arasında eşitlenmek üzere sunucularımıza
              aktarılır.
            </p>
            <h3>İşlemediğimiz veriler</h3>
            <ul>
              <li>Konum, rehber, fotoğraf veya sağlık verisi toplamayız.</li>
              <li>Reklam kimliği (IDFA) kullanmaz, uygulamalar arası takip yapmayız.</li>
              <li>
                Mikrofon şu an hiçbir özellikte kullanılmamaktadır. İleride sesli ezber doğrulaması eklendiğinde ses,
                yalnızca izninizle ve cihaz üzerinde işlenecektir.
              </li>
            </ul>
          </section>

          <section id="amaclar">
            <h2>3. İşleme Amaçları ve Hukuki Sebepler</h2>
            <ul>
              <li>
                Hesabınızı oluşturmak ve oturumunuzu sürdürmek — <em>sözleşmenin ifası (KVKK m.5/2-c)</em>
              </li>
              <li>
                Okuma ilerlemenizi, yer imlerinizi ve ezber planınızı cihazlar arasında eşitlemek —{" "}
                <em>sözleşmenin ifası</em>
              </li>
              <li>
                Hizmetin güvenliğini sağlamak ve kötüye kullanımı önlemek — <em>meşru menfaat (KVKK m.5/2-f)</em>
              </li>
              <li>
                Toplu, kimliksizleştirilmiş istatistiklerle hizmeti iyileştirmek — <em>meşru menfaat</em>
              </li>
            </ul>
          </section>

          <section id="aktarim">
            <h2>4. Hizmet Sağlayıcılar ve Aktarım</h2>
            <p>Verilerinizi satmayız ve pazarlama amacıyla paylaşmayız. Yalnızca hizmeti sunmak için şu sağlayıcılarla çalışırız:</p>
            <ul>
              <li>
                <strong>Apple</strong> — kimlik doğrulama (Apple ile Giriş) ve uygulama dağıtımı
              </li>
              <li>
                <strong>Hostinger</strong> — sunucu ve veritabanı barındırma
              </li>
              <li>
                <strong>Cloudflare</strong> — tilavet seslerinin ve sitenin dağıtımı (CDN); bu istekler hesabınızla
                ilişkilendirilmez
              </li>
            </ul>
            <p>
              Bu sağlayıcıların bir kısmının sunucuları yurt dışında bulunabilir; aktarım KVKK m.9 kapsamındaki güvencelerle
              yapılır.
            </p>
          </section>

          <section id="saklama">
            <h2>5. Saklama Süresi ve Güvenlik</h2>
            <p>
              Hesap ve ilerleme verilerinizi hesabınız açık olduğu sürece saklarız. Hesabınızın silinmesini talep ettiğinizde
              ilgili tüm veriler en geç 30 gün içinde kalıcı olarak silinir. Veriler aktarım sırasında TLS ile şifrelenir;
              sunuculara erişim kısıtlıdır.
            </p>
          </section>

          <section id="haklar">
            <h2>6. Haklarınız ve Hesap Silme</h2>
            <p>KVKK m.11 uyarınca verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme ve işlemeye itiraz etme haklarına sahipsiniz.</p>
            <p>
              Hesabınızın ve tüm verilerinizin silinmesi için, kayıtlı e-posta adresinizden veya uygulamadaki{" "}
              <em>Ayarlar → Geri Bildirim Gönder</em> bağlantısından <a href={`mailto:${CONTACT_EMAIL}?subject=Hesap%20silme%20talebi`}>{CONTACT_EMAIL}</a>{" "}
              adresine yazmanız yeterlidir. Talepler en geç 30 gün içinde sonuçlandırılır. Uygulama içi hesap silme özelliği
              yakında eklenecektir.
            </p>
            <p>
              Misafir modunda verileriniz yalnızca cihazınızda ve anonim bir kimlikle tutulur; uygulamayı silmeniz yerel
              verileri de siler.
            </p>
          </section>

          <section id="cocuklar">
            <h2>7. Çocukların Gizliliği</h2>
            <p>
              Uygulama genel kitleye yöneliktir ve 13 yaşından küçük çocuklardan bilerek kişisel veri toplamaz. Böyle bir
              durumun farkına varırsanız lütfen bize yazın.
            </p>
          </section>

          <section id="degisiklikler">
            <h2>8. Değişiklikler</h2>
            <p>
              Bu politikayı güncelleyebiliriz. Önemli değişiklikleri uygulama içinden veya bu sayfa üzerinden duyururuz.
              Güncel sürüm her zaman bu adreste yayımlanır.
            </p>
          </section>

          <p className={styles.back}>
            <Link href="/">← Ana sayfaya dön</Link>
          </p>
        </article>
      </div>
    </main>
  );
}
