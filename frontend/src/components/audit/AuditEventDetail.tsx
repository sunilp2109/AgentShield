"use client";

import { useEffect } from "react";

import { AuditDecisionTimeline } from "@/components/audit/AuditDecisionTimeline";
import {
  DecisionBadge,
  ExecutionBadge,
  InjectionBadge,
  RiskBadge,
  ShieldStateBadge,
} from "@/components/audit/AuditBadges";
import { Button } from "@/components/ui/button";
import { safeDisplay } from "@/lib/audit";
import { formatSourceLabel } from "@/lib/format-time";
import type { SecurityEvent } from "@/types";

type AuditEventDetailProps = {
  event: SecurityEvent | null;
  onClose: () => void;
  onFilterSession: (sessionId: string) => void;
  onCopyRequestId: (requestId: string) => void;
  copyFeedback?: string | null;
};

export function AuditEventDetail({
  event,
  onClose,
  onFilterSession,
  onCopyRequestId,
  copyFeedback,
}: AuditEventDetailProps) {
  useEffect(() => {
    if (!event) {
      return;
    }
    const onKey = (keyboard: KeyboardEvent) => {
      if (keyboard.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close event details"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-event-title"
        className="relative z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="audit-event-title" className="text-lg font-semibold tracking-tight">
              Event Details
            </h3>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{event.id}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <Detail label="Timestamp" value={safeDisplay(event.timestamp)} />
          <div>
            <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Request ID</dt>
            <dd className="mt-1 flex items-center gap-2 font-mono text-xs">
              <span>{safeDisplay(event.request_id)}</span>
              <Button type="button" size="xs" variant="outline" onClick={() => onCopyRequestId(event.request_id)}>
                Copy
              </Button>
              {copyFeedback ? <span className="text-muted-foreground">{copyFeedback}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Session ID</dt>
            <dd className="mt-1">
              <button
                type="button"
                className="font-mono text-xs underline-offset-2 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => onFilterSession(event.session_id)}
              >
                {safeDisplay(event.session_id)}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase flex items-center justify-between">
              <span>Agent Prompt</span>
              {event.user_intent ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-5 px-1.5 text-[10px]"
                  aria-label="Copy prompt"
                  onClick={() => {
                    void navigator.clipboard.writeText(event.user_intent ?? "");
                  }}
                >
                  Copy prompt
                </Button>
              ) : null}
            </dt>
            <dd className="mt-1 rounded-lg border border-border/80 bg-muted/40 p-2.5 font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {safeDisplay(event.user_intent)}
            </dd>
          </div>
          <Detail label="Source type" value={formatSourceLabel(event.source_type)} />
          <Detail label="Source name" value={safeDisplay(event.source_name)} />
          <Detail label="Trust level" value={safeDisplay(event.trust_level)} />
          <Detail label="Tool" value={safeDisplay(event.tool_name)} />
          <Detail label="Action" value={safeDisplay(event.action)} />
          <Detail label="Target resource" value={safeDisplay(event.target_resource)} />
          <Detail label="Destination type" value={safeDisplay(event.destination_type)} />
          <div className="flex flex-wrap gap-2">
            <InjectionBadge detected={event.injection_detected} />
            <RiskBadge score={event.risk_score} level={event.risk_level} />
            <DecisionBadge decision={event.policy_decision} />
            <DecisionBadge decision={event.firewall_decision} />
            <ExecutionBadge status={event.execution_status} />
            <ShieldStateBadge enabled={event.shield_enabled} />
          </div>
          <Detail label="Injection confidence" value={safeDisplay(event.injection_confidence)} />
          <Detail label="Approval required" value={event.approval_required ? "Yes" : "No"} />
          <Detail label="Reason" value={safeDisplay(event.block_reason)} />
        </dl>
        <div className="mt-6 rounded-xl border border-border bg-background/50 p-3">
          <AuditDecisionTimeline event={event} />
        </div>
      </aside>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}
