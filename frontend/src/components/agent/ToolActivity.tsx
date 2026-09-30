"use client";

import { useState } from "react";

import { redactText, toolTarget } from "@/lib/agent-chat";
import type { AgentToolRun } from "@/types";

type ToolActivityProps = {
  results: AgentToolRun[];
};

export function ToolActivity({ results }: ToolActivityProps) {
  const [open, setOpen] = useState(false);
  if (!results.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background/40">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Agent activity
        <span>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <ul className="space-y-2 border-t border-border/70 px-3 py-2 text-sm">
          {results.map((item, index) => (
            <li key={`${item.name}-${index}`} className="rounded-lg bg-muted/40 px-3 py-2">
              <p>
                <span className="text-muted-foreground">Tool:</span> {item.name}
              </p>
              {toolTarget(item) ? (
                <p>
                  <span className="text-muted-foreground">Target:</span> {redactText(toolTarget(item))}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Status:</span> {item.execution_status ?? item.status}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
