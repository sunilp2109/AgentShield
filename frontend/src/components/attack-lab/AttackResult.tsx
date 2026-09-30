"use client";

import { StatusBadge } from "@/components/security/StatusBadge";
import { attackHeadline } from "@/lib/attack-lab";
import { cn } from "@/lib/utils";
import type { AttackRunResult } from "@/types";

type AttackResultProps = {
  result: AttackRunResult | null;
  running?: boolean;
};

export function AttackResult({ result, running = false }: AttackResultProps) {
  if (running) {
    return (
      <section className="rounded-xl border border-border bg-card p-6" aria-label="Result" aria-busy="true">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Result</h3>
        <p className="mt-4 text-2xl font-semibold tracking-tight">Analyzing...</p>
        <p className="mt-1 text-sm text-muted-foreground">Waiting for the AgentShield pipeline.</p>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="rounded-xl border border-border bg-card p-6" aria-label="Result">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Result</h3>
        <p className="mt-4 text-sm text-muted-foreground">Run an attack to see the live pipeline decision.</p>
      </section>
    );
  }

  const headline = attackHeadline(result);
  const auditRecorded = Boolean(result.audit_event_id || result.audit_event_ids.length);

  return (
    <section className="rounded-xl border border-border bg-card p-6" aria-label="Result">
      <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Result</h3>
      <p
        className={cn(
          "mt-4 text-4xl font-semibold tracking-tight",
          result.firewall_decision === "BLOCK" && "text-destructive",
          result.firewall_decision === "BYPASS" && "text-bypass",
          result.firewall_decision === "APPROVAL_REQUIRED" && "text-warning",
          result.firewall_decision === "ALLOW" && "text-success",
        )}
      >
        {headline}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {result.firewall_decision ? <StatusBadge decision={result.firewall_decision} /> : null}
        {result.risk_score != null || result.risk_level ? (
          <span className="text-sm text-muted-foreground">
            Risk: {result.risk_score ?? "—"}
            {result.risk_level ? ` — ${result.risk_level}` : ""}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Risk: —</span>
        )}
      </div>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ResultField label="Injection" value={result.injection_detected ? "DETECTED" : "NOT DETECTED"} />
        <ResultField label="Policy" value={result.policy_decision || "—"} />
        <ResultField label="Firewall" value={result.firewall_decision || "—"} />
        <ResultField label="Tool" value={result.tool_execution ? "EXECUTED" : "NOT EXECUTED"} />
        <ResultField label="Audit" value={auditRecorded ? "RECORDED" : "—"} />
        {result.approval_created ? (
          <ResultField label="Approval Required" value={result.approval_id || "PENDING"} />
        ) : null}
      </dl>
      {result.reason ? <p className="mt-4 text-sm text-muted-foreground">{result.reason}</p> : null}
      {auditRecorded ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Audit event {result.audit_event_id ?? result.audit_event_ids[0]}
        </p>
      ) : null}
    </section>
  );
}

function ResultField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
