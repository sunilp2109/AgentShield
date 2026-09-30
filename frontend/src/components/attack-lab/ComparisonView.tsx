"use client";

import { attackHeadline } from "@/lib/attack-lab";
import type { AttackRunResult } from "@/types";

type ComparisonViewProps = {
  baseline: AttackRunResult | null;
  protectedResult: AttackRunResult | null;
};

export function ComparisonView({ baseline, protectedResult }: ComparisonViewProps) {
  if (!baseline || !protectedResult) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Comparison">
      <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Comparison</h3>
      <p className="mt-1 text-xs text-muted-foreground">Same scenario, same payload. Only Shield state changed.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ComparisonColumn title="BASELINE" result={baseline} />
        <ComparisonColumn title="PROTECTED" result={protectedResult} />
      </div>
    </section>
  );
}

function ComparisonColumn({ title, result }: { title: string; result: AttackRunResult }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{attackHeadline(result)}</p>
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        <li>{result.tool_execution ? "Tool attempted" : "Tool prevented"}</li>
        <li>
          {result.shield_enabled
            ? result.injection_detected
              ? "Injection detected"
              : "Enforcement active"
            : "No enforcement"}
        </li>
        {result.shield_enabled && result.risk_level ? <li>Risk: {result.risk_level}</li> : null}
        {!result.shield_enabled ? <li>Firewall: {result.firewall_decision || "BYPASS"}</li> : null}
      </ul>
    </div>
  );
}
