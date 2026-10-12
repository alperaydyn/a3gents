// tafsil.net — Backend PM2 Ecosystem Configuration
// Kullanım: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'tafsil-api',
      script: 'dist/server.js',
      cwd: '/opt/tafsil/backend',

      // Cluster mode: 2 worker (4 vCPU VPS'in yarısı)
      instances: 2,
      exec_mode: 'cluster',

      // Ortam değişkenleri
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 4100,
      },

      // Bellek limiti — aşılırsa otomatik yeniden başlat
      max_memory_restart: '1G',

      // Otomatik yeniden başlatma
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,

      // Graceful shutdown (bağlantıları düzgün kapatma)
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Log ayarları
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/opt/tafsil/logs/api-error.log',
      out_file: '/opt/tafsil/logs/api-out.log',
      merge_logs: true,

      // Sıfır kesinti deployment
      wait_ready: true,

      // Ortam değişkenleri dosyasından yükle
      env_file: '.env.production',
    },
  ],
};
