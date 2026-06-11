// Status / control card for the Oracle CMS roster sync.
// Renders nothing when the server has no Oracle configured (e.g. the plain
// web deployment), so it only appears on installations that integrate with
// the customer's HRMS. Run button is shown only to users who can edit
// employees (admin/operator — mirrors the API's requireRole).

import { Database, Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useCmsSyncStatus, useRunCmsSync } from "@/lib/hooks";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function CmsSyncCard() {
  const { can } = useSession();
  const { data: status } = useCmsSyncStatus();
  const run = useRunCmsSync();

  if (!status?.configured) return null;

  const last = status.lastRun;
  const busy = status.running || run.isPending;
  const canRun = can("employees", "edit");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Database className="h-4 w-4 text-primary" />
        CMS Sync
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            status.enabled
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {status.enabled ? `auto · every ${status.intervalMin} min` : "manual only"}
        </span>
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing from Oracle…
          </>
        ) : last ? (
          <>
            {last.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <span>
              Last sync {new Date(last.finishedAt).toLocaleString()} —{" "}
              {last.ok
                ? `${last.fetched} fetched · ${last.created} new · ${last.updated} updated` +
                  (last.skipped ? ` · ${last.skipped} skipped` : "") +
                  (last.stale ? ` · ${last.stale} stale` : "")
                : (last.error ?? "failed")}
            </span>
          </>
        ) : (
          <span>Never synced on this server.</span>
        )}
      </div>

      {run.isError && !busy && (
        <span className="text-destructive">
          {run.error instanceof Error ? run.error.message : "Sync failed"}
        </span>
      )}

      {canRun && (
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={busy}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium",
            "hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
          Sync now
        </button>
      )}
    </div>
  );
}
