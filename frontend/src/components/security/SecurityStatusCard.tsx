"use client";

import { Shield, ShieldOff } from "lucide-react";

import { ShieldToggle } from "@/components/security/ShieldToggle";
import { useShield } from "@/components/security/SecurityConsoleProvider";
import { cn } from "@/lib/utils";

type SecurityStatusCardProps = {
  timestamp?: string | null;
  className?: string;
};

export function SecurityStatusCard({ timestamp, className }: SecurityStatusCardProps) {
  const { enabled, loading, connected } = useShield();
  const backendDown = !loading && connected === false;
  const protectedNow = connected !== false && enabled === true && !loading;

  const title = loading
    ? "LOADING"
    : backendDown || enabled == null
      ? "STATUS UNKNOWN"
      : protectedNow
        ? "PROTECTED"
        : "PROTECTION DISABLED";

  const explanation = loading
    ? "Waiting for AgentShield backend to report protection state."
    : backendDown
      ? "AgentShield backend unavailable"
      : protectedNow
        ? "AgentShield is actively enforcing security policies."
        : enabled === false
          ? "Security enforcement is currently bypassed."
          : "Protection status cannot be verified.";

  return (
    <section
      className={cn("space-y-4 rounded-xl border border-border bg-card p-4", className)}
      aria-label="Security status"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Security Status
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{explanation}</p>
          {backendDown || (!loading && enabled == null) ? (
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Protection status cannot be verified.
            </p>
          ) : null}
          {timestamp ? (
            <p className="mt-2 text-xs text-muted-foreground">Updated {timestamp}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "rounded-lg border p-2",
            protectedNow
              ? "border-success/30 bg-success/10 text-success"
              : enabled === false
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          {protectedNow ? (
            <Shield className="size-5" aria-hidden="true" />
          ) : (
            <ShieldOff className="size-5" aria-hidden="true" />
          )}
        </div>
      </div>
      <ShieldToggle className="bg-background/40" />
    </section>
  );
}
