export type ApiRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  status(code: number): ApiResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
};

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(status: number, message: string, code = codeForStatus(status), retryable = status === 429 || status >= 500) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

type RequestMeta = {
  requestId: string;
  startedAt: number;
  endpoint: string;
  method: string;
};

const responseMeta = new WeakMap<ApiResponse, RequestMeta>();

function codeForStatus(status: number) {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 405) return "METHOD_NOT_ALLOWED";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

function createRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function beginRequest(req: ApiRequest, res: ApiResponse, endpoint = "api") {
  const rawRequestId = req.headers["x-request-id"];
  const requestId = (Array.isArray(rawRequestId) ? rawRequestId[0] : rawRequestId)?.slice(0, 80) || createRequestId();
  const meta = { requestId, startedAt: Date.now(), endpoint, method: req.method || "UNKNOWN" };
  responseMeta.set(res, meta);
  res.setHeader("X-Request-ID", requestId);
  res.setHeader("Cache-Control", "no-store");
  return meta;
}

function metaFor(res: ApiResponse) {
  const existing = responseMeta.get(res);
  if (existing) return existing;
  const meta = { requestId: createRequestId(), startedAt: Date.now(), endpoint: "api", method: "UNKNOWN" };
  responseMeta.set(res, meta);
  res.setHeader("X-Request-ID", meta.requestId);
  return meta;
}

function responseBody(body: unknown, requestId: string) {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), requestId };
  }
  return body;
}

function logApiError(res: ApiResponse, status: number, code: string, error: unknown) {
  const meta = metaFor(res);
  const durationMs = Date.now() - meta.startedAt;
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[api]", {
    requestId: meta.requestId,
    endpoint: meta.endpoint,
    method: meta.method,
    status,
    code,
    durationMs,
    message,
  });
}

export function method(req: ApiRequest, expected: string) {
  if (req.method !== expected) throw new ApiError(405, "Method not allowed.");
}

export function jsonOk(res: ApiResponse, body: unknown = { ok: true }) {
  const meta = metaFor(res);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(responseBody(body, meta.requestId));
}

export function jsonCreated(res: ApiResponse, body: unknown) {
  const meta = metaFor(res);
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(responseBody(body, meta.requestId));
}

export function handleError(res: ApiResponse, error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof ApiError ? error.message : "Server request failed.";
  const retryable = error instanceof ApiError ? error.retryable : true;
  const meta = metaFor(res);
  logApiError(res, status, code, error);
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ error: message, code, requestId: meta.requestId, retryable });
}

export function bodyObject(req: ApiRequest, options: { maxBytes?: number } = {}) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const estimatedBytes = Buffer.byteLength(JSON.stringify(req.body), "utf8");
  if (estimatedBytes > maxBytes) {
    throw new ApiError(413, "Request payload is too large.");
  }
  return req.body as Record<string, unknown>;
}

export function stringField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export function authToken(req: ApiRequest) {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith("Bearer ")) throw new ApiError(401, "Missing session token.");
  return value.slice("Bearer ".length).trim();
}
