"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_js_1 = require("./app.js");
const env_js_1 = require("./config/env.js");
const service_js_1 = require("./modules/quran/service.js");
async function start() {
    const app = await (0, app_js_1.buildApp)();
    try {
        await app.listen({ port: env_js_1.config.port, host: env_js_1.config.host });
        app.log.info(`tafsil.net API ${env_js_1.config.host}:${env_js_1.config.port} üzerinde çalışıyor (${env_js_1.config.env})`);
        if (process.send) {
            process.send("ready");
        }
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
    // BE-009: Redis L1 önbelleğini açılışta ısıt (bloklamadan, arkaplanda).
    (0, service_js_1.warmL1Cache)()
        .then(({ sureler, detaylar }) => {
        app.log.info(`L1 önbellek ısıtıldı: ${sureler} sure listesi girdisi, ${detaylar} sure detayı.`);
    })
        .catch((err) => {
        app.log.warn({ err }, "L1 önbellek ısıtma başarısız (veritabanı henüz hazır olmayabilir).");
    });
}
start();
