// Tees console output + crashes to a log file in the per-user data folder.
// Packaged Windows GUI apps have no console, so this is the only way to see what
// happened. Users can be asked to send `desktop.log` for support.

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

let file;

function logFile() {
  return path.join(app.getPath("userData"), "desktop.log");
}

function write(line) {
  // Synchronous append: guarantees every line is on disk immediately, so the
  // log is always an accurate picture even if the process is later stuck/killed.
  try {
    if (file) fs.appendFileSync(file, line);
  } catch {
    /* logging is best-effort */
  }
}

function init() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    file = logFile();
    write(`\n=== launch ${new Date().toISOString()} (packaged=${app.isPackaged}) ===\n`);
  } catch {
    /* logging is best-effort */
  }

  const tee = (orig, level) => (...args) => {
    write(`[${new Date().toISOString()}] [${level}] ` + args.map(String).join(" ") + "\n");
    orig(...args);
  };
  console.log = tee(console.log.bind(console), "info");
  console.warn = tee(console.warn.bind(console), "warn");
  console.error = tee(console.error.bind(console), "error");

  process.on("uncaughtException", (e) =>
    console.error("uncaughtException:", (e && e.stack) || e),
  );
  process.on("unhandledRejection", (e) =>
    console.error("unhandledRejection:", (e && e.stack) || e),
  );
}

module.exports = { init, logFile };
