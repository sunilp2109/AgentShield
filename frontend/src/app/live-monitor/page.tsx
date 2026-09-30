"use client";

import { DecisionTimeline } from "@/components/dashboard/DecisionTimeline";
import { LiveActivityPanel } from "@/components/security/LiveActivityPanel";
import { useDashboardData } from "@/components/security/SecurityConsoleProvider";
import { PageContainer } from "@/components/layout/PageContainer";
import type { LoadState } from "@/types";

export default function LiveMonitorPage() {
  return <LiveMonitorView />;
}

function LiveMonitorView() {
  const { loading, events, errors, refresh, newEventIds } = useDashboardData();
  const status: LoadState = loading
    ? "loading"
    : errors.events && !events
      ? "error"
      : !events || events.length === 0
        ? "empty"
        : "success";

  return (
    <PageContainer
      title="Live Monitor"
      subtitle="Recent Action Firewall decisions"
    >
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LiveActivityPanel
            events={events ?? []}
            status={status}
            errorMessage={errors.events}
            newEventIds={newEventIds}
            onRetry={() => void refresh()}
          />
        </div>
        <div className="xl:col-span-2">
          <DecisionTimeline events={events} status={status} />
        </div>
      </div>
    </PageContainer>
  );
}
