"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audioRoutes = void 0;
const service_js_1 = require("./service.js");
const audioRoutes = async (fastify) => {
    const audioService = new service_js_1.AudioService();
    fastify.get("/api/v1/audio/reciters", async (_request, reply) => {
        const reciters = await audioService.listReciters();
        return reply.send({
            success: true,
            data: reciters
        });
    });
    fastify.get("/api/v1/audio/sure/:sureId", async (request, reply) => {
        const { sureId } = request.params;
        const query = request.query;
        const id = parseInt(sureId, 10);
        if (isNaN(id) || id < 1 || id > 114) {
            return reply.code(400).send({
                success: false,
                error: {
                    code: "INVALID_SURAH_ID",
                    message: "Geçersiz sure numarası (1-114 aralığında olmalıdır)"
                }
            });
        }
        try {
            const playlist = await audioService.getSurahAudioPlaylist(id, query?.reciter);
            return reply.send({
                success: true,
                data: playlist
            });
        }
        catch (err) {
            return reply.code(404).send({
                success: false,
                error: {
                    code: "NOT_FOUND",
                    message: err.message || "Ses çalma listesi bulunamadı"
                }
            });
        }
    });
};
exports.audioRoutes = audioRoutes;
