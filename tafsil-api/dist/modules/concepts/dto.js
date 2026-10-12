"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listConceptsQuerySchema = void 0;
const zod_1 = require("zod");
exports.listConceptsQuerySchema = zod_1.z.object({
    search: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().min(1).max(50).default(20),
    offset: zod_1.z.coerce.number().min(0).default(0),
});
