"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SecurityConsoleProvider, useSecurityConsole } from "@/components/security/SecurityConsoleProvider";
import { cn } from "@/lib/utils";

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/dashboard";
  const { pendingApprovals } = useSecurityConsole();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        pathname={pathname}
        pendingApprovals={pendingApprovals?.length ?? null}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <div className={cn("flex min-h-screen flex-col transition-[padding] duration-200", collapsed ? "md:pl-[72px]" : "md:pl-60")}>
        <Topbar
          pathname={pathname}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/agent" || pathname.startsWith("/agent/")) {
    return <>{children}</>;
  }
  return (
    <SecurityConsoleProvider>
      <ShellFrame>{children}</ShellFrame>
    </SecurityConsoleProvider>
  );
}
