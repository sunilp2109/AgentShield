"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  getAuditEvents,
  getAuditStats,
  getHealthStatus,
  getPendingApprovals,
  getShieldStatus,
  readShieldEnabled,
  setShieldEnabled as postShieldEnabled,
} from "@/lib/security-api";
import { DASHBOARD_EVENT_LIMIT, DASHBOARD_POLL_INTERVAL_MS } from "@/lib/dashboard";
import { mergeSecurityEvents } from "@/lib/dashboard-data";
import type { ApprovalRequest, AuditStats, SecurityEvent } from "@/types";

type ConsoleErrors = {
  health?: string;
  shield?: string;
  stats?: string;
  events?: string;
  approvals?: string;
  toggle?: string;
};

type ConsoleState = {
  loading: boolean;
  updating: boolean;
  connected: boolean | null;
  shieldEnabled: boolean | null;
  feedback: string | null;
  stats: AuditStats | null;
  events: SecurityEvent[] | null;
  pendingApprovals: ApprovalRequest[] | null;
  newEventIds: string[];
  errors: ConsoleErrors;
};

type ConsoleContextValue = ConsoleState & {
  refresh: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setShieldEnabled: (enabled: boolean) => Promise<boolean>;
};

const EMPTY: ConsoleState = {
  loading: true,
  updating: false,
  connected: null,
  shieldEnabled: null,
  feedback: null,
  stats: null,
  events: null,
  pendingApprovals: null,
  newEventIds: [],
  errors: {},
};

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

async function fetchConsoleSnapshot(): Promise<
  Pick<ConsoleState, "connected" | "shieldEnabled" | "stats" | "events" | "pendingApprovals" | "errors">
> {
  const [health, shield, stats, events, approvals] = await Promise.allSettled([
    getHealthStatus(),
    getShieldStatus(),
    getAuditStats(),
    getAuditEvents(DASHBOARD_EVENT_LIMIT),
    getPendingApprovals(),
  ]);

  let shieldEnabled: boolean | null = null;
  let shieldError: string | undefined;
  if (shield.status === "fulfilled") {
    try {
      shieldEnabled = readShieldEnabled(shield.value);
    } catch {
      shieldError = "Shield status unavailable";
    }
  } else {
    shieldError = "Shield status unavailable";
  }

  const healthOk = health.status === "fulfilled";
  const shieldOk = shield.status === "fulfilled" && shieldEnabled != null;
  const connected = healthOk || shieldOk;

  return {
    connected,
    shieldEnabled,
    stats: settledValue(stats),
    events: settledValue(events),
    pendingApprovals: settledValue(approvals),
    errors: {
      health: healthOk ? undefined : "Unable to connect to AgentShield backend.",
      shield: connected && !shieldOk ? shieldError : connected ? undefined : "AgentShield backend unavailable",
      stats: stats.status === "rejected" ? "Statistics unavailable" : undefined,
      events: events.status === "rejected" ? "Unable to load security activity." : undefined,
      approvals: approvals.status === "rejected" ? "Unable to load approvals." : undefined,
      toggle: undefined,
    },
  };
}

type ProviderProps = {
  children: ReactNode;
  pollIntervalMs?: number;
};

