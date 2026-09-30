import { OverviewMetricCard } from "@/components/security/OverviewMetricCard";
import type { ApprovalCounts } from "@/lib/approvals";

type ApprovalMetricsProps = {
  counts: ApprovalCounts | null;
  loading: boolean;
  error: boolean;
};

export function ApprovalMetrics({ counts, loading, error }: ApprovalMetricsProps) {
  const state = loading ? "loading" : error && !counts ? "error" : "ready";
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Approval summary">
      <OverviewMetricCard label="Pending Approvals" value={counts?.pending} state={state} />
      <OverviewMetricCard label="Approved" value={counts?.approved} state={state} />
      <OverviewMetricCard label="Rejected" value={counts?.rejected} state={state} />
      <OverviewMetricCard label="Expired" value={counts?.expired} state={state} />
    </section>
  );
}
