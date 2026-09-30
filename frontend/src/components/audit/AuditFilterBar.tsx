"use client";

import { Button } from "@/components/ui/button";
import {
  DECISION_FILTERS,
  INJECTION_FILTERS,
  RISK_FILTERS,
  SHIELD_FILTERS,
  SOURCE_FILTERS,
  type AuditFilters,
} from "@/lib/audit";
import { cn } from "@/lib/utils";

type AuditFilterBarProps = {
  filters: AuditFilters;
  search: string;
  onFiltersChange: (filters: AuditFilters) => void;
  onSearchChange: (value: string) => void;
  onClearSession?: () => void;
};

export function AuditFilterBar({
  filters,
  search,
  onFiltersChange,
  onSearchChange,
  onClearSession,
}: AuditFilterBarProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label="Search / Filters">
      <div>
        <label htmlFor="audit-search" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Search
        </label>
        <input
          id="audit-search"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Tool, action, source, target, request ID, session ID"
          className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <FilterGroup
        label="Decision"
        options={DECISION_FILTERS}
        value={filters.decision}
        onChange={(decision) => onFiltersChange({ ...filters, decision })}
      />
      <FilterGroup
        label="Risk"
        options={RISK_FILTERS}
        value={filters.riskLevel}
        onChange={(riskLevel) => onFiltersChange({ ...filters, riskLevel })}
      />
      <FilterGroup
        label="Injection"
        options={INJECTION_FILTERS}
        value={filters.injection}
        onChange={(injection) =>
          onFiltersChange({ ...filters, injection: injection as AuditFilters["injection"] })
        }
      />
      <FilterGroup
        label="Shield"
        options={SHIELD_FILTERS}
        value={filters.shield}
        onChange={(shield) => onFiltersChange({ ...filters, shield: shield as AuditFilters["shield"] })}
      />
      <FilterGroup
        label="Source"
        options={SOURCE_FILTERS}
        value={filters.sourceType}
        onChange={(sourceType) => onFiltersChange({ ...filters, sourceType })}
      />
      {filters.sessionId ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Session filter: <span className="font-mono text-foreground">{filters.sessionId}</span>
          </p>
          {onClearSession ? (
            <Button type="button" size="xs" variant="outline" onClick={onClearSession}>
              Clear session
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id || "all"}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              value === option.id
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
