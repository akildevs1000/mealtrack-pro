// Persisted desktop configuration, stored as JSON in Electron's per-user
// userData directory so it survives reinstalls/upgrades and is never bundled
// into the installer. Holds the DB connection, the two local ports, and a
// generated JWT secret. Nothing here is baked at build time.

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { app } = require("electron");

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function defaultConfig() {
  return {
    db: { host: "127.0.0.1", port: 5432, user: "postgres", password: "", database: "mymeals" },
    apiPort: 5044,
    webPort: 8044,
    // Address other devices use to reach this server. Blank = auto-detect the
    // PC's LAN IP at runtime, so nothing is hard-coded for the customer.
    serverAddress: "",
    jwtSecret: crypto.randomBytes(48).toString("hex"),
    setupComplete: false,
  };
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

// Build the Postgres URL Prisma expects from the discrete fields the user enters.
function buildDatabaseUrl(db) {
  const enc = encodeURIComponent;
  const host = db.host || "127.0.0.1";
  const port = Number(db.port) || 5432;
  const user = enc(db.user || "postgres");
  const pass = enc(db.password || "");
  const name = enc(db.database || "mymeals");
  return `postgresql://${user}:${pass}@${host}:${port}/${name}?schema=public`;
}

module.exports = { configPath, defaultConfig, loadConfig, saveConfig, buildDatabaseUrl };
