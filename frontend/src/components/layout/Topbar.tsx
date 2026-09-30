"use client";

import { CircleUser, Menu, Radio } from "lucide-react";

import { ShieldStatus } from "@/components/security/ShieldStatus";
import { useShield } from "@/components/security/SecurityConsoleProvider";
import { Button } from "@/components/ui/button";
import { getPageTitle } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type TopbarProps = {
  pathname: string;
  onMenuClick?: () => void;
};

export function Topbar({ pathname, onMenuClick }: TopbarProps) {
  const { enabled, loading, updating, connected, error } = useShield();
  const unavailable = !loading && (enabled == null || connected === false || Boolean(error && enabled == null));

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </Button>
        <h1 className="truncate text-sm font-semibold tracking-tight">{getPageTitle(pathname)}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] sm:inline-flex",
            connected
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-muted text-muted-foreground",
          )}
          role="status"
          aria-label={connected ? "Backend connected" : "Backend disconnected"}
        >
          <Radio className={cn("size-3", connected && "animate-pulse")} aria-hidden="true" />
          {connected ? "Backend Connected" : connected === false ? "Backend Offline" : "Checking backend"}
        </span>
        <ShieldStatus
          enabled={enabled}
          loading={loading}
          updating={updating}
          unavailable={unavailable}
        />
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground"
          title="Demo operator"
        >
          <CircleUser className="size-3.5" aria-hidden="true" />
          Demo
        </span>
      </div>
    </header>
  );
}
