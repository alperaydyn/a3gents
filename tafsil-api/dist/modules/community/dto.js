"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForkSessionSchema = void 0;
const zod_1 = require("zod");
exports.ForkSessionSchema = zod_1.z.object({
    target_title: zod_1.z.string().min(2).max(255).optional(),
});