export function SecurityConsoleProvider({
  children,
  pollIntervalMs = DASHBOARD_POLL_INTERVAL_MS,
}: ProviderProps) {
  const [state, setState] = useState<ConsoleState>(EMPTY);

  const applySnapshot = useCallback(
    (
      snapshot: Awaited<ReturnType<typeof fetchConsoleSnapshot>>,
      options?: { initial?: boolean },
    ) => {
      setState((current) => {
        const incomingEvents = snapshot.errors.events ? current.events : snapshot.events;
        const merged = options?.initial
          ? { events: incomingEvents, newIds: [] as string[] }
          : mergeSecurityEvents(current.events, incomingEvents, DASHBOARD_EVENT_LIMIT);
        return {
          ...current,
          loading: false,
          connected: snapshot.connected,
          shieldEnabled: snapshot.errors.shield && current.shieldEnabled != null && snapshot.connected !== false
            ? current.shieldEnabled
            : snapshot.shieldEnabled,
          stats: snapshot.errors.stats ? current.stats : snapshot.stats,
          events: merged.events,
          pendingApprovals: snapshot.errors.approvals ? current.pendingApprovals : snapshot.pendingApprovals,
          newEventIds: options?.initial ? [] : merged.newIds,
          errors: {
            ...snapshot.errors,
            toggle: current.errors.toggle,
          },
          feedback: options?.initial ? current.feedback : current.feedback,
        };
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    const snapshot = await fetchConsoleSnapshot();
    applySnapshot(snapshot);
  }, [applySnapshot]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getShieldStatus();
      const enabled = readShieldEnabled(status);
      setState((current) => ({
        ...current,
        connected: current.connected === false ? true : current.connected ?? true,
        shieldEnabled: enabled,
        errors: { ...current.errors, shield: undefined, health: undefined, toggle: undefined },
      }));
    } catch {
      setState((current) => ({
        ...current,
        shieldEnabled: null,
        errors: {
          ...current.errors,
          shield: "Shield status unavailable",
        },
      }));
    }
  }, []);

  const setShieldEnabled = useCallback(async (enabled: boolean) => {
    setState((current) => ({
      ...current,
      updating: true,
      feedback: null,
      errors: { ...current.errors, toggle: undefined },
    }));

    try {
      const status = await postShieldEnabled(enabled);
      const nextEnabled = readShieldEnabled(status);
      let events: SecurityEvent[] | null = null;
      try {
        events = await getAuditEvents(DASHBOARD_EVENT_LIMIT);
      } catch {
        events = null;
      }
      setState((current) => {
        const merged = mergeSecurityEvents(current.events, events, DASHBOARD_EVENT_LIMIT);
        return {
          ...current,
          updating: false,
          connected: true,
          shieldEnabled: nextEnabled,
          feedback: nextEnabled ? "Shield is now ON." : "Shield is now OFF.",
          events: events ? merged.events : current.events,
          newEventIds: events ? merged.newIds : current.newEventIds,
          errors: { ...current.errors, shield: undefined, toggle: undefined, health: undefined },
        };
      });
      return true;
    } catch {
      setState((current) => ({
        ...current,
        updating: false,
        feedback: null,
        errors: {
          ...current.errors,
          toggle: "Unable to change Shield state.",
        },
      }));
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchConsoleSnapshot().then((snapshot) => {
      if (cancelled) {
        return;
      }
      applySnapshot(snapshot, { initial: true });
    });
    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (pollIntervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [pollIntervalMs, refresh]);

  const value = useMemo<ConsoleContextValue>(
    () => ({
      ...state,
      refresh,
      refreshStatus,
      setShieldEnabled,
    }),
    [state, refresh, refreshStatus, setShieldEnabled],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useOptionalSecurityConsole() {
  return useContext(ConsoleContext);
}

export function useSecurityConsole() {
  const context = useOptionalSecurityConsole();
  if (!context) {
    throw new Error("useSecurityConsole must be used within SecurityConsoleProvider");
  }
  return context;
}

export function useShield() {
  const context = useSecurityConsole();
  return {
    enabled: context.shieldEnabled,
    loading: context.loading,
    updating: context.updating,
    error: context.errors.toggle ?? null,
    connected: context.connected,
    feedback: context.feedback,
    refreshStatus: context.refreshStatus,
    refresh: context.refresh,
    setShieldEnabled: context.setShieldEnabled,
  };
}

export function useDashboardData() {
  const context = useSecurityConsole();
  return {
    stats: context.stats,
    events: context.events,
    approvals: context.pendingApprovals,
    loading: context.loading,
    errors: context.errors,
    refresh: context.refresh,
    connected: context.connected,
    shieldEnabled: context.shieldEnabled,
    newEventIds: context.newEventIds,
  };
}
