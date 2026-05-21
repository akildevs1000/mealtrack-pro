// Builds the frontend + backend in the repo root so electron-builder has fresh
// dist/ and server/dist/ to bundle. Run automatically by `npm run dist`.
//
// This only invokes the EXISTING build scripts — it never changes them.

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverDir = path.join(repoRoot, "server");

function run(cmd, cwd) {
  console.log(`\n> ${cmd}   (in ${cwd})`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

console.log("Preparing MyMeal runtime for packaging…");

// Frontend SSR build → dist/client + dist/server/server.js
run("npm run build", repoRoot);

// Backend build → server/dist/index.js (prebuild syncs the SSR report component)
run("npm run build", serverDir);

// Sanity checks before electron-builder copies the runtime.
const required = [
  path.join(repoRoot, "dist", "server", "server.js"),
  path.join(repoRoot, "dist", "client"),
  path.join(serverDir, "dist", "index.js"),
  path.join(serverDir, "node_modules", "prisma", "build", "index.js"),
  path.join(serverDir, "node_modules", "@prisma", "engines"),
];
const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error("\nMissing required build artifacts:\n  " + missing.join("\n  "));
  process.exit(1);
}

console.log("\nRuntime ready. electron-builder will now package it.");
