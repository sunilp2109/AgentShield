"use client";

import { CHAT_SCENARIOS } from "@/lib/agent-chat";
import { cn } from "@/lib/utils";

type ChatScenariosProps = {
  disabled?: boolean;
  compact?: boolean;
  onFill: (prompt: string) => void;
  onRun?: (prompt: string) => void;
};

export function ChatScenarios({ disabled = false, compact = false, onFill, onRun }: ChatScenariosProps) {
  if (compact) {
    return (
      <div className="mb-2 flex flex-wrap gap-2" aria-label="Demo scenarios">
        {CHAT_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            disabled={disabled}
            onClick={() => onFill(scenario.prompt)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          >
            {scenario.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6 w-full max-w-3xl text-left" aria-label="Demo scenarios">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Demo scenarios</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Real user messages through the agent. AgentShield only acts if the model proposes a tool.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {CHAT_SCENARIOS.map((scenario) => (
          <article
            key={scenario.id}
            className="flex flex-col rounded-2xl border border-border/80 bg-background/60 p-4 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">{scenario.name}</h3>
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide",
                  scenario.expected_risk === "CRITICAL"
                    ? "border-destructive/30 text-destructive"
                    : scenario.expected_risk === "HIGH"
                      ? "border-warning/30 text-warning"
                      : "border-border text-muted-foreground",
                )}
              >
                {scenario.expected_risk}
              </span>
            </div>
            <p className="mt-2 flex-1 text-xs text-muted-foreground">{scenario.description}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={disabled}
                aria-label={`Use ${scenario.name} prompt`}
                onClick={() => onFill(scenario.prompt)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
              >
                Use prompt
              </button>
              {onRun ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Run ${scenario.name}`}
                  onClick={() => onRun(scenario.prompt)}
                  className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
                >
                  Run
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
