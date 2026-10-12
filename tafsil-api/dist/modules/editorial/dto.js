"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifyContentSchema = void 0;
const zod_1 = require("zod");
exports.VerifyContentSchema = zod_1.z.object({
    content_md: zod_1.z.string().min(10, "İçerik en az 10 karakter olmalıdır"),
    title: zod_1.z.string().optional(),
});
