import { buildApp } from "./app.js";
import { config } from "./config/env.js";
import { warmL1Cache } from "./modules/quran/service.js";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`tafsil.net API ${config.host}:${config.port} üzerinde çalışıyor (${config.env})`);
    if (process.send) {
      process.send("ready");
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // BE-009: Redis L1 önbelleğini açılışta ısıt (bloklamadan, arkaplanda).
  warmL1Cache()
    .then(({ sureler, detaylar }) => {
      app.log.info(`L1 önbellek ısıtıldı: ${sureler} sure listesi girdisi, ${detaylar} sure detayı.`);
    })
    .catch((err) => {
      app.log.warn({ err }, "L1 önbellek ısıtma başarısız (veritabanı henüz hazır olmayabilir).");
    });
}

start();
