// tafsil.net — Web App PM2 Ecosystem Configuration
// Kullanım: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'tafsil-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/opt/tafsil/web',

      // Cluster mode: 2 worker
      instances: 2,
      exec_mode: 'cluster',

      // Ortam değişkenleri
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'https://api.tafsil.net',
        NEXT_PUBLIC_SITE_URL: 'https://new.tafsil.net',
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3100,
        NEXT_PUBLIC_API_URL: 'https://api-staging.tafsil.net',
        NEXT_PUBLIC_SITE_URL: 'https://staging.tafsil.net',
      },

      // Bellek limiti
      max_memory_restart: '768M',

      // Otomatik yeniden başlatma
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Log ayarları
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/opt/tafsil/logs/web-error.log',
      out_file: '/opt/tafsil/logs/web-out.log',
      merge_logs: true,

      // Sıfır kesinti deployment
      wait_ready: true,
    },
  ],
};
