// Copies the frontend's ReportPreview source into server/src/ssr/ so the
// scheduler can render it server-side without the tsc rootDir gymnastics that
// commit e8e7c7f previously fixed. Run via `npm run sync-ssr` (also wired into
// predev/prebuild so re-syncing happens automatically before tsx/tsc starts).

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, "..");
const repoRoot = resolve(serverRoot, "..");

const targets: { from: string; to: string }[] = [
  {
    from: resolve(repoRoot, "src/components/app/report-preview-types.ts"),
    to: resolve(serverRoot, "src/ssr/report-preview-types.ts"),
  },
  {
    from: resolve(repoRoot, "src/components/app/ReportPreview.tsx"),
    to: resolve(serverRoot, "src/ssr/ReportPreview.tsx"),
  },
];

async function main() {
  await mkdir(resolve(serverRoot, "src/ssr"), { recursive: true });
  for (const { from, to } of targets) {
    await copyFile(from, to);
    console.log(`[sync-ssr] ${from} -> ${to}`);
  }
}

main().catch((e) => {
  console.error("[sync-ssr] failed:", e);
  process.exit(1);
});
