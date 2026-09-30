"use client";

import { Shield, ShieldOff } from "lucide-react";

import { cn } from "@/lib/utils";

type ShieldStatusProps = {
  enabled?: boolean | null;
  loading?: boolean;
  updating?: boolean;
  unavailable?: boolean;
  className?: string;
};

export function ShieldStatus({
  enabled,
  loading = false,
  updating = false,
  unavailable = false,
  className,
}: ShieldStatusProps) {
  const state = updating
    ? "updating"
    : loading
      ? "loading"
      : unavailable || enabled == null
        ? "unavailable"
        : enabled
          ? "on"
          : "off";

  const label =
    state === "on"
      ? "Shield Active"
      : state === "off"
        ? "Shield Disabled"
        : state === "updating"
          ? "Updating..."
          : state === "loading"
            ? "Loading"
            : "Status unavailable";

  const ariaLabel =
    state === "on"
      ? "Shield active, protected"
      : state === "off"
        ? "Shield disabled, protection bypassed"
        : state === "updating"
          ? "Shield status updating"
          : state === "loading"
            ? "Loading shield status"
            : "Shield status unavailable";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        state === "on" && "border-success/30 bg-success/10 text-success",
        state === "off" && "border-destructive/30 bg-destructive/10 text-destructive",
        (state === "loading" || state === "updating" || state === "unavailable") &&
          "border-border bg-muted text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "on" && "bg-success",
          state === "off" && "bg-destructive",
          (state === "loading" || state === "updating" || state === "unavailable") && "bg-muted-foreground/70",
        )}
        aria-hidden="true"
      />
      {state === "on" ? (
        <Shield className="size-3.5" aria-hidden="true" />
      ) : state === "off" ? (
        <ShieldOff className="size-3.5" aria-hidden="true" />
      ) : null}
      <span className="leading-tight">{label}</span>
    </div>
  );
}
