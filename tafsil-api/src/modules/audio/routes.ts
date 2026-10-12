import type { FastifyPluginAsync } from "fastify";
import { AudioService } from "./service.js";

export const audioRoutes: FastifyPluginAsync = async (fastify) => {
  const audioService = new AudioService();

  fastify.get("/api/v1/audio/reciters", async (_request, reply) => {
    const reciters = await audioService.listReciters();
    return reply.send({
      success: true,
      data: reciters
    });
  });

  fastify.get("/api/v1/audio/sure/:sureId", async (request, reply) => {
    const { sureId } = request.params as { sureId: string };
    const query = request.query as { reciter?: string };
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
    } catch (err: any) {
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
