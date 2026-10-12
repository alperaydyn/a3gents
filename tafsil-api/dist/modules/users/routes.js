"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = userRoutes;
const zod_1 = require("zod");
const service_js_1 = require("./service.js");
const dto_js_1 = require("./dto.js");
const response_js_1 = require("../../utils/response.js");
const patchMeSchema = zod_1.z.object({
    tercihModu: zod_1.z.enum(["kesif", "ogrenme", "odak"]).optional(),
    dil: zod_1.z.string().min(2).max(8).optional(),
});
async function userRoutes(app) {
    app.get("/me", { preHandler: app.authenticate }, async (request, reply) => {
        const user = await (0, service_js_1.getUserById)(request.user.sub);
        if (!user)
            return reply.status(404).send((0, response_js_1.fail)("USER_NOT_FOUND", "Kullanıcı bulunamadı"));
        return reply.send((0, response_js_1.ok)((0, dto_js_1.toPublicUser)(user)));
    });
    app.patch("/me", { preHandler: app.authenticate }, async (request, reply) => {
        const parsed = patchMeSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send((0, response_js_1.fail)("VALIDATION_ERROR", "Geçersiz istek gövdesi", parsed.error.flatten()));
        }
        const user = await (0, service_js_1.updateUserPrefs)(request.user.sub, {
            tercih_modu: parsed.data.tercihModu,
            dil: parsed.data.dil,
        });
        if (!user)
            return reply.status(404).send((0, response_js_1.fail)("USER_NOT_FOUND", "Kullanıcı bulunamadı"));
        return reply.send((0, response_js_1.ok)((0, dto_js_1.toPublicUser)(user)));
    });
}
