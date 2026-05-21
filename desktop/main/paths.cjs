// Resolves where the runtime payload (built frontend + backend) lives.
//
// - Dev / run-from-source: the repo root (two levels up from desktop/main).
// - Packaged: resources/runtime, populated by electron-builder `extraResources`.
//
// The layout is identical in both cases so web-server.mjs (which expects
// ./dist next to it) and the API (cwd = server/, for Prisma) just work.

const path = require("path");
const { app } = require("electron");

function runtimeRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "runtime");
  return path.resolve(__dirname, "..", "..");
}

function paths() {
  const root = runtimeRoot();
  const serverDir = path.join(root, "server");
  return {
    root,
    serverDir,
    webServer: path.join(root, "web-server.mjs"),
    apiEntry: path.join(serverDir, "dist", "index.js"),
    prismaSchema: path.join(serverDir, "prisma", "schema.prisma"),
    prismaCli: path.join(serverDir, "node_modules", "prisma", "build", "index.js"),
    prismaEnginesDir: path.join(serverDir, "node_modules", "@prisma", "engines"),
    distServer: path.join(root, "dist", "server", "server.js"),
    distClient: path.join(root, "dist", "client"),
  };
}

module.exports = { runtimeRoot, paths };
