"use client";

import Link from "next/link";

import { primaryEvent } from "@/lib/agent-chat";
import type { AgentToolRun, SecurityEvent } from "@/types";

type SecurityNoticeProps = {
  decision: "BLOCK" | "APPROVAL_REQUIRED" | "BYPASS" | "ALLOW";
  results: AgentToolRun[];
  events: SecurityEvent[];
};

export function SecurityNotice({ decision, results, events }: SecurityNoticeProps) {
  const event = primaryEvent(events);
  const lead = results.find((item) => item.decision === decision) ?? results[0];
  const riskLevel = event?.risk_level ?? lead?.risk_level;
  const riskScore = event?.risk_score ?? lead?.risk_score;
  const injection = event?.injection_detected;
  const toolName = event?.tool_name ?? lead?.name;
  const execution = event?.execution_status ?? lead?.execution_status;

  if (decision === "ALLOW") {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        AgentShield · Action allowed
      </p>
    );
  }

  if (decision === "BYPASS") {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        AgentShield · Baseline / Bypass
        {execution ? ` · ${execution}` : ""}
      </p>
    );
  }

  if (decision === "APPROVAL_REQUIRED") {
    const approvalId = lead?.approval_id ?? event?.id;
    return (
      <section
        className="rounded-2xl border border-warning/30 bg-warning/8 px-4 py-3"
        aria-label="Approval required"
      >
        <p className="text-xs font-medium tracking-wide text-warning">AgentShield</p>
        <h3 className="mt-1 text-sm font-semibold">Action requires human approval</h3>
        <dl className="mt-2 grid gap-1 text-sm text-muted-foreground">
          {riskLevel ? (
            <div>
              <dt className="inline text-foreground/80">Risk:</dt> <dd className="inline">{String(riskLevel)}</dd>
            </div>
          ) : null}
          {toolName ? (
            <div>
              <dt className="inline text-foreground/80">Tool:</dt> <dd className="inline">{toolName}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline text-foreground/80">Status:</dt> <dd className="inline">WAITING FOR APPROVAL</dd>
          </div>
        </dl>
        <Link
          href="/approvals"
          className="mt-3 inline-flex text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Review in Approvals
        </Link>
        {approvalId ? <span className="sr-only">Approval {approvalId}</span> : null}
      </section>
    );
  }

  const riskLabel =
    riskScore != null && riskLevel ? `${riskScore} / ${riskLevel}` : riskLevel ? String(riskLevel) : null;

  return (
    <section
      className="rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3"
      aria-label="Security action blocked"
    >
      <p className="text-xs font-medium tracking-wide text-destructive">AgentShield</p>
      <h3 className="mt-1 text-sm font-semibold">Action blocked</h3>
      <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
        {injection === true ? (
          <div>
            <dt className="inline text-foreground/80">Prompt injection:</dt> <dd className="inline">Detected</dd>
          </div>
        ) : null}
        {riskLabel ? (
          <div>
            <dt className="inline text-foreground/80">Risk:</dt> <dd className="inline">{riskLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline text-foreground/80">Policy:</dt> <dd className="inline">{event?.policy_decision ?? "BLOCK"}</dd>
        </div>
        <div>
          <dt className="inline text-foreground/80">Firewall:</dt> <dd className="inline">{event?.firewall_decision ?? "BLOCK"}</dd>
        </div>
        <div>
          <dt className="inline text-foreground/80">Tool:</dt>{" "}
          <dd className="inline">{execution && execution !== "EXECUTED" ? "NOT EXECUTED" : execution ?? "NOT EXECUTED"}</dd>
        </div>
      </dl>
    </section>
  );
}

