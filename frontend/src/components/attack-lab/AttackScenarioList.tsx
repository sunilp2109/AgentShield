"use client";

import { AttackScenarioCard } from "@/components/attack-lab/AttackScenarioCard";
import type { AttackScenario } from "@/types";

type AttackScenarioListProps = {
  scenarios: AttackScenario[];
  selectedId: string | null;
  runningId?: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onRun: (id: string) => void;
};

export function AttackScenarioList({
  scenarios,
  selectedId,
  runningId = null,
  disabled = false,
  onSelect,
  onRun,
}: AttackScenarioListProps) {
  return (
    <section aria-label="Attack Scenarios" className="space-y-3">
      <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Attack Scenarios</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {scenarios.map((scenario) => (
          <AttackScenarioCard
            key={scenario.id}
            scenario={scenario}
            selected={scenario.id === selectedId}
            running={runningId === scenario.id}
            disabled={disabled}
            onSelect={onSelect}
            onRun={onRun}
          />
        ))}
      </div>
    </section>
  );
}
