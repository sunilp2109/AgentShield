"use client";

import { StatusBadge } from "@/components/security/StatusBadge";
import type { AttackRunResult } from "@/types";

type ToolExecutionEvidenceProps = {
  result: AttackRunResult | null;
};

export function ToolExecutionEvidence({ result }: ToolExecutionEvidenceProps) {
  if (!result || result.tools.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Tool execution evidence">
      <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Tool Execution</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Attempted</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {result.tools.map((tool) => (
              <li key={`attempted-${tool.name}`}>{tool.label || tool.name}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Actual</p>
          <ul className="mt-2 space-y-2">
            {result.tools.map((tool) => (
              <li key={`actual-${tool.name}`} className="flex items-center justify-between gap-2 font-mono text-xs">
                <span>
                  {tool.label || tool.name} → {tool.executed ? "EXECUTED" : tool.execution_status || "NOT EXECUTED"}
                </span>
                {tool.decision ? <StatusBadge decision={tool.decision} /> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
