import { OverviewMetricCard } from "@/components/security/OverviewMetricCard";
import type { AuditStats } from "@/types";

type AuditMetricsProps = {
  stats: AuditStats | null;
  loading?: boolean;
  error?: boolean;
};

export function AuditMetrics({ stats, loading = false, error = false }: AuditMetricsProps) {
  const state = loading ? "loading" : error && !stats ? "error" : "ready";
  const cards = [
    { label: "Total Events", value: stats?.total_events },
    { label: "Allowed", value: stats?.allowed },
    { label: "Approval Required", value: stats?.approval_required },
    { label: "Blocked", value: stats?.blocked },
    { label: "Prompt Injections", value: stats?.injections_detected },
    { label: "Critical Events", value: stats?.critical_events },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Security Metrics">
      {cards.map((card) => (
        <OverviewMetricCard
          key={card.label}
          label={card.label}
          value={state === "ready" ? (card.value ?? 0) : null}
          state={state}
          errorMessage="Statistics unavailable"
        />
      ))}
    </section>
  );
}
