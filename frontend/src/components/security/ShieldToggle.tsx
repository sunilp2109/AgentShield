"use client";

import { useEffect, useId, useState } from "react";
import { Shield, ShieldOff } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { useShield } from "@/components/security/SecurityConsoleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ShieldToggleProps = {
  className?: string;
};

export function ShieldToggle({ className }: ShieldToggleProps) {
  const {
    enabled,
    loading,
    updating,
    error,
    connected,
    feedback,
    setShieldEnabled,
    refresh,
  } = useShield();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unavailable = !loading && (enabled == null || connected === false);
  const switchDisabled = loading || updating || unavailable;
  const title = loading
    ? "Loading shield status"
    : updating
      ? "Updating shield state"
      : enabled
        ? "Shield Active"
        : enabled === false
          ? "Shield Disabled"
          : "Shield status unavailable";
  const description = loading
    ? "Waiting for AgentShield backend."
    : updating
      ? "Applying the requested protection state."
      : enabled
        ? "Protection is enabled"
        : enabled === false
          ? "Protection is bypassed"
          : connected === false
            ? "AgentShield backend unavailable"
            : "Protection status cannot be verified.";

  async function apply(nextEnabled: boolean) {
    setConfirmOpen(false);
    await setShieldEnabled(nextEnabled);
  }

  function onToggle() {
    if (switchDisabled || enabled == null) {
      return;
    }
    if (enabled) {
      setConfirmOpen(true);
      return;
    }
    void apply(true);
  }

  return (
    <section
      className={cn(
        "rounded-xl border p-4 transition-colors",
        enabled
          ? "border-success/30 bg-success/5"
          : enabled === false
            ? "border-destructive/30 bg-destructive/5"
            : "border-border bg-card",
        className,
      )}
      aria-label="Shield control"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "rounded-lg border p-2",
              enabled
                ? "border-success/30 bg-success/10 text-success"
                : enabled === false
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-muted text-muted-foreground",
            )}
          >
            {enabled ? <Shield className="size-5" aria-hidden="true" /> : <ShieldOff className="size-5" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                  enabled
                    ? "border-success/30 bg-success/10 text-success"
                    : enabled === false
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {loading ? "LOADING" : updating ? "UPDATING" : enabled ? "ON" : enabled === false ? "OFF" : "UNKNOWN"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {unavailable ? (
              <p className="mt-1 text-sm text-muted-foreground">Protection status cannot be verified.</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled === true}
          aria-label={enabled ? "Disable AgentShield" : "Enable AgentShield"}
          aria-busy={updating || loading}
          disabled={switchDisabled}
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
            "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            enabled ? "border-success/40 bg-success" : "border-border bg-muted",
            switchDisabled && "cursor-not-allowed opacity-60",
          )}
        >
          <span
            className={cn(
              "inline-block size-4 translate-x-1 rounded-full bg-background transition-transform",
              enabled && "translate-x-5",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p className="mt-3 text-sm text-muted-foreground" role="status" aria-live="polite">
          {feedback}
        </p>
      ) : null}
      {unavailable ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
          Retry
        </Button>
      ) : null}
      {confirmOpen ? (
        <DisableShieldDialog
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void apply(false)}
        />
      ) : null}
    </section>
  );
}

export function ShieldControlPage() {
  return (
    <PageContainer
      title="Shield Control"
      subtitle="Enable or disable AgentShield security enforcement"
    >
      <ShieldToggle />
    </PageContainer>
  );
}

function DisableShieldDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Cancel disable shield"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          Disable AgentShield?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          Shield OFF allows the baseline agent behavior to execute without security enforcement.
          This mode is intended for controlled testing environments.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" autoFocus onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Disable Shield
          </Button>
        </div>
      </div>
    </div>
  );
}
