"use client";

import Link from "next/link";
import { useState } from "react";

import { ConnectionBanner } from "@/components/dashboard/ConnectionBanner";
import { DecisionTimeline } from "@/components/dashboard/DecisionTimeline";
import { PendingApprovalsPreview } from "@/components/dashboard/PendingApprovalsPreview";
import { RiskOverview } from "@/components/dashboard/RiskOverview";
import { ThreatSummary } from "@/components/dashboard/ThreatSummary";
import { ToolActivity } from "@/components/dashboard/ToolActivity";
import { LiveActivityPanel } from "@/components/security/LiveActivityPanel";
import { OverviewMetricCard } from "@/components/security/OverviewMetricCard";
import { SecurityStatusCard } from "@/components/security/SecurityStatusCard";
import { useDashboardData } from "@/components/security/SecurityConsoleProvider";
import { PageContainer } from "@/components/layout/PageContainer";
import type { ActivityFilter } from "@/lib/dashboard";
import type { LoadState } from "@/types";

export function DashboardView() {
  const { loading, connected, shieldEnabled, stats, events, approvals, errors, refresh, newEventIds } =
    useDashboardData();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL");

  const activityStatus: LoadState = loading
    ? "loading"
    : errors.events && !events
      ? "error"
      : !events || events.length === 0
        ? "empty"
        : "success";

  const statsStatus: LoadState = loading
    ? "loading"
    : errors.stats && !stats
      ? "error"
      : stats
        ? "success"
        : "empty";

  const approvalStatus: LoadState = loading
    ? "loading"
    : errors.approvals && !approvals
      ? "error"
      : !approvals || approvals.length === 0
        ? "empty"
        : "success";

  const metricState = (hasError?: string, hasValue?: boolean): "loading" | "ready" | "empty" | "error" => {
    if (loading) return "loading";
    if (hasError && !hasValue) return "error";
    if (!hasValue) return "empty";
    return "ready";
  };

  return (
    <PageContainer
      title="Agent Security Overview"
      subtitle="Real-time protection and agent activity"
    >
      <ConnectionBanner visible={!loading && connected === false} onRetry={() => void refresh()} />
      <div className="grid gap-4 lg:grid-cols-3">
        <SecurityStatusCard className="lg:col-span-3" />
        <OverviewMetricCard
          label="Threats Blocked"
          value={stats?.blocked}
          state={metricState(errors.stats, stats != null)}
        />
        <OverviewMetricCard
          label="Prompt Injections"
          value={stats?.injections_detected}
          state={metricState(errors.stats, stats != null)}
        />
        <Link
          href="/approvals"
          className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <OverviewMetricCard
            label="Pending Approvals"
            value={approvals?.length}
            state={metricState(errors.approvals, approvals != null)}
          />
        </Link>
        <OverviewMetricCard
          label="Total Tool Actions"
          value={stats?.total_events}
          state={metricState(errors.stats, stats != null)}
        />
        <OverviewMetricCard
          label="Critical Events"
          value={stats?.critical_events}
          state={metricState(errors.stats, stats != null)}
        />
        <OverviewMetricCard
          label="Average Risk"
          value={stats?.average_risk_score ?? undefined}
          hint={stats?.average_risk_score != null ? "From recorded events" : undefined}
          state={metricState(
            errors.stats,
            stats != null && stats.average_risk_score != null,
          )}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LiveActivityPanel
            events={events ?? []}
            status={activityStatus}
            errorMessage={errors.events}
            filter={activityFilter}
            onFilterChange={setActivityFilter}
            newEventIds={newEventIds}
            onRetry={() => void refresh()}
          />
        </div>
        <div className="grid gap-4 xl:col-span-2">
          <ThreatSummary stats={stats} status={statsStatus} />
          <PendingApprovalsPreview approvals={approvals} status={approvalStatus} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RiskOverview stats={stats} events={events} loading={loading} error={errors.stats} />
        <ToolActivity events={events} status={activityStatus} />
      </div>
      <DecisionTimeline events={events} status={activityStatus} />
      <p className="sr-only">
        Shield {shieldEnabled ? "enabled" : shieldEnabled === false ? "disabled" : "unknown"}
      </p>
    </PageContainer>
  );
}
