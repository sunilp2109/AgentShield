"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectionBannerProps = {
  visible: boolean;
  onRetry?: () => void;
  className?: string;
};

export function ConnectionBanner({ visible, onRetry, className }: ConnectionBannerProps) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3",
        className,
      )}
      role="alert"
    >
      <div>
        <p className="text-sm font-medium text-destructive">AgentShield backend unavailable</p>
        <p className="text-xs text-muted-foreground">Protection status cannot be verified.</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
