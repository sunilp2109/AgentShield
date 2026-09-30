import type { AuditStats, LoadState } from "@/types";

type ThreatSummaryProps = {
  stats: AuditStats | null;
  status: LoadState;
};

export function ThreatSummary({ stats, status }: ThreatSummaryProps) {
  const injections = stats?.injections_detected ?? 0;
  const blocked = stats?.blocked ?? 0;
  const critical = stats?.critical_events ?? 0;
  const noThreats = status === "success" && injections === 0 && blocked === 0 && critical === 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Threat activity">
      <h2 className="text-sm font-medium">Threat Activity</h2>
      <p className="text-xs text-muted-foreground">Actual detections from the audit log</p>
      {status === "loading" ? (
        <div className="mt-4 space-y-2" data-testid="threat-skeleton">
          <div className="h-5 animate-pulse rounded bg-muted" />
          <div className="h-5 animate-pulse rounded bg-muted" />
        </div>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-destructive">Statistics unavailable</p>
      ) : null}
      {status === "empty" ? (
        <p className="mt-3 text-sm text-muted-foreground">Statistics unavailable</p>
      ) : null}
      {status === "success" && noThreats ? (
        <p className="mt-3 text-sm text-muted-foreground">No threats detected.</p>
      ) : null}
      {status === "success" && !noThreats ? (
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Prompt Injections</dt>
            <dd className="font-medium tabular-nums">{injections}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Blocked Actions</dt>
            <dd className="font-medium tabular-nums">{blocked}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Critical Events</dt>
            <dd className="font-medium tabular-nums">{critical}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
