// Orchestrates the bundled full-stack app for the desktop shell:
//   1. ensure the target Postgres database exists (create it if missing)
//   2. apply Prisma migrations (forward-only, idempotent)
//   3. start the API server with config-derived env (port, DB, JWT, CORS)
//   4. wait for /api/health, then bootstrap the first admin if the DB is empty
//   5. start the SSR web server, injecting the API base for the frontend
//
// Child processes are launched with Electron's own binary in Node mode
// (ELECTRON_RUN_AS_NODE), so no separate Node runtime needs to be shipped.

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Client } = require("pg");
const { paths } = require("./paths.cjs");
const { buildDatabaseUrl } = require("./config.cjs");

let apiProc = null;
let webProc = null;

function log(onProgress, msg) {
  console.log("[desktop]", msg);
  if (typeof onProgress === "function") onProgress(msg);
}

// All non-internal IPv4 addresses of this machine.
function detectedHosts() {
  const hosts = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) hosts.push(ni.address);
    }
  }
  return hosts;
}

// First auto-detected LAN IP (for the setup form's placeholder/hint).
function detectedIp() {
  return detectedHosts()[0] || "";
}

// URLs other devices can use to open the dashboard. If the user pinned a
// server address it wins; otherwise we list every detected LAN IP.
function networkUrls(cfg) {
  const pinned = cfg.serverAddress && String(cfg.serverAddress).trim();
  const hosts = pinned ? [pinned.trim()] : detectedHosts();
  return hosts.map((h) => `http://${h}:${cfg.webPort}`);
}

// Common env for every spawned Node child: run-as-node, production, DB URL, and
// explicit Prisma engine paths (matters in the packaged, asar-unpacked layout).
function baseEnv(cfg) {
  const p = paths();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    DATABASE_URL: buildDatabaseUrl(cfg.db),
  };
  const queryEngine = path.join(p.prismaEnginesDir, "query_engine-windows.dll.node");
  const schemaEngine = path.join(p.prismaEnginesDir, "schema-engine-windows.exe");
  if (fs.existsSync(queryEngine)) env.PRISMA_QUERY_ENGINE_LIBRARY = queryEngine;
  if (fs.existsSync(schemaEngine)) env.PRISMA_SCHEMA_ENGINE_BINARY = schemaEngine;

  // Styled-PDF reports use Puppeteer's Chromium, which lives outside node_modules.
  // If a bundled cache was shipped (see desktop/README.md), point Puppeteer at it;
  // otherwise reports fall back to the XLSX/pdfkit paths, which need no Chromium.
  const puppeteerCache = path.join(p.root, "puppeteer-cache");
  if (fs.existsSync(puppeteerCache)) env.PUPPETEER_CACHE_DIR = puppeteerCache;
  return env;
}

function friendlyPgError(err) {
  const code = err && err.code;
  const msg = (err && err.message) || "";
  if (code === "ECONNREFUSED")
    return "Connection refused — is PostgreSQL running, and are the host and port correct?";
  if (code === "ENOTFOUND") return "Host not found — check the database host.";
  if (code === "ETIMEDOUT" || code === "ECONNRESET")
    return "Connection timed out — check the host/port and any firewall.";
  if (code === "28P01" || code === "28000")
    return "Authentication failed — wrong username or password.";
  if (code === "3D000") return "Database does not exist.";
  // pg throws this (no code) when the password is empty/missing but the server
  // requires one (SCRAM/md5). This is the most common first-run mistake.
  if (/client password must be a string|SASL|SCRAM/i.test(msg))
    return "This PostgreSQL user requires a password — please enter it.";
  return msg || "Unknown database error.";
}

function newClient(db, database) {
  return new Client({
    host: db.host,
    port: Number(db.port) || 5432,
    user: db.user,
    password: typeof db.password === "string" ? db.password : "",
    database,
    connectionTimeoutMillis: 8000,
  });
}

