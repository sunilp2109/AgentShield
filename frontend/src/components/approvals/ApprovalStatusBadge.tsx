import { Ban, CheckCircle2, Clock3, ShieldAlert, TimerOff } from "lucide-react";

import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-warning/30 bg-warning/10 text-warning",
  APPROVED: "border-success/30 bg-success/10 text-success",
  EXECUTED: "border-success/30 bg-success/10 text-success",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  EXPIRED: "border-border bg-muted text-muted-foreground",
  EXECUTION_FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  BLOCKED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  EXECUTED: "EXECUTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  EXECUTION_FAILED: "EXECUTION FAILED",
  BLOCKED: "BLOCKED BY POLICY",
};

export function ApprovalStatusBadge({ status, className }: { status: string; className?: string }) {
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const Icon =
    status === "PENDING"
      ? Clock3
      : status === "EXPIRED"
        ? TimerOff
        : status === "REJECTED" || status === "BLOCKED" || status === "EXECUTION_FAILED"
          ? Ban
          : status === "APPROVED" || status === "EXECUTED"
            ? CheckCircle2
            : ShieldAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
        STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
