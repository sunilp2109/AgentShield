"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AttackPayload } from "@/components/attack-lab/AttackPayload";
import { AttackResult } from "@/components/attack-lab/AttackResult";
import { AttackScenarioList } from "@/components/attack-lab/AttackScenarioList";
import { ComparisonView } from "@/components/attack-lab/ComparisonView";
import { SecurityPipeline } from "@/components/attack-lab/SecurityPipeline";
import { ToolExecutionEvidence } from "@/components/attack-lab/ToolExecutionEvidence";
import { ConnectionBanner } from "@/components/dashboard/ConnectionBanner";
import { PageContainer } from "@/components/layout/PageContainer";
import { useShield } from "@/components/security/SecurityConsoleProvider";
import { Button } from "@/components/ui/button";
import {
  applyComparison,
  attackErrorMessage,
  canShowComparison,
  DEFAULT_ATTACK_SCENARIO_ID,
  type ComparisonSlot,
} from "@/lib/attack-lab";
import { getAttackScenarios, runAttack } from "@/lib/security-api";
import { cn } from "@/lib/utils";
import type { AttackRunResult, AttackScenario } from "@/types";

export function AttackLabView() {
  const { enabled, loading: shieldLoading, connected, refresh } = useShield();
  const runningRef = useRef(false);
  const [scenarios, setScenarios] = useState<AttackScenario[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(DEFAULT_ATTACK_SCENARIO_ID);
  const [result, setResult] = useState<AttackRunResult | null>(null);
  const [comparisons, setComparisons] = useState<Record<string, ComparisonSlot>>({});
  const [running, setRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const loadScenarios = useCallback(async () => {
    try {
      const items = await getAttackScenarios();
      setScenarios(items);
      setLoadError(null);
      setSelectedId((current) => {
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items.find((item) => item.id === DEFAULT_ATTACK_SCENARIO_ID)?.id ?? items[0]?.id ?? null;
      });
    } catch (error) {
      setLoadError(attackErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAttackScenarios()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setScenarios(items);
        setLoadError(null);
        setSelectedId((current) => {
          if (current && items.some((item) => item.id === current)) {
            return current;
          }
          return items.find((item) => item.id === DEFAULT_ATTACK_SCENARIO_ID)?.id ?? items[0]?.id ?? null;
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(attackErrorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => scenarios.find((item) => item.id === selectedId) ?? null,
    [scenarios, selectedId],
  );
  const comparison = selectedId ? comparisons[selectedId] : undefined;
  const backendDown = !shieldLoading && connected === false;
  const protectedNow = connected !== false && enabled === true && !shieldLoading;
  const baselineNow = connected !== false && enabled === false && !shieldLoading;

  const execute = useCallback(
    async (scenarioId: string) => {
      if (runningRef.current) {
        return;
      }
      runningRef.current = true;
      setSelectedId(scenarioId);
      setRunning(true);
      setRunError(null);
      setResult(null);
      try {
        const next = await runAttack(scenarioId);
        setResult(next);
        setComparisons((current) => ({
          ...current,
          [scenarioId]: applyComparison(current[scenarioId], next),
        }));
        void refresh();
      } catch (error) {
        setResult(null);
        setRunError(attackErrorMessage(error));
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [refresh],
  );

  const resetComparison = useCallback(() => {
    setComparisons({});
  }, []);

  return (
    <PageContainer
      title="Attack Lab"
      subtitle="Controlled Prompt-Injection Testing"
    >
      <p className="text-sm text-muted-foreground">
        Run simulated attacks against the agent and observe how AgentShield responds.
      </p>
      <ConnectionBanner visible={backendDown || Boolean(loadError)} onRetry={() => void loadScenarios()} />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Shield Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                protectedNow && "bg-success",
                baselineNow && "bg-bypass",
                !protectedNow && !baselineNow && "bg-muted-foreground/70",
              )}
              aria-hidden="true"
            />
            <p className="text-lg font-semibold tracking-tight">
              {shieldLoading ? "LOADING" : protectedNow ? "PROTECTED" : baselineNow ? "BASELINE" : "STATUS UNKNOWN"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {shieldLoading
              ? "Waiting for AgentShield backend to report protection state."
              : protectedNow
                ? "AgentShield security controls are active."
                : baselineNow
                  ? "AgentShield enforcement is disabled."
                  : "Protection status cannot be verified."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => selectedId && void execute(selectedId)}
            disabled={running || !selectedId}
          >
            {running ? "Analyzing..." : "Run Selected Attack"}
          </Button>
          <Button type="button" variant="outline" onClick={resetComparison} disabled={running}>
            Reset Comparison
          </Button>
        </div>
      </section>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <AttackScenarioList
        scenarios={scenarios}
        selectedId={selectedId}
        runningId={running && selectedId ? selectedId : null}
        disabled={running}
        onSelect={setSelectedId}
        onRun={(id) => void execute(id)}
      />

      <AttackPayload scenario={selected} />

      {selected ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void execute(selected.id)} disabled={running}>
            {running ? "Analyzing..." : "Run Attack"}
          </Button>
        </div>
      ) : null}

      <SecurityPipeline result={running ? null : result} />
      <AttackResult result={result} running={running} />
      {runError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3" role="alert">
          <p className="text-sm font-medium text-destructive">{runError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => selectedId && void execute(selectedId)}>
            Retry
          </Button>
        </div>
      ) : null}
      <ToolExecutionEvidence result={running ? null : result} />
      {comparison && canShowComparison(comparison) ? (
        <ComparisonView baseline={comparison.baseline} protectedResult={comparison.protected} />
      ) : null}
    </PageContainer>
  );
}
