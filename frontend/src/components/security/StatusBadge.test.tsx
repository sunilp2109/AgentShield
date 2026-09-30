import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/security/StatusBadge";

describe("StatusBadge", () => {
  it("renders decision badges with text and icons", () => {
    const { rerender } = render(<StatusBadge decision="ALLOW" />);
    expect(screen.getByText("ALLOW")).toBeInTheDocument();

    rerender(<StatusBadge decision="APPROVAL_REQUIRED" />);
    expect(screen.getByText("APPROVAL REQUIRED")).toBeInTheDocument();

    rerender(<StatusBadge decision="BLOCK" />);
    expect(screen.getByText("BLOCK")).toBeInTheDocument();

    rerender(<StatusBadge decision="BYPASS" />);
    expect(screen.getByText("BYPASS")).toBeInTheDocument();
  });
});
