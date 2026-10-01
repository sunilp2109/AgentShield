"use client";

import { motion } from "framer-motion";

import { StatusBadge } from "@/components/security/StatusBadge";
import { Button } from "@/components/ui/button";
import { ACTIVITY_FILTERS, type ActivityFilter } from "@/lib/dashboard";
import { filterActivityEvents } from "@/lib/dashboard-data";
import { safeDisplay } from "@/lib/audit";
import { formatRelativeTime, formatSourceLabel } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import type { LoadState, SecurityEvent } from "@/types";

type LiveActivityPanelProps = {
  events?: SecurityEvent[];
  status: LoadState;
  errorMessage?: string;
  filter?: ActivityFilter;
  onFilterChange?: (filter: ActivityFilter) => void;
  newEventIds?: string[];
  onRetry?: () => void;
};

export function LiveActivityPanel({
  events = [],
  status,
  errorMessage,
  filter = "ALL",
  onFilterChange,
  newEventIds = [],
  onRetry,
}: LiveActivityPanelProps) {
  const visible = filterActivityEvents(events, filter);
  const emptyAfterFilter = status === "success" && visible.length === 0;

  return (
    <section className="rounded-xl border border-border bg-card" aria-label="Live activity">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">Recent Security Activity</h2>
          <p className="text-xs text-muted-foreground">Events recorded by the Action Firewall</p>
        </div>
        {onFilterChange ? (
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Activity filters">
            {ACTIVITY_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => onFilterChange(item.id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  filter === item.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className="p-4">
        {status === "loading" ? <ActivitySkeleton /> : null}
        {status === "error" ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive" role="alert">
              {errorMessage ?? "Unable to load security activity."}
            </p>
            {onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {status === "empty" || emptyAfterFilter ? (
          <div>
            <p className="text-sm text-muted-foreground">
              {emptyAfterFilter && events.length > 0
                ? "No matching events for this filter."
                : "No security activity yet."}
            </p>
            {status === "empty" || events.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                AgentShield events will appear here when the agent performs actions.
              </p>
            ) : null}
          </div>
        ) : null}
        {status === "success" && visible.length > 0 ? (
          <ul className="space-y-2">
            {visible.map((event) => {
              const isNew = newEventIds.includes(event.id);
              return (
                <motion.li
                  key={event.id}
                  initial={isNew ? { opacity: 0, y: -6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {formatSourceLabel(event.source_type)} → {event.tool_name}
                    </p>
                    {event.user_intent ? (
                      <p className="truncate font-mono text-xs text-muted-foreground/90 mt-0.5" title={event.user_intent}>
                        "{safeDisplay(event.user_intent)}"
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      CVSS {event.risk_score != null ? event.risk_score.toFixed(1) : "n/a"}
                      {event.risk_level ? ` · ${event.risk_level}` : ""} ·{" "}
                      {formatRelativeTime(event.timestamp)}
                    </p>
                  </div>
                  <StatusBadge decision={event.firewall_decision} />
                </motion.li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true" data-testid="activity-skeleton">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}
