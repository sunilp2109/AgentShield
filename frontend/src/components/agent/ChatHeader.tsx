"use client";

import { getHealthStatus, getShieldStatus, readShieldEnabled } from "@/lib/security-api";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type ChatHeaderProps = {
  onNewChat: () => void;
};

export function ChatHeader({ onNewChat }: ChatHeaderProps) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [protectedByShield, setProtectedByShield] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getHealthStatus(), getShieldStatus()]).then(([health, shield]) => {
      if (cancelled) {
        return;
      }
      setOnline(health.status === "fulfilled" && health.value.status === "ok");
      if (shield.status === "fulfilled") {
        try {
          setProtectedByShield(readShieldEnabled(shield.value));
        } catch {
          setProtectedByShield(null);
        }
      } else {
        setProtectedByShield(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = online ? "Online" : online === false ? "Offline" : "Connecting";

  return (
    <header className="flex items-start justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Agent</h1>
          <p
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
              online ? "border-success/30 text-success" : "border-border text-muted-foreground",
            )}
            role="status"
            aria-live="polite"
          >
            <span className={cn("size-1.5 rounded-full", online ? "bg-success" : "bg-muted-foreground")} aria-hidden="true" />
            {statusLabel}
          </p>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">AI Assistant</p>
        {protectedByShield ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Protected by AgentShield</p>
        ) : protectedByShield === false ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Baseline mode</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onNewChat}
        className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        New Chat
      </button>
    </header>
  );
}
