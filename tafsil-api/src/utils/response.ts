// Ortak API Yanıt Sözleşmesi (bkz. docs/agents/00-MASTER-BLUEPRINT.md §4)

export interface ApiResponseMeta {
  page?: number;
  limit?: number;
  total?: number;
  cached?: boolean;
  [key: string]: unknown;
}

export interface ApiResponseError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiResponseError;
  meta?: ApiResponseMeta;
}

export function ok<T>(data: T, meta?: ApiResponseMeta): ApiResponse<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function fail(code: string, message: string, details?: unknown): ApiResponse<never> {
  const error: ApiResponseError = details !== undefined ? { code, message, details } : { code, message };
  return { success: false, error };
}
