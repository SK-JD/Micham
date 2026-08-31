import http from "node:http";
import fs from "node:fs";
import { parse as parseUrl } from "node:url";
import { createServer as createViteServer } from "vite";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5173);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function queryObject(query) {
  const out = {};
  for (const [key, value] of Object.entries(query)) {
    out[key] = Array.isArray(value) ? value.map(String) : String(value ?? "");
  }
  return out;
}

function createApiResponse(res) {
  let statusCode = 200;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    json(body) {
      if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = statusCode;
      res.end(typeof body === "string" && res.getHeader("Content-Type")?.toString().startsWith("text/html") ? body : JSON.stringify(body));
    },
    send(body) {
      res.statusCode = statusCode;
      res.end(body);
    },
  };
}

const vite = await createViteServer({
  server: { middlewareMode: true, host, hmr: { host: "localhost" } },
  appType: "spa",
});

const server = http.createServer(async (req, res) => {
  const parsed = parseUrl(req.url || "/", true);
  const pathname = parsed.pathname || "/";

  if (pathname.startsWith("/api/")) {
    try {
      const modulePath = `${pathname}.ts`;
      const mod = await vite.ssrLoadModule(modulePath);
      const handler = mod.default;
      if (typeof handler !== "function") throw new Error(`No API handler found for ${pathname}`);
      await handler(
        {
          method: req.method,
          body: await readBody(req),
          headers: req.headers,
          query: queryObject(parsed.query),
        },
        createApiResponse(res),
      );
    } catch (error) {
      vite.ssrFixStacktrace(error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Server error." }));
    }
    return;
  }

  vite.middlewares(req, res);
});

server.listen(port, host, () => {
  console.log(`Micham full local server: http://localhost:${port}/`);
  console.log(`LAN testing URL: http://192.168.68.120:${port}/`);
});
