"use client";

import type { AttackScenario } from "@/types";

type AttackPayloadProps = {
  scenario: AttackScenario | null;
};

export function AttackPayload({ scenario }: AttackPayloadProps) {
  if (!scenario) {
    return (
      <section className="rounded-xl border border-border bg-card p-4" aria-label="Selected Attack">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Selected Attack</h3>
        <p className="mt-2 text-sm text-muted-foreground">Select a scenario to inspect its untrusted content.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Selected Attack">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Selected Attack</h3>
        <span className="rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-warning">
          UNTRUSTED CONTENT
        </span>
      </div>
      <p className="mt-2 text-sm font-medium">{scenario.name}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{scenario.source_name}</p>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {scenario.payload}
      </pre>
    </section>
  );
}
