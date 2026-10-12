"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateSessionSchema = exports.createSessionSchema = void 0;
const zod_1 = require("zod");
exports.createSessionSchema = zod_1.z.object({
    sureId: zod_1.z.number().int().min(1).max(114),
    baslangicAyet: zod_1.z.number().int().min(1),
    bitisAyet: zod_1.z.number().int().min(1),
}).refine((data) => data.bitisAyet >= data.baslangicAyet, {
    message: "bitisAyet baslangicAyet değerinden küçük olamaz",
    path: ["bitisAyet"],
});
exports.evaluateSessionSchema = zod_1.z.object({
    quality: zod_1.z.number().int().min(0).max(5),
});
