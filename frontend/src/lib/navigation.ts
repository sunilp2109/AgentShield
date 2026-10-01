import {
  Activity,
  Bot,
  FlaskConical,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Info,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "approvals";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/live-monitor", label: "Live Monitor", icon: Activity },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, badgeKey: "approvals" },
  { href: "/audit", label: "Audit Logs", icon: ScrollText },
  { href: "/attack-lab", label: "Attack Lab", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/about", label: "About", icon: Info },
];

export const PAGE_TITLES: Record<string, string> = {
  "/agent": "Agent",
  "/dashboard": "Dashboard",
  "/live-monitor": "Live Monitor",
  "/approvals": "Approvals",
  "/audit": "Audit Logs",
  "/attack-lab": "Attack Lab",
  "/settings": "Shield Control",
  "/about": "About AgentShield",
};

export function getPageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? "AgentShield";
}
