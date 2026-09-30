import { cn } from "@/lib/utils";

type OverviewMetricCardProps = {
  label: string;
  value?: string | number | null;
  hint?: string;
  state?: "loading" | "ready" | "empty" | "error";
  errorMessage?: string;
  className?: string;
};

export function OverviewMetricCard({
  label,
  value,
  hint,
  state = "ready",
  errorMessage = "Statistics unavailable",
  className,
}: OverviewMetricCardProps) {
  const displayValue = value == null || value === "" ? "—" : value;

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80",
        className,
      )}
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      {state === "loading" ? (
        <div className="mt-3 h-7 w-16 animate-pulse rounded bg-muted" data-testid="metric-skeleton" />
      ) : null}
      {state === "error" ? (
        <div className="mt-2">
          <p className="text-2xl font-semibold tracking-tight text-muted-foreground">—</p>
          <p className="mt-1 text-xs text-destructive">{errorMessage}</p>
        </div>
      ) : null}
      {state === "empty" ? (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-muted-foreground">—</p>
      ) : null}
      {state === "ready" ? (
        <p className="mt-2 text-2xl font-semibold tracking-tight">{displayValue}</p>
      ) : null}
      {hint && state === "ready" ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </article>
  );
}
