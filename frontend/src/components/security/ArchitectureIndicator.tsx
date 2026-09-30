import { ArrowDown } from "lucide-react";

const STAGES = [
  { label: "USER", hint: "Human request" },
  { label: "AI AGENT", hint: "Proposes tool calls" },
  { label: "AGENTSHIELD", hint: "Security firewall" },
] as const;

const TOOLS = ["BROWSER", "FILES", "EMAIL"] as const;

export function ArchitectureIndicator() {
  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      aria-label="AgentShield sits between the AI agent and its tools"
    >
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Control path
      </p>
      <div className="mt-4 flex flex-col items-center gap-1 text-center">
        {STAGES.map((stage) => (
          <div key={stage.label} className="flex w-full max-w-md flex-col items-center">
            <div className="w-full rounded-lg border border-border bg-background px-3 py-2">
              <p className="text-sm font-semibold tracking-wide">{stage.label}</p>
              <p className="text-[11px] text-muted-foreground">{stage.hint}</p>
            </div>
            <ArrowDown className="my-1 size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
        ))}
        <div className="grid w-full max-w-md grid-cols-3 gap-2">
          {TOOLS.map((tool) => (
            <div
              key={tool}
              className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-2 text-[11px] font-medium tracking-wide text-primary"
            >
              {tool}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
