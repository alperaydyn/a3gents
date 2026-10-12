# ──────────────────────────────────────
# Stage 1: Bağımlılık kurulumu
# ──────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Bağımlılık dosyalarını kopyala
COPY package.json package-lock.json ./

# Sadece prodüksiyon bağımlılıklarını yükle
RUN npm ci --production --ignore-scripts && \
    npm cache clean --force

# ──────────────────────────────────────
# Stage 2: Uygulama derlemesi
# ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Tüm bağımlılıkları yükle (devDependencies dahil — TypeScript derleme için)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Kaynak kodu kopyala
COPY . .

# TypeScript derlemesi
RUN npm run build

# ──────────────────────────────────────
# Stage 3: Prodüksiyon çalışma ortamı
# ──────────────────────────────────────
FROM node:20-alpine AS runner

# Güvenlik: non-root kullanıcı
RUN addgroup -g 1001 -S tafsil && \
    adduser -S tafsil -u 1001

WORKDIR /app

# Yalnızca gerekli dosyaları kopyala
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Ortam değişkenleri
ENV NODE_ENV=production
ENV PORT=4000

# Non-root kullanıcıya geç
USER tafsil

# Port tanımı
EXPOSE 4000

# Sağlık kontrolü
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

# Uygulamayı başlat
CMD ["node", "dist/server.js"]
