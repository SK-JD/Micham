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

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function method(req: ApiRequest, expected: string) {
  if (req.method !== expected) throw new ApiError(405, "Method not allowed.");
}

export function jsonOk(res: ApiResponse, body: unknown = { ok: true }) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(body);
}

export function jsonCreated(res: ApiResponse, body: unknown) {
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json(body);
}

export function handleError(res: ApiResponse, error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Server error.";
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json({ error: message });
}

export function bodyObject(req: ApiRequest) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
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
