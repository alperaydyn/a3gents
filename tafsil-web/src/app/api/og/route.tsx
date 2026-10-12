import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const SIZES = {
  landscape: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
} as const;

type Format = keyof typeof SIZES;

// Satori/resvg needs raw ttf/otf bytes. Google's default css2 response is
// woff2; requesting with an old Chrome UA makes it return truetype instead —
// the same trick used by Vercel's next/og examples.
async function loadGoogleFont(family: string, weight: number, text: string) {
  const params = new URLSearchParams({ family: `${family}:wght@${weight}`, text });
  const css = await fetch(`https://fonts.googleapis.com/css2?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36",
    },
  }).then((r) => r.text());

  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error(`Font not found: ${family}`);
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

const LATIN_SAMPLE =
  "abcçdefgğhıijklmnoöprsştuüvyzABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ0123456789:,.'’‘\"“”-—·/ ";

const GOLD = "#C9A227";
const BG = "#14130F";
const INK = "#F4F1EA";
const MUT = "#A39C8C";

interface CardParams {
  format: Format;
  sure: string | null;
  ayetNo: string | null;
  arabicText: string;
  tr: string | null;
  title?: string | null;
}

function buildCard({ format, sure, ayetNo, arabicText, tr, title }: CardParams) {
  const isVerseCard = Boolean(sure && ayetNo && tr);
  const cardTitle = title || (isVerseCard ? `${sure} · ${ayetNo}` : "tafsil");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BG,
        padding: format === "story" ? "90px 80px" : "64px 72px",
        fontFamily: "Instrument Sans",
      }}
    >
      <div style={{ display: "flex", width: "100%", height: 2, background: GOLD, opacity: 0.55 }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 28, width: "100%" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: GOLD, textTransform: "uppercase" }}>
          {cardTitle}
        </div>
        {isVerseCard && arabicText ? (
          <div
            style={{
              display: "flex",
              width: "100%",
              fontFamily: "Noto Naskh Arabic",
              fontSize: format === "story" ? 54 : 44,
              lineHeight: 1.9,
              color: INK,
              direction: "rtl",
              textAlign: "right",
              justifyContent: "flex-end",
            }}
          >
            {arabicText}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            width: "100%",
            fontFamily: "Newsreader",
            fontSize: isVerseCard ? (format === "story" ? 42 : 32) : format === "story" ? 64 : 48,
            lineHeight: isVerseCard ? 1.5 : 1.3,
            color: INK,
            maxWidth: isVerseCard ? "none" : format === "story" ? 880 : 900,
          }}
        >
          {isVerseCard ? `“${tr}”` : "Kur'an'ı kendi iç bağlamından anlamak"}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 20, color: MUT }}>tafsil.net</div>
        <div style={{ display: "flex", width: 44, height: 2, background: GOLD, opacity: 0.55 }} />
      </div>
    </div>
  );
}

async function renderPng(params: CardParams, withArabic: boolean) {
  const { width, height } = SIZES[params.format];
  const arabicText = withArabic ? params.arabicText : "";
  const latinText = LATIN_SAMPLE + "tafsil.net" + (params.tr ?? "") + (params.sure ?? "");

  const [newsreader, instrumentSans, arabicFont] = await Promise.all([
    loadGoogleFont("Newsreader", 400, latinText),
    loadGoogleFont("Instrument Sans", 500, latinText),
    arabicText ? loadGoogleFont("Noto Naskh Arabic", 400, arabicText) : Promise.resolve(null),
  ]);

  const fonts = [
    { name: "Newsreader", data: newsreader, weight: 400 as const, style: "normal" as const },
    { name: "Instrument Sans", data: instrumentSans, weight: 500 as const, style: "normal" as const },
    ...(arabicFont
      ? [{ name: "Noto Naskh Arabic", data: arabicFont, weight: 400 as const, style: "normal" as const }]
      : []),
  ];

  const image = new ImageResponse(buildCard({ ...params, arabicText }), { width, height, fonts });
  // Satori's Arabic shaping doesn't support every OpenType GSUB lookup; the
  // failure only surfaces while piping the render, not when constructing the
  // Response, so force it to materialize here to catch it.
  return image.arrayBuffer();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.nextUrl);
  const format: Format = searchParams.get("format") === "story" ? "story" : "landscape";
  const params: CardParams = {
    format,
    sure: searchParams.get("sure"),
    ayetNo: searchParams.get("ayet"),
    arabicText: searchParams.get("ar") ?? "",
    tr: searchParams.get("tr"),
    title: searchParams.get("title"),
  };

  let buffer: ArrayBuffer;
  try {
    buffer = await renderPng(params, true);
  } catch {
    buffer = await renderPng(params, false);
  }

  return new Response(buffer, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
