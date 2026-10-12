"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askQuestionSchema = exports.createSessionSchema = void 0;
const zod_1 = require("zod");
exports.createSessionSchema = zod_1.z.object({
    soru: zod_1.z.string().min(3).max(500),
    baslik: zod_1.z.string().max(128).optional(),
    odak_kavramlar: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.askQuestionSchema = zod_1.z.object({
    soru: zod_1.z.string().min(3).max(500),
});
