import { safeDisplay } from "@/lib/audit";
import type { SecurityEvent } from "@/types";

type AuditDecisionTimelineProps = {
  event: SecurityEvent;
};

export function AuditDecisionTimeline({ event }: AuditDecisionTimelineProps) {
  const stages = [
    { label: "Source", value: event.source_type },
    { label: "Trust", value: event.trust_level },
    {
      label: "Injection",
      value: event.injection_detected ? "INJECTION DETECTED" : "NOT DETECTED",
    },
    {
      label: "Risk",
      value:
        event.risk_score != null || event.risk_level
          ? `RISK ${[event.risk_score, event.risk_level].filter((item) => item != null && item !== "").join(" / ")}`
          : null,
    },
    { label: "Policy", value: event.policy_decision },
    { label: "Firewall", value: event.firewall_decision ? `FIREWALL ${event.firewall_decision}` : null },
    { label: "Execution", value: event.execution_status },
  ];

  return (
    <ol className="space-y-2" aria-label="Security decision timeline">
      {stages.map((stage, index) => (
        <li key={stage.label}>
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stage.label}</p>
          <p className="text-sm font-medium">{safeDisplay(stage.value)}</p>
          {index < stages.length - 1 ? (
            <p className="text-muted-foreground" aria-hidden="true">
              ↓
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