// Hard wall-clock guard so a stuck connect/query can never hang the setup
// spinner forever (pg's own timeout doesn't always fire on every platform).
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Connect with both pg's timeout and an outer guard; always cleans up the socket.
async function connectClient(client, label) {
  try {
    await withTimeout(client.connect(), 10000, label);
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
}

// Used by the "Test connection" button. Reachable + creds-valid is success even
// if the named database doesn't exist yet (we create it on launch).
async function testConnection(db) {
  const tryConnect = async (database) => {
    const c = newClient(db, database);
    await connectClient(c, `Connecting to ${db.host}:${db.port}`);
    await withTimeout(c.query("SELECT 1"), 8000, "Database query");
    await c.end();
  };
  try {
    await tryConnect(db.database);
    return { ok: true, message: `Connected to "${db.database}" successfully.` };
  } catch (err) {
    if (err.code === "3D000") {
      try {
        await tryConnect("postgres");
        return {
          ok: true,
          message: `Server reachable. Database "${db.database}" will be created on launch.`,
        };
      } catch (err2) {
        return { ok: false, message: friendlyPgError(err2) };
      }
    }
    return { ok: false, message: friendlyPgError(err) };
  }
}

// Check (and for "new", create) the target database.
//   mode "new"      → the database must NOT already exist; create it.
//   mode "existing" → the database MUST already exist; just verify the connection.
async function ensureDatabaseExists(cfg, mode, onProgress) {
  const { db } = cfg;
  log(onProgress, `Connecting to PostgreSQL at ${db.host}:${db.port}…`);

  // Probe the target database. 3D000 = it doesn't exist (server reachable).
  let exists = false;
  const target = newClient(db, db.database);
  try {
    await connectClient(target, "Database connection");
    await target.end().catch(() => {});
    exists = true;
  } catch (err) {
    if (err.code !== "3D000") throw new Error(friendlyPgError(err));
    exists = false;
  }

  if (mode === "new") {
    if (exists) {
      throw new Error(
        `A database named "${db.database}" already exists. Choose a different name, ` +
          `or go Back and pick "Connect to an existing database".`,
      );
    }
    log(onProgress, `Creating database "${db.database}"…`);
    const admin = newClient(db, "postgres");
    await connectClient(admin, "Database connection").catch((e) => {
      throw new Error(friendlyPgError(e));
    });
    try {
      const ident = '"' + String(db.database).replace(/"/g, '""') + '"';
      await withTimeout(admin.query(`CREATE DATABASE ${ident}`), 15000, "Create database");
      log(onProgress, `Database "${db.database}" created.`);
    } finally {
      await admin.end().catch(() => {});
    }
  } else {
    if (!exists) {
      throw new Error(
        `Database "${db.database}" does not exist. Go Back and choose ` +
          `"Set up a new database" to create it.`,
      );
    }
    log(onProgress, `Connected to database "${db.database}".`);
  }
}

function runMigrations(cfg, onProgress) {
  return new Promise((resolve, reject) => {
    const p = paths();
    log(onProgress, "Applying database migrations…");
    const child = spawn(
      process.execPath,
      [p.prismaCli, "migrate", "deploy", "--schema", p.prismaSchema],
      { cwd: p.serverDir, env: baseEnv(cfg), windowsHide: true },
    );
    let out = "";
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    // Guard against a hung migrate (e.g. a stuck advisory lock from a previous run).
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      finish(() =>
        reject(
          new Error("Migrations timed out (90s) — the database may be locked by another process."),
        ),
      );
    }, 90000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => finish(() => reject(e)));
    child.on("exit", (code) => {
      if (code === 0) {
        finish(() => {
          log(onProgress, "Database schema is up to date.");
          resolve();
        });
      } else {
        finish(() => reject(new Error("Migration failed:\n" + out.slice(-1500))));
      }
    });
  });
}

function startApi(cfg, onProgress) {
  const p = paths();
  log(onProgress, `Starting API server on port ${cfg.apiPort}…`);
  const env = baseEnv(cfg);
  env.PORT = String(cfg.apiPort);
  env.JWT_SECRET = cfg.jwtSecret;
  // Browsers reach the API through the web server's same-origin proxy, so this
  // is just a safety net; "*" keeps it simple for LAN access (auth is by token).
  env.CORS_ORIGIN = "*";
  env.MEALOPS_DESKTOP = "1";
  apiProc = spawn(process.execPath, [p.apiEntry], {
    cwd: p.serverDir,
    env,
    windowsHide: true,
  });
  apiProc.stdout.on("data", (d) => console.log("[api]", String(d).trimEnd()));
  apiProc.stderr.on("data", (d) => console.error("[api]", String(d).trimEnd()));
  apiProc.on("exit", (code) => {
    console.log("[api] exited with code", code);
    apiProc = null;
  });
}

