"use client";

import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  pathname: string;
  pendingApprovals?: number | null;
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

export function Sidebar({
  collapsed,
  onToggle,
  pathname,
  pendingApprovals,
  mobileOpen = false,
  onNavigate,
}: SidebarProps) {
  const activePath = pathname || "/dashboard";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200",
        collapsed ? "w-[72px]" : "w-60",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
      aria-label="Primary"
    >
      <div className={cn("flex items-center gap-3 border-b border-sidebar-border px-4 py-4", collapsed && "justify-center px-2")}>
        <Shield className="size-5 text-primary" aria-hidden="true" />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-sm leading-none font-semibold tracking-[0.18em]">AGENT</p>
            <p className="text-sm leading-5 font-semibold tracking-[0.18em]">SHIELD</p>
            <p className="mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">
              AI Agent Security Firewall
            </p>
          </div>
        ) : (
          <span className="sr-only">AgentShield, AI Agent Security Firewall</span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePath === item.href || activePath.startsWith(`${item.href}/`);
          const badge =
            item.badgeKey === "approvals" && pendingApprovals != null && pendingApprovals > 0
              ? pendingApprovals
              : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={badge != null ? `${item.label}, ${badge} pending` : item.label}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                collapsed && "justify-center px-2",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed ? <span className="flex-1">{item.label}</span> : null}
              {!collapsed && badge != null ? (
                <span className="rounded-md bg-warning/15 px-1.5 text-[10px] font-medium text-warning">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed ? <span className="ml-2">Collapse</span> : null}
        </Button>
      </div>
    </aside>
  );
}
