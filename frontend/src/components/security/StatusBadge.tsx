import { Ban, CheckCircle2, CircleMinus, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { decisionClassName } from "@/lib/dashboard-data";
import type { SecurityDecision } from "@/types";

const DECISION_ICONS: Record<SecurityDecision, typeof CheckCircle2> = {
  ALLOW: CheckCircle2,
  APPROVAL_REQUIRED: ShieldAlert,
  BLOCK: Ban,
  BYPASS: CircleMinus,
};

const DECISION_LABELS: Record<SecurityDecision, string> = {
  ALLOW: "ALLOW",
  APPROVAL_REQUIRED: "APPROVAL REQUIRED",
  BLOCK: "BLOCK",
  BYPASS: "BYPASS",
};

type StatusBadgeProps = {
  decision: string;
  className?: string;
};

export function StatusBadge({ decision, className }: StatusBadgeProps) {
  const key = decision as SecurityDecision;
  const label = DECISION_LABELS[key] ?? (decision || "UNKNOWN");
  const Icon = DECISION_ICONS[key] ?? CircleMinus;

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
