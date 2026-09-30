import { cn } from "@/lib/utils";

const RISK_STYLES: Record<string, string> = {
  LOW: "text-success",
  MEDIUM: "text-warning",
  HIGH: "text-destructive",
  CRITICAL: "text-destructive",
};

type ApprovalRiskIndicatorProps = {
  score: number | null;
  level: string | null;
  className?: string;
};

export function ApprovalRiskIndicator({ score, level, className }: ApprovalRiskIndicatorProps) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className={cn("text-sm font-semibold tracking-wide", RISK_STYLES[level ?? ""] ?? "text-foreground")}>
        {level ?? "Not recorded"}
      </p>
      <p className="text-xs text-muted-foreground">{score == null ? "—" : `${score} / 100`}</p>
    </div>
  );
}
