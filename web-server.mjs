// Node listener for the TanStack Start build output.
// `vite build` produced dist/client/ (static assets) and dist/server/server.js (SSR fetch handler).
// We serve client assets ourselves and pipe everything else through the SSR handler.
//
// Honors HOST and PORT env vars (see ecosystem.config.cjs).

import { createServer, request as httpRequest } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, "dist", "client");

// Desktop (Electron) only.
// - MEALOPS_API_PROXY: when set, /api/* is reverse-proxied to the local backend
//   so the dashboard works from ANY device on the network through this one port
//   (no CORS, backend stays internal). In that case the browser uses a relative
//   "/api" base. SSR (server-side) still reads the absolute MEALOPS_API_BASE.
// - Without the proxy, we inject the absolute MEALOPS_API_BASE for the client.
// Unset in production → zero behavioural change.
const API_PROXY = process.env.MEALOPS_API_PROXY || "";
const CLIENT_API_BASE = API_PROXY ? "/api" : process.env.MEALOPS_API_BASE || "";
const INJECT_SCRIPT = CLIENT_API_BASE
  ? `<script>window.__MEALOPS_API_BASE__=${JSON.stringify(CLIENT_API_BASE)};</script>`
  : "";

function injectApiBase(html) {
  if (!INJECT_SCRIPT) return html;
  if (html.includes("__MEALOPS_API_BASE__")) return html; // already injected
  // Insert immediately after <head> so it runs before the app's module scripts.
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}${INJECT_SCRIPT}`);
  }
  return `${INJECT_SCRIPT}${html}`;
}

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const ssrModule = await import("./dist/server/server.js");
const ssrHandler =
  typeof ssrModule.default === "function"
    ? ssrModule.default
    : ssrModule.default?.fetch?.bind(ssrModule.default) ??
      ssrModule.fetch ??
      ssrModule.handler;

if (typeof ssrHandler !== "function") {
  console.error(
    "[web] dist/server/server.js did not expose a fetch handler. Exports:",
    Object.keys(ssrModule),
  );
  process.exit(1);
}

async function tryServeStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/" || pathname.endsWith("/")) return false;

  const filePath = normalize(join(CLIENT_DIR, pathname));
  if (!filePath.startsWith(CLIENT_DIR)) return false; // path-traversal guard

  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", type);
  res.setHeader("content-length", info.size);
  // Hashed assets under /assets/ are safe to cache aggressively.
  if (pathname.startsWith("/assets/")) {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  }
  if (req.method === "HEAD") {
    res.end();
  } else {
    createReadStream(filePath).pipe(res);
  }
  return true;
}

function nodeReqToFetch(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || `${HOST}:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function pipeFetchResponse(nodeRes, fetchRes) {
  nodeRes.statusCode = fetchRes.status;
  fetchRes.headers.forEach((value, key) => nodeRes.setHeader(key, value));
  if (!fetchRes.body) {
    nodeRes.end();
    return;
  }

  // When injecting the runtime API base into HTML, buffer the (small) page so we
  // can rewrite <head>, then send it with a corrected content-length. All other
  // responses (and the whole production path) stream through untouched.
  const isHtml = (fetchRes.headers.get("content-type") || "").includes("text/html");
  if (INJECT_SCRIPT && isHtml) {
    const html = injectApiBase(await fetchRes.text());
    const buf = Buffer.from(html, "utf8");
    nodeRes.setHeader("content-length", buf.byteLength);
    nodeRes.end(buf);
    return;
  }

  Readable.fromWeb(fetchRes.body).pipe(nodeRes);
}

// Reverse-proxy /api/* to the local backend (desktop network mode). Forwards
// method, headers and body, and streams the response straight back.
function proxyApi(req, res) {
  const target = new URL(API_PROXY);
  const proxyReq = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: target.host },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("API unavailable: " + err.message);
  });
  req.pipe(proxyReq);
}

createServer(async (req, res) => {
  try {
    if (API_PROXY && (req.url === "/api" || req.url.startsWith("/api/"))) {
      proxyApi(req, res);
      return;
    }
    if (await tryServeStatic(req, res)) return;
    const fetchReq = nodeReqToFetch(req);
    const fetchRes = await ssrHandler(fetchReq, {}, {});
    await pipeFetchResponse(res, fetchRes);
  } catch (err) {
    console.error("[web] request failed:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  }
}).listen(PORT, HOST, () => {
  console.log(`[web] listening on http://${HOST}:${PORT}`);
});
