import type { Metadata } from "next";
import { Newsreader, Instrument_Sans, Amiri } from "next/font/google";
import SiteHeader from "@/components/site-header/SiteHeader";
import SiteFooter from "@/components/site-footer/SiteFooter";
import { SITE_NAME, SITE_TAGLINE, SITE_URL, THEME_INIT_SCRIPT } from "@/lib/site";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Kur'an-ı Kerim'i kavramları ayetler arası semantik bağlantılardan ve morfolojik kök matematiğinden yola çıkarak anlamlandıran dijital anlama platformu.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "tr_TR",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "tafsil.net",
    url: SITE_URL,
    description: SITE_TAGLINE,
  };

  return (
    <html
      lang="tr"
      className={`${newsreader.variable} ${instrumentSans.variable} ${amiri.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
