"use strict";
// Ortak API Yanıt Sözleşmesi (bkz. docs/agents/00-MASTER-BLUEPRINT.md §4)
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.fail = fail;
function ok(data, meta) {
    return meta ? { success: true, data, meta } : { success: true, data };
}
function fail(code, message, details) {
    const error = details !== undefined ? { code, message, details } : { code, message };
    return { success: false, error };
}
