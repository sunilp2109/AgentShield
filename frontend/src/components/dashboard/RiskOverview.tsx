import { RISK_CLASSNAMES, riskDistribution } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import type { AuditStats, SecurityEvent } from "@/types";

const BUCKETS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

type RiskOverviewProps = {
  stats: AuditStats | null;
  events: SecurityEvent[] | null;
  loading?: boolean;
  error?: string;
};

export function RiskOverview({ stats, events, loading = false, error }: RiskOverviewProps) {
  const distribution = riskDistribution(stats, events);
  const max = Math.max(1, ...BUCKETS.map((bucket) => distribution[bucket]));

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Risk overview">
      <h2 className="text-sm font-medium">Risk Overview</h2>
      <p className="text-xs text-muted-foreground">From AgentShield audit statistics</p>
      {loading ? (
        <div className="mt-4 space-y-2" data-testid="risk-skeleton">
          {BUCKETS.map((bucket) => (
            <div key={bucket} className="h-5 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : error && !stats ? (
        <p className="mt-3 text-sm text-destructive">Statistics unavailable</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {BUCKETS.map((bucket) => (
            <li key={bucket} className="grid grid-cols-[72px_1fr_32px] items-center gap-2 text-xs">
              <span className="font-medium tracking-wide text-muted-foreground">{bucket}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-300", RISK_CLASSNAMES[bucket])}
                  style={{ width: `${(distribution[bucket] / max) * 100}%` }}
                />
              </div>
              <span className="text-right font-medium tabular-nums">{distribution[bucket]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
