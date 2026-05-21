# MyMeal — Windows Desktop

A thin Electron shell that runs the **existing** MyMeal full-stack app locally:
the same SSR frontend (`dist/`) and the same Express + Prisma API (`server/`),
spawned as child processes. Nothing about the web deployment changes — this is
purely additive.

## How it works

On launch the desktop app:

1. Reads its saved config (`config.json` in the per-user app-data folder).
2. **First run** → shows a **Setup screen** asking for the PostgreSQL connection
   (host, port, user, password, database) plus the first admin account. It can
   also create the database if it doesn't exist yet.
3. Applies Prisma migrations, starts the API and the SSR web server on the
   configured ports, then opens the app window.
4. **Later runs** → reads the saved config and goes straight to the app.

Everything that used to be hard-coded — the database location, the API port,
the web port — is configurable from the UI (**File → Settings…**), because the
target users are non-technical. The config is persisted, so first-time setup
never repeats.

### Where settings are stored

`%APPDATA%\mymeals-desktop\config.json` (e.g.
`C:\Users\<you>\AppData\Roaming\mymeals-desktop\config.json`). It holds the DB
connection, the two local ports, and a generated JWT secret. Delete this file to
force the setup screen to appear again. It is **never** part of the installer.

## Prerequisites

- **PostgreSQL** running somewhere reachable (this PC or a LAN server). You
  provide the connection on the setup screen — the app does not install Postgres.
- For building: **Node 18+** and the repo's dependencies installed
  (`npm install` at the repo root and in `server/`).

## Run from source (development)

From the repo root, build the frontend and backend once (the desktop app runs
the built output, exactly like production):

```bash
npm run build                 # repo root → dist/client + dist/server
cd server && npm run build    # → server/dist  (also runs `prisma generate` via your normal flow)
```

Then launch the shell:

```bash
cd desktop
npm install
npm start
```

The Setup screen appears on first run. Use **Test connection** to validate the
database before saving.

> Smoke test (no GUI interaction needed), against the DB in `server/.env`:
> `npx electron scripts/test-provision.cjs`

## Build installers

```bash
cd desktop
npm run dist          # → desktop/release/  (NSIS setup .exe + portable .exe, x64)
```

`npm run dist` first runs `scripts/prepare-runtime.cjs`, which calls the repo's
existing build scripts (it never modifies them), then runs `electron-builder`.
Outputs:

- `MyMeal-<version>-nsis.exe` — one-click-style installer with Start-Menu and
  desktop shortcuts and an uninstaller.
- `MyMeal-<version>-portable.exe` — single self-contained executable.

The bundled runtime layout (under `resources/runtime/`) mirrors the repo so
`web-server.mjs` and the API resolve their paths unchanged. `server/.env` is
**not** bundled — secrets stay out of the installer; all config comes from the
setup screen / `config.json`.

### Optional: styled-PDF reports (Puppeteer / Chromium)

XLSX and pdfkit reports work out of the box. The *styled* PDF report renders via
Puppeteer's Chromium, which lives outside `node_modules` and so isn't bundled by
default. To include it:

1. Download Chromium into a bundleable folder:
   ```bash
   # from desktop/
   set PUPPETEER_CACHE_DIR=%CD%\..\puppeteer-cache   # PowerShell: $env:PUPPETEER_CACHE_DIR="..\puppeteer-cache"
   npx puppeteer browsers install chrome
   ```
2. Add this line to the `build.extraResources` array in `package.json`:
   ```json
   { "from": "../puppeteer-cache", "to": "runtime/puppeteer-cache" }
   ```
3. Rebuild. At runtime the app auto-detects `runtime/puppeteer-cache` and points
   Puppeteer at it (see `main/servers.cjs`).

## What this adds to the shared code (and why it's safe)

Three small, guarded edits in the shared codebase — all no-ops for the web
deployment:

- `src/lib/api.ts` — prefers a runtime API base (`window.__MEALOPS_API_BASE__`
  on the client, `process.env.MEALOPS_API_BASE` on the server) over the
  build-time `VITE_API_BASE`. Falls back to the original value when neither is
  set.
- `web-server.mjs` — injects `window.__MEALOPS_API_BASE__` into served HTML only
  when `MEALOPS_API_BASE` is set. Unset in production → identical behaviour.
- `server/src/routes/setup.ts` + `server/src/index.ts` — a `/api/setup` router
  for first-run provisioning, mounted **only** when `MEALOPS_DESKTOP=1`. The web
  server never sets that, so the route doesn't exist there.
