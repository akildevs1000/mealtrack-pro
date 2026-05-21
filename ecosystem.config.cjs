// PM2 process file. Run from the project root with:  pm2 start ecosystem.config.cjs
// Each process inherits its own cwd so relative paths (Prisma client, .env, .output) resolve correctly.
//
// Node version pinning: the system Node on this server is too old for Vite 7 / TanStack Start.
// We use nvm to install Node 22 just for this project, and tell PM2 to spawn each app with that
// binary via `interpreter`. Override on the server by exporting MEALOPS_NODE_BIN before
// `pm2 start`, e.g.:  MEALOPS_NODE_BIN=$(which node) pm2 start ecosystem.config.cjs
const NODE_BIN = process.env.MEALOPS_NODE_BIN || process.execPath;

module.exports = {
  apps: [
    {
      name: "mymeals-api",
      cwd: "./server",
      script: "dist/index.js",
      interpreter: NODE_BIN,
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: "mymeals-web",
      cwd: "./",
      // web-server.mjs is our thin Node listener around the TanStack Start SSR build at
      // dist/server/server.js. Vite emits dist/client/ (static) + dist/server/server.js
      // (fetch handler) for this project; the wrapper serves the former and pipes the latter.
      script: "web-server.mjs",
      interpreter: NODE_BIN,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "8044",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
