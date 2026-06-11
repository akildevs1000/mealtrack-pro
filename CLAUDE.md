# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"MyMeal / MyMeals" — a meal-distribution / QR-scan verification dashboard for labour camps. It is a **full-stack app**:

- **Frontend** (`src/`) — TanStack Start (SSR React 19) on Vite 7, shadcn/ui (new-york) + Tailwind v4.
- **Backend** (`server/`) — Express + Prisma + PostgreSQL REST API on `:5044`.

The frontend talks to the backend over HTTP — there is **no more mock data driving the UI** (see _Data layer_). The old `src/lib/mock-data.ts` / `src/lib/cms-employees.ts` are legacy; only `defaultSchedule` (a form default) is still imported, in `routes/camps.tsx`.

## Commands

Use **npm / npx / tsx** — do NOT invoke `bun` in this project, even though `bun.lock` / `bunfig.toml` exist. (`package-lock.json` is the source of truth; deploys run `npm ci`.) `bunfig.toml`'s 24h supply-chain guard only applies to `bun`, so it does not affect the npm-based deploy.

**Frontend** (repo root):

- `npm run dev` — Vite dev server (`:8080`).
- `npm run build` — production SSR build → `dist/server` + `dist/client`.
- `npm run lint` — ESLint. `npm run format` — Prettier write.

**Backend** (`cd server`):

- `npm run dev` — API with `tsx watch` (`:5044`).
- `npm run build` — `tsc` → `dist/index.js` (a `prebuild` runs `sync-ssr`, which copies `src/components/app/ReportPreview.tsx` + types into `server/src/ssr/`).
- `npm run seed` — seed camps/employees/devices/managers/users/permissions/scans.
- `npx prisma migrate dev --name X` (create migration) · `npx prisma migrate deploy` (apply) · `npx prisma generate`.

There is no unit-test runner. `server/scripts/test-manager-flow.ts` and `test-device-flow.ts` are end-to-end API smoke tests — run with `npx tsx scripts/<file>.ts` against a running server.

## Architecture

### Frontend ↔ backend wiring

- `src/lib/api.ts` — fetch wrapper. Bearer token in `localStorage` (`mymeals.token.v1`); base URL from `VITE_API_BASE` (default `http://localhost:5044/api`). A 401 clears the token.
- `src/lib/hooks.ts` — React Query hooks for every resource (`useCamps`, `useEmployees`, `useScans`, `useOverview`, `useReportConsumption`, `useSchedules`, `useMailConfig`, …). **Add data access here**, not ad-hoc `fetch`.

### Build/runtime wiring (non-obvious)

- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which **already bundles** `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, the Cloudflare plugin, the `@` alias, React/TanStack dedupe, and dev/host config. **Do not re-add these plugins manually** — duplicates will break the app. Extend via `defineConfig({ vite: { ... } })` only.
- The SSR server entry is `src/server.ts` (not the default TanStack one); `vite.config.ts` redirects via `tanstackStart.server.entry = "server"`. The build emits `dist/server/server.js`. **In production this is served by `web-server.mjs` (a thin Node listener) under PM2 — not Cloudflare Workers.** `wrangler.jsonc` exists but is not the production runtime (see _Deployment_).
- `src/server.ts` wraps the TanStack handler to recover from a specific h3 failure mode: h3 swallows in-handler throws into a JSON 500 `{"unhandled":true,"message":"HTTPError"}` that `try/catch` cannot observe. The wrapper inspects the response body, detects this shape, pulls the real error from `src/lib/error-capture.ts` (global `error`/`unhandledrejection` listener, 5s TTL), and returns the branded HTML from `src/lib/error-page.ts`.
- `src/start.ts` registers a `requestMiddleware` that converts any non-HTTP throw inside loaders/server functions into the same branded 500 page. Preserve `statusCode`-bearing errors (TanStack redirects/notFound) — don't catch those.
- `server-only` (the Next.js package) is **banned** by ESLint. For server-only frontend modules use the `*.server.ts` suffix or `@tanstack/react-start/server-only`.

### Routing

File-based routing under `src/routes/` (TanStack Router). `src/routeTree.gen.ts` is **generated** — never edit it; add/rename a file under `src/routes/` and let the dev server regenerate it. `src/router.tsx` wires a `QueryClient` into the router context. Routes are flat; chrome lives in `__root.tsx` → `AppLayout`. `/` redirects to `/overview`.

### Auth, RBAC, and camp scoping

Auth is **real JWT**, backed by the server:

- `src/lib/session.tsx` (`SessionProvider` / `useSession`) loads the current user from `GET /api/auth/me`, and exposes `login(username, password)`, `logout()`, `refresh()`, `currentUser`, `can(tab, action?)`, and `campScope`. `src/components/app/Login.tsx` is the login screen.
- **Four roles** — `admin`, `operator`, `user`, `manager`. The permission matrix lives in the DB (`RolePermission` table, backfilled by `ensureDefaultPermissions` on server boot) and is admin-editable on `/users`. `can(tab, action?)` gates the UI (e.g. `AppLayout` hides sidebar tabs).
- **`campScope` / `useCampScope()`** returns `string[] | null` (`null` = all camps; managers are scoped to their `assignedCampCode`). **The server is the source of truth** — `campScopeOf()` in `server/src/middleware/auth.ts` filters every scoped endpoint, so client gating is UX only, never a security boundary.

### Data layer

All data is **real**, served by the Prisma/PostgreSQL backend. Reports (`/api/reports/*`, `/api/overview`) are computed from real `Scan` / `Camp` / `CmsEmployee` / `Device` rows. The audit, drilldown, and forecast pages read live `/api/reports/*` data; the employee report reads the real `CmsEmployee` roster.

**Two camp-coding schemes that do NOT join:** `Camp.code` is `AD-01` / `DXB-04`; `CmsEmployee.campCode` is `CAMP 19`. There is no mapping between them. Consequence: a manager's `assignedCampCode` (an `AD-01`-style code) never matches `CmsEmployee.campCode`, so **managers currently see an empty employee roster** (and the Employee report is keyed to the CMS scheme). Don't invent a mapping — it's a pending product decision.

## Backend (`server/`)

Express + Prisma (PostgreSQL). Entry `server/src/index.ts` mounts routers under `/api/*` and starts the scheduler.

- **Routes** (`server/src/routes/`): `auth`, `camps`, `employees`, `devices`, `managers`, `users`, `scans`, `overview`, `audit`, `scanner`, `reports`, `schedules`, `ftp-config`, `mail-config`, `cms-sync`. All hit Prisma; auth via `requireAuth` / `requireRole` (`server/src/middleware/auth.ts`).
- **CMS Oracle sync** (`server/src/lib/cms-oracle.ts` + `cms-sync.ts`, worker `scheduler/cms-sync-worker.ts`, route `/api/cms-sync`): pulls the customer's `CMS_EMPLOYEE_MASTER` (Oracle HRMS, SID `hrms`, port 1521) and **upserts** it into `CmsEmployee` keyed on `laborId`. Uses `oracledb` in **thin mode** (no Instant Client needed). Connection + column mapping are env-driven (`ORACLE_CMS_*`, see `server/.env.example`); the worker is a no-op unless `CMS_SYNC_ENABLED=1` **and** Oracle is configured. It UPSERTs (never wipes — unlike `/api/employees/import`, which wipes and would cascade-delete `MealRecord` history). **Must run on the whitelisted CMS Application Server** — Oracle :1521 only accepts that host's IP. Smoke-test: `npx tsx scripts/test-cms-sync.ts [--write]`. NB: the unresolved `Camp.code` ↔ `CmsEmployee.campCode` scheme gap (see _Data layer_) is unaffected by this sync — CMS data still uses the `CAMP 19` scheme.
- **Scanner** (`/api/scanner/*`): the Android scanner flow — device-gate by MAC, manager PIN login (separate scanner JWT), and `/scan` (eligibility + meal-window + duplicate checks → upserts `MealRecord`, records `Scan`).
- **Scheduler** (`server/src/scheduler/worker.ts`): in-process cron, ticks every 60s, runs due `Schedule` rows via `server/src/lib/schedule-runner.ts`. **Schedule times are Asia/Dubai** — `computeNextRunAt` anchors to Dubai regardless of host timezone (see _Gotchas_).
- **Delivery**: email via `server/src/lib/mailer.ts` (nodemailer, transport built per-send from the `MailConfig` DB row); FTP via `basic-ftp` (creds from the `FtpConfig` DB row). Both config singletons are managed at `/api/mail-config` and `/api/ftp-config`.
- **Reports**: `server/src/lib/report-data.ts` does the real aggregation; styled PDFs render via Puppeteer + `server/src/ssr/ReportPreview.tsx` (`report-pdf-styled.ts`); XLSX via `report-files.ts`. `time.ts` centralises all Asia/Dubai conversions.
- **Env**: `server/.env` (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`) — **gitignored**.

## Deployment

Production runs on a Node droplet (`139.59.69.241`) under **PM2** (`ecosystem.config.cjs`): `mymeals-api` (`server/dist/index.js`) and `mymeals-web` (`web-server.mjs` serving the Vite SSR build). Node 22 via nvm. `dist/` is gitignored — **the server builds from the git checkout.**

Deploy with the committed script (run on the server): `bash /var/www/mealtrack-pro/deploy.sh` — it does `git pull` → `npm ci` (root + server) → `npx prisma migrate deploy` → `npm run build` (both) → `pm2 restart all` → health-check. `set -euo pipefail`, so it stops on the first error.

- **New npm package** → committed `package-lock.json` must be in sync (`npm ci` fails otherwise); `npm ci` then installs it automatically. `@prisma/client`'s postinstall regenerates the client during `npm ci`.
- **New migration** → `prisma migrate deploy` applies all pending migrations forward-only (never resets). Review the generated SQL before pushing; never hand-edit the live DB schema (causes drift).
- **Env safety** → `server/.env` is gitignored and FTP/SMTP creds live in the DB, so `git pull`/deploy **never overwrite secrets**. The only tracked env file is `.env.production` (`VITE_API_BASE`, a public URL).

## Desktop app (Windows)

`desktop/` is an **Electron** shell that runs the **same** frontend + backend locally — it's purely additive; the web deployment is unaffected. Its own `package.json` (Electron + electron-builder + `pg`) is **separate from the root** — never add Electron to the root deps (it'd bloat `npm ci` on the server). See `desktop/README.md`.

- **How it runs** (`desktop/main/`): the main process spawns the built API (`server/dist/index.js`) and the SSR web server (`web-server.mjs`) as child processes using Electron's own binary in Node mode (`ELECTRON_RUN_AS_NODE=1`), so no separate Node is shipped. `paths.cjs` resolves the runtime root (repo root in dev; `resources/runtime` when packaged). `servers.cjs` orchestrates: ensure/create DB → `prisma migrate deploy` → start API → health-check → bootstrap admin → start web. `logger.cjs` tees everything to `%APPDATA%/mymeals-desktop/desktop.log`.
- **Config** lives in `%APPDATA%/mymeals-desktop/config.json` (DB connection, `apiPort`, `webPort`, generated `jwtSecret`) — written on first run, never bundled. Delete it to force first-run setup.
- **Setup flow** (`desktop/renderer/`): first launch shows Welcome → **New** (create DB + migrate + create admin) or **Existing** (require DB + apply pending migrations only). **Settings → Database & Ports…** (`Ctrl+S`) reopens it to reconfigure; **View Logs…** (`Ctrl+L`) opens the log viewer; **Network Address…** shows the LAN URL.
- **Network access**: the web server binds `0.0.0.0` and reverse-proxies `/api/*` to `127.0.0.1:apiPort`, so any LAN device opens `http://<pc-ip>:webPort` through one port (no CORS, backend stays internal). The browser client uses a relative `/api` base; SSR still uses the absolute `MEALOPS_API_BASE`.
- **Shared-code hooks (all no-ops without the desktop env vars)** — `src/lib/api.ts` prefers a runtime API base (`window.__MEALOPS_API_BASE__` client / `process.env.MEALOPS_API_BASE` SSR) over build-time `VITE_API_BASE`; `web-server.mjs` injects that client base + proxies `/api` only when `MEALOPS_API_PROXY`/`MEALOPS_API_BASE` are set; `server/src/routes/setup.ts` (the `/api/setup` bootstrap router) is mounted only when `MEALOPS_DESKTOP=1`.
- **Build**: `cd desktop && npm run dist` → `scripts/prepare-runtime.cjs` rebuilds both apps, then electron-builder emits `desktop/release/MyMeal-Setup-${version}.exe` (NSIS) + `MyMeal-${version}-portable.exe`. The runtime (incl. `server/node_modules` with the Prisma Windows engines) ships via `extraResources` **outside asar**, so native binaries load; `server/.env` is **not** bundled. Styled-PDF reports need Chromium bundled separately (opt-in steps in the README); XLSX/pdfkit work without it.

## Gotchas

- **Scheduler timezone**: schedule `HH:MM` is Dubai wall-clock. `computeNextRunAt` does the calendar math in a "Dubai-shifted" `Date` (constant UTC+4) so it's host-timezone-independent. If you see runs firing N hours off, it's a TZ regression here.
- **Prisma client staleness**: after any `schema.prisma` change, run `npx prisma generate` and restart. Config routes/libs use `const p = prisma as any`, so a missing model on a stale client surfaces as a **runtime 500, not a compile error** (and `prisma migrate status` will still say "up to date"). On Windows, `prisma generate` throws `EPERM` while the dev server holds the engine DLL — stop the server first.

## UI conventions

- shadcn/ui components in `src/components/ui/` (style "new-york", base "slate"). Add new ones with the shadcn CLI rather than hand-writing.
- App-specific components in `src/components/app/`.
- Path alias: `@/*` → `src/*`. Class merging: `cn()` from `@/lib/utils`.
- Theme: dark mode toggles `.dark` on `<html>` (see `AppLayout`); CSS variables drive colors — prefer tokens like `bg-background`, `text-foreground`, `bg-sidebar-accent` over raw colors.
- Prettier: 100-col, double quotes, semis, trailing commas — match this when editing.
