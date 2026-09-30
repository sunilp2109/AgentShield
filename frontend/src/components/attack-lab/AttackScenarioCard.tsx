"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttackScenario } from "@/types";

type AttackScenarioCardProps = {
  scenario: AttackScenario;
  selected?: boolean;
  running?: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onRun: (id: string) => void;
};

export function AttackScenarioCard({
  scenario,
  selected = false,
  running = false,
  disabled = false,
  onSelect,
  onRun,
}: AttackScenarioCardProps) {
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-4 text-left transition-colors",
        selected ? "border-primary/50 bg-card" : "border-border hover:border-border/80",
      )}
    >
      <button
        type="button"
        className="flex flex-1 flex-col text-left"
        onClick={() => onSelect(scenario.id)}
        aria-pressed={selected}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight">{scenario.name}</h3>
          <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
            {scenario.source_type}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{scenario.description}</p>
        <p className="mt-3 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Risk category {scenario.expected_risk}
        </p>
      </button>
      <Button
        type="button"
        size="sm"
        className="mt-4 w-full"
        disabled={disabled}
        onClick={() => onRun(scenario.id)}
      >
        {running ? "Analyzing..." : "Run Attack"}
      </Button>
    </article>
  );
}
