"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuditEventDetail } from "@/components/audit/AuditEventDetail";
import { AuditEventTable } from "@/components/audit/AuditEventTable";
import { AuditFilterBar } from "@/components/audit/AuditFilterBar";
import { AuditMetrics } from "@/components/audit/AuditMetrics";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_POLL_INTERVAL_MS,
  AUDIT_SEARCH_DEBOUNCE_MS,
  EMPTY_AUDIT_FILTERS,
  countNewEventIds,
  searchEvents,
  toAuditQuery,
  type AuditFilters,
} from "@/lib/audit";
import { getAuditEvents, getAuditStats } from "@/lib/security-api";
import { cn } from "@/lib/utils";
import type { AuditStats, LoadState, SecurityEvent } from "@/types";

type AuditLogsViewProps = {
  pollIntervalMs?: number;
  pageSize?: number;
};

type PageResult = {
  incoming: SecurityEvent[];
  hasNext: boolean;
  stats: AuditStats;
};

async function requestPage(filters: AuditFilters, nextOffset: number, pageSize: number): Promise<PageResult> {
  const [nextEvents, nextStats] = await Promise.all([
    getAuditEvents(toAuditQuery(filters, nextOffset, pageSize)),
    getAuditStats(),
  ]);
  return {
    incoming: nextEvents.slice(0, pageSize),
    hasNext: nextEvents.length >= pageSize,
    stats: nextStats,
  };
}

export function AuditLogsView({
  pollIntervalMs = AUDIT_POLL_INTERVAL_MS,
  pageSize = AUDIT_PAGE_SIZE,
}: AuditLogsViewProps) {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [statsError, setStatsError] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<SecurityEvent | null>(null);
  const [newEventIds, setNewEventIds] = useState<string[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const eventsRef = useRef<SecurityEvent[] | null>(null);
  const offsetRef = useRef(0);
  const filtersRef = useRef(filters);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const applyPage = useCallback((page: PageResult, nextOffset: number, previous: SecurityEvent[] | null) => {
    if (nextOffset === 0) {
      const freshIds = countNewEventIds(previous, page.incoming);
      setNewEventIds(freshIds);
      setUnseenCount((count) => count + freshIds.length);
    }
    offsetRef.current = nextOffset;
    eventsRef.current = page.incoming;
    setOffset(nextOffset);
    setEvents(page.incoming);
    setHasNext(page.hasNext);
    setStats(page.stats);
    setStatsError(false);
    setConnected(true);
    setStale(false);
    setStatus(page.incoming.length === 0 ? "empty" : "success");
  }, []);

  const applyError = useCallback(() => {
    setConnected(false);
    setStatsError(true);
    if (eventsRef.current) {
      setStale(true);
      setStatus("success");
    } else {
      setStatus("error");
    }
  }, []);

  const load = useCallback(
    async (nextOffset?: number) => {
      const useOffset = nextOffset ?? offsetRef.current;
      try {
        const page = await requestPage(filtersRef.current, useOffset, pageSize);
        applyPage(page, useOffset, eventsRef.current);
      } catch {
        applyError();
      }
    },
    [applyError, applyPage, pageSize],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), AUDIT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void requestPage(filters, 0, pageSize)
      .then((page) => {
        if (!cancelled) {
          applyPage(page, 0, eventsRef.current);
        }
      })
      .catch(() => {
        if (!cancelled) {
          applyError();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyError, applyPage, filters, pageSize]);

  useEffect(() => {
    if (pollIntervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void load();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [load, pollIntervalMs]);

  const visible = useMemo(() => searchEvents(events ?? [], search), [events, search]);

  const filterSession = useCallback((sessionId: string) => {
    setSelected(null);
    setFilters((current) => ({ ...current, sessionId }));
  }, []);

  const copyRequestId = useCallback(async (requestId: string) => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopyFeedback("Copied");
    } catch {
      setCopyFeedback("Copy failed");
    }
    window.setTimeout(() => setCopyFeedback(null), 1500);
  }, []);

  return (
    <PageContainer
      title="Security Audit Logs"
      subtitle="Trace agent actions, security decisions, and tool execution."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            "inline-flex items-center gap-2 text-xs font-medium",
            connected ? "text-success" : "text-muted-foreground",
          )}
          role="status"
        >
          <span className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground/70")} />
          {connected ? "Audit system connected" : connected === false ? "Audit system unavailable" : "Connecting..."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {pollIntervalMs > 0 ? (
            <span className="text-xs text-muted-foreground">Auto-refresh ON</span>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            Refresh now
          </Button>
        </div>
      </div>

      <AuditFilterBar
        filters={filters}
        search={searchInput}
        onFiltersChange={(next) => setFilters(next)}
        onSearchChange={setSearchInput}
        onClearSession={() => setFilters((current) => ({ ...current, sessionId: "" }))}
      />

      <AuditMetrics stats={stats} loading={status === "loading" && !stats} error={statsError && !stats} />

      {unseenCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm">
            {unseenCount} new event{unseenCount === 1 ? "" : "s"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setUnseenCount(0);
              setNewEventIds([]);
              void load(0);
            }}
          >
            View new events
          </Button>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4" aria-label="Security Event Table">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Security events</h3>
          {stale ? <p className="text-xs text-muted-foreground">Showing previously loaded events.</p> : null}
        </div>
        {status === "loading" ? <AuditEventTable events={[]} loading onSelect={() => undefined} /> : null}
        {status === "error" ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive" role="alert">
              Unable to load audit events.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => void load(0)}>
              Retry
            </Button>
          </div>
        ) : null}
        {status === "empty" ? (
          <div>
            <p className="text-sm text-muted-foreground">
              {filters.decision ||
              filters.riskLevel ||
              filters.injection !== "ALL" ||
              filters.shield !== "ALL" ||
              filters.sourceType ||
              filters.sessionId
                ? "No matching events for this filter."
                : "No security events recorded yet."}
            </p>
            {!filters.decision &&
            !filters.riskLevel &&
            filters.injection === "ALL" &&
            filters.shield === "ALL" &&
            !filters.sourceType &&
            !filters.sessionId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Run an action from the Dashboard or Attack Lab to generate events.
              </p>
            ) : null}
          </div>
        ) : null}
        {status === "success" && visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching events for this search.</p>
        ) : null}
        {status === "success" && visible.length > 0 ? (
          <AuditEventTable
            events={visible}
            selectedId={selected?.id}
            newEventIds={newEventIds}
            onSelect={setSelected}
          />
        ) : null}
        {status === "success" ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => void load(Math.max(0, offset - pageSize))}
            >
              Previous
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!hasNext} onClick={() => void load(offset + pageSize)}>
              Next
            </Button>
          </div>
        ) : null}
      </section>

      <AuditEventDetail
        event={selected}
        onClose={() => setSelected(null)}
        onFilterSession={filterSession}
        onCopyRequestId={(id) => void copyRequestId(id)}
        copyFeedback={copyFeedback}
      />
    </PageContainer>
  );
}
