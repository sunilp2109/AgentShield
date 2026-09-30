import { toolActivityCounts } from "@/lib/dashboard-data";
import { formatToolLabel } from "@/lib/format-time";
import type { LoadState, SecurityEvent } from "@/types";

type ToolActivityProps = {
  events: SecurityEvent[] | null;
  status: LoadState;
};

export function ToolActivity({ events, status }: ToolActivityProps) {
  const counts = toolActivityCounts(events ?? []);

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Tool activity">
      <h2 className="text-sm font-medium">Tool Activity</h2>
      <p className="text-xs text-muted-foreground">From recent audit events</p>
      {status === "loading" ? (
        <div className="mt-4 space-y-2" data-testid="tool-activity-skeleton">
          <div className="h-5 animate-pulse rounded bg-muted" />
          <div className="h-5 animate-pulse rounded bg-muted" />
        </div>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-destructive">Unable to load security activity.</p>
      ) : null}
      {status === "empty" || (status === "success" && counts.length === 0) ? (
        <p className="mt-3 text-sm text-muted-foreground">No security activity yet.</p>
      ) : null}
      {status === "success" && counts.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {counts.map((item) => (
            <li key={item.tool} className="flex items-center justify-between text-sm">
              <span>{formatToolLabel(item.tool)}</span>
              <span className="tabular-nums text-muted-foreground">{item.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
