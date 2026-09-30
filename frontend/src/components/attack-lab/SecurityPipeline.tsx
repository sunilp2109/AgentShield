"use client";

import { cn } from "@/lib/utils";
import type { AttackRunResult } from "@/types";

type SecurityPipelineProps = {
  result: AttackRunResult | null;
};

const STAGES = [
  { id: "content", label: "Untrusted Content" },
  { id: "trust", label: "Trust Engine" },
  { id: "injection", label: "Injection Detector" },
  { id: "risk", label: "Risk Engine" },
  { id: "policy", label: "Policy Engine" },
  { id: "firewall", label: "Action Firewall" },
  { id: "tool", label: "Tool" },
] as const;

function stageValue(result: AttackRunResult | null, id: (typeof STAGES)[number]["id"]): string {
  if (!result) {
    return "—";
  }
  const pipeline = result.pipeline;
  switch (id) {
    case "content":
      return result.source_name || "UNTRUSTED";
    case "trust":
      return pipeline.trust_level || "—";
    case "injection":
      if (pipeline.injection_detected == null) {
        return "—";
      }
      return pipeline.injection_detected ? "DETECTED" : "NOT DETECTED";
    case "risk":
      if (pipeline.risk_score == null && !pipeline.risk_level) {
        return "—";
      }
      return [pipeline.risk_score, pipeline.risk_level].filter((value) => value != null && value !== "").join(" / ");
    case "policy":
      return pipeline.policy_decision || "—";
    case "firewall":
      return pipeline.firewall_decision || result.firewall_decision || "—";
    case "tool":
      if (pipeline.tool_executed == null) {
        return "—";
      }
      return pipeline.tool_executed ? "EXECUTED" : "NOT EXECUTED";
    default:
      return "—";
  }
}

export function SecurityPipeline({ result }: SecurityPipelineProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Security Pipeline">
      <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Security Pipeline</h3>
      <ol className="mt-4 flex flex-wrap items-stretch gap-2">
        {STAGES.map((stage, index) => (
          <li key={stage.id} className="flex min-w-[7.5rem] flex-1 items-stretch gap-2">
            <div className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stage.label}</p>
              <p className={cn("mt-1 text-xs font-semibold", result ? "text-foreground" : "text-muted-foreground")}>
                {stageValue(result, stage.id)}
              </p>
            </div>
            {index < STAGES.length - 1 ? (
              <span className="hidden self-center text-muted-foreground lg:inline" aria-hidden="true">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