function startWeb(cfg, onProgress) {
  const p = paths();
  log(onProgress, `Starting app on port ${cfg.webPort}…`);
  webProc = spawn(process.execPath, [p.webServer], {
    cwd: p.root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOST: "0.0.0.0", // listen on all interfaces so other devices on the LAN can reach it
      PORT: String(cfg.webPort),
      // SSR (server-side) talks to the backend directly on localhost…
      MEALOPS_API_BASE: `http://127.0.0.1:${cfg.apiPort}/api`,
      // …while browsers use a relative "/api" that the web server proxies here,
      // so it works from any device through this one port (no CORS, no host IP).
      MEALOPS_API_PROXY: `http://127.0.0.1:${cfg.apiPort}`,
    },
    windowsHide: true,
  });
  webProc.stdout.on("data", (d) => console.log("[web]", String(d).trimEnd()));
  webProc.stderr.on("data", (d) => console.error("[web]", String(d).trimEnd()));
  webProc.on("exit", (code) => {
    console.log("[web] exited with code", code);
    webProc = null;
  });
}

function waitForHttp(url, { timeoutMs = 30000, okStatuses = null } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        const ok = okStatuses ? okStatuses.includes(res.statusCode) : res.statusCode < 500;
        if (ok) resolve();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(3000, () => req.destroy(new Error("timeout")));
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs)
        return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(attempt, 600);
    };
    attempt();
  });
}

function httpJson(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: payload
          ? { "content-type": "application/json", "content-length": payload.length }
          : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            /* leave null */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Create the first admin only if the database has no users yet.
async function maybeBootstrapAdmin(cfg, admin, onProgress) {
  if (!admin || !admin.username || !admin.password) return;
  const base = `http://127.0.0.1:${cfg.apiPort}/api/setup`;
  const status = await httpJson("GET", `${base}/status`).catch(() => null);
  if (status && status.body && status.body.initialized) {
    log(onProgress, "Existing accounts found — leaving them untouched.");
    return;
  }
  log(onProgress, "Creating administrator account…");
  const res = await httpJson("POST", `${base}/bootstrap-admin`, {
    username: admin.username,
    password: admin.password,
    name: admin.name || "Administrator",
  });
  if (res.status === 201) {
    log(onProgress, `Administrator "${admin.username}" created.`);
  } else if (res.status === 409) {
    log(onProgress, "Accounts already exist — skipped admin creation.");
  } else {
    const msg = (res.body && res.body.error) || `HTTP ${res.status}`;
    throw new Error("Could not create administrator: " + msg);
  }
}

// Full bring-up.
//   opts.mode  = "new"      → create the database, then create the admin account
//              = "existing" → require the database, only apply pending migrations
//   opts.admin = { username, password } — the admin account, "new" mode only
async function provision(cfg, opts = {}, onProgress) {
  const mode = opts.mode === "new" ? "new" : "existing";
  await ensureDatabaseExists(cfg, mode, onProgress);
  await runMigrations(cfg, onProgress);
  startApi(cfg, onProgress);
  await waitForHttp(`http://127.0.0.1:${cfg.apiPort}/api/health`, { okStatuses: [200] });
  if (mode === "new" && opts.admin) {
    await maybeBootstrapAdmin(cfg, opts.admin, onProgress);
  }
  startWeb(cfg, onProgress);
  await waitForHttp(`http://127.0.0.1:${cfg.webPort}/`);
  const urls = networkUrls(cfg);
  if (urls.length) {
    log(onProgress, "Other devices on this network can open: " + urls.join("  "));
  }
  log(onProgress, "Ready.");
}

function stopServers() {
  for (const proc of [apiProc, webProc]) {
    if (proc && !proc.killed) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
  }
  apiProc = null;
  webProc = null;
}

module.exports = { testConnection, provision, stopServers, networkUrls, detectedIp };
