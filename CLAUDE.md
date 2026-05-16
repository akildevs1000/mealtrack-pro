# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **bun** (see `bun.lock`, `bunfig.toml`). Scripts:

- `bun run dev` — Vite dev server.
- `bun run build` — production build (Cloudflare worker target).
- `bun run build:dev` — build with dev mode (source-map friendly).
- `bun run preview` — preview the built worker.
- `bun run lint` — ESLint over the repo.
- `bun run format` — Prettier write.

There is no test runner configured.

`bunfig.toml` enforces a 24-hour supply-chain guard (`minimumReleaseAge`). When adding a dep, do not bypass it via `minimumReleaseAgeExcludes` without explicit confirmation.

## Architecture

This is a **TanStack Start** (SSR React) app targeting **Cloudflare Workers**, built on Vite 7 and React 19, with shadcn/ui (style: new-york) on Tailwind v4. The product is "MealOps" — a meal-distribution / QR-scan verification dashboard for labour camps. **All data is currently mocked** in `src/lib/` — there is no backend integration.

### Build/runtime wiring (non-obvious)

- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which **already bundles** `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, the Cloudflare plugin, the `@` alias, React/TanStack dedupe, and dev/host config. **Do not re-add these plugins manually** — duplicates will break the app. Extend via `defineConfig({ vite: { ... } })` only.
- The Cloudflare worker entry is `src/server.ts` (not the default TanStack one). `vite.config.ts` redirects via `tanstackStart.server.entry = "server"`; `wrangler.jsonc` also points `main` at `src/server.ts`. Both are required — `wrangler.jsonc` alone is insufficient because `@cloudflare/vite-plugin` builds from the Vite config.
- `src/server.ts` wraps the TanStack handler to recover from a specific h3 failure mode: h3 swallows in-handler throws into a JSON 500 `{"unhandled":true,"message":"HTTPError"}` that `try/catch` cannot observe. The wrapper inspects the response body, detects this shape, pulls the real error from `src/lib/error-capture.ts` (which listens on `error` / `unhandledrejection` globally with a 5s TTL), and returns the branded HTML from `src/lib/error-page.ts`.
- `src/start.ts` registers a `requestMiddleware` that converts any non-HTTP throw inside loaders/server functions into the same branded 500 page. Preserve `statusCode`-bearing errors (TanStack redirects/notFound) — don't catch those.
- `server-only` (the Next.js package) is **banned** by ESLint (`no-restricted-imports`). For server-only modules use the `*.server.ts` suffix or `@tanstack/react-start/server-only`.

### Routing

File-based routing under `src/routes/` (TanStack Router). `src/routeTree.gen.ts` is **generated** — never edit it. The plugin auto-regenerates it from filenames; just add/rename a file under `src/routes/` and let the dev server pick it up. `src/router.tsx` wires a `QueryClient` into the router context so loaders can use React Query.

Routes are flat (no nested layouts); the chrome lives in `__root.tsx` → `AppLayout`. `/` redirects to `/overview`.

### Session, RBAC, and camp scoping

`src/lib/session.tsx` is the linchpin for access control. It's a `localStorage`-backed (`mealops.session.v1`) React context exposing:

- **Four roles** — `admin`, `operator`, `user`, `manager` — with a per-role `TabKey → {view, edit, delete}` permission matrix (`DEFAULT_PERMS`). Permissions are user-editable on the `/users` route and persist to localStorage.
- **`useSession().can(tab, action?)`** — gate UI on permissions. `AppLayout` already filters the sidebar via `can(key, "view")`; route components should additionally guard edit/delete actions.
- **`useCampScope()`** — returns `string[] | null`. `null` means "all camps"; an array means restrict to those `campCode`s. **Every list/report/chart that surfaces camp-bound data must respect this scope.** Pattern (see `routes/overview.tsx`, `routes/employees.tsx`): `const scope = useCampScope(); const visible = scope ? data.filter(d => scope.includes(d.campCode)) : data;`. Managers are scoped to their `assignedCampCode`; admin/operator/user see everything.
- A header dropdown lets you hot-swap the active user — used to demo RBAC without auth.

### Data layer

There is no API. Two mock-data modules:

- `src/lib/mock-data.ts` — camps, KPIs, hourly/weekly trends, recent scans. Use this for dashboard/overview-style data.
- `src/lib/cms-employees.ts` — employee roster plus `buildMealLog(emp, from, to)` / `summarize(records)`. The mock log uses a seeded RNG keyed on `laborId` so an employee's history is **deterministic across renders** — don't replace with `Math.random()` if you need stable output.

Note the two domains use different camp identifiers: `mock-data.camps[].code` looks like `AD-01` / `DXB-04`, while `cms-employees[].campCode` looks like `CAMP 19`. They are intentionally separate seed data and don't join.

### UI conventions

- shadcn/ui components in `src/components/ui/` (style "new-york", base "slate"). Add new ones with the shadcn CLI rather than hand-writing.
- App-specific components in `src/components/app/`.
- Path alias: `@/*` → `src/*`.
- Class merging: use `cn()` from `@/lib/utils`.
- Theme: dark mode is toggled by adding `.dark` to `<html>` (see `AppLayout`); CSS variables drive colors — prefer tokens like `bg-background`, `text-foreground`, `bg-sidebar-accent` over raw colors.
- Prettier: 100-col, double quotes, semis, trailing commas — match this when editing.
