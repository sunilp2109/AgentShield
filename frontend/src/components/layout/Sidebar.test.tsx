import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layout/Sidebar";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("Sidebar", () => {
  it("renders navigation links", () => {
    render(
      <Sidebar collapsed={false} onToggle={() => undefined} pathname="/dashboard" />,
    );

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent" })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Live Monitor" })).toHaveAttribute(
      "href",
      "/live-monitor",
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/approvals");
    expect(screen.getByRole("link", { name: "Audit Logs" })).toHaveAttribute("href", "/audit");
    expect(screen.getByRole("link", { name: "Attack Lab" })).toHaveAttribute("href", "/attack-lab");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("shows an approvals badge only when a count is provided", () => {
    const { rerender } = render(
      <Sidebar collapsed={false} onToggle={() => undefined} pathname="/approvals" />,
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();

    rerender(
      <Sidebar
        collapsed={false}
        onToggle={() => undefined}
        pathname="/approvals"
        pendingApprovals={0}
      />,
    );
    expect(screen.getByRole("link", { name: "Approvals" })).toBeInTheDocument();

    rerender(
      <Sidebar
        collapsed={false}
        onToggle={() => undefined}
        pathname="/approvals"
        pendingApprovals={3}
      />,
    );
    expect(screen.getByRole("link", { name: "Approvals, 3 pending" })).toBeInTheDocument();
  });
});
