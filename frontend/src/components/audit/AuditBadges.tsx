import { Ban, CheckCircle2, CircleMinus, Shield, ShieldAlert, ShieldOff } from "lucide-react";

import { decisionClassName } from "@/lib/dashboard-data";
import { decisionLabel, executionLabel } from "@/lib/audit";
import { cn } from "@/lib/utils";

const RISK_STYLES: Record<string, string> = {
  NONE: "border-border bg-muted text-muted-foreground",
  LOW: "border-success/30 bg-success/10 text-success",
  MEDIUM: "border-warning/30 bg-warning/10 text-warning",
  HIGH: "border-destructive/40 bg-destructive/10 text-destructive",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive font-bold",
};

const EXECUTION_STYLES: Record<string, string> = {
  EXECUTED: "border-success/30 bg-success/10 text-success",
  BLOCKED: "border-destructive/30 bg-destructive/10 text-destructive",
  PENDING: "border-warning/30 bg-warning/10 text-warning",
  "NOT EXECUTED": "border-border bg-muted text-muted-foreground",
  ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
};

type BadgeProps = {
  className?: string;
};

export function DecisionBadge({ decision, className }: { decision: string } & BadgeProps) {
  const label = decisionLabel(decision);
  const Icon =
    decision === "ALLOW"
      ? CheckCircle2
      : decision === "APPROVAL_REQUIRED"
        ? ShieldAlert
        : decision === "BLOCK"
          ? Ban
          : CircleMinus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        decisionClassName(decision),
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ExecutionBadge({ status, className }: { status: string | null } & BadgeProps) {
  const label = executionLabel(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        EXECUTION_STYLES[label] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
    </span>
  );
}

export function RiskBadge({
  score,
  level,
  className,
}: {
  score: number | null;
  level: string | null;
} & BadgeProps) {
  if (score == null && !level) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // Format CVSS score: always show one decimal place (e.g. 7.0, 9.4)
  const displayScore = score != null ? score.toFixed(1) : null;
  const cvssTitle = displayScore ? `CVSS ${displayScore} — ${level ?? ""}` : level ?? "";
  return (
    <span
      title={cvssTitle}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        RISK_STYLES[level ?? ""] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {displayScore != null ? <span>{displayScore}</span> : null}
      {level ? <span>{level}</span> : null}
    </span>
  );
}

export function InjectionBadge({ detected, className }: { detected: boolean } & BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        detected
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {detected ? "DETECTED" : "NOT DETECTED"}
    </span>
  );
}

export function ShieldStateBadge({ enabled, className }: { enabled: boolean } & BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        enabled ? "border-success/30 bg-success/10 text-success" : "border-bypass/30 bg-muted text-bypass",
        className,
      )}
    >
      {enabled ? <Shield className="size-3" aria-hidden="true" /> : <ShieldOff className="size-3" aria-hidden="true" />}
      <span>{enabled ? "ON" : "OFF"}</span>
    </span>
  );
}
