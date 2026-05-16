// PM2 process file. Run from the project root with:  pm2 start ecosystem.config.cjs
// Each process inherits its own cwd so relative paths (Prisma client, .env, .output) resolve correctly.
module.exports = {
  apps: [
    {
      name: "mealops-api",
      cwd: "./server",
      script: "dist/index.js",
      env: {
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: "mealops-web",
      cwd: "./",
      script: ".output/server/index.mjs",
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
