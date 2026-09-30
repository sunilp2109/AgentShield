import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShieldStatus } from "@/components/security/ShieldStatus";

describe("ShieldStatus", () => {
  it("renders the ON state", () => {
    render(<ShieldStatus enabled />);
    expect(screen.getByRole("status", { name: "Shield active, protected" })).toBeInTheDocument();
    expect(screen.getByText("Shield Active")).toBeInTheDocument();
  });

  it("renders the OFF state", () => {
    render(<ShieldStatus enabled={false} />);
    expect(
      screen.getByRole("status", { name: "Shield disabled, protection bypassed" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Shield Disabled")).toBeInTheDocument();
  });

  it("renders a loading state instead of Protected", () => {
    render(<ShieldStatus loading />);
    expect(screen.getByRole("status", { name: "Loading shield status" })).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("Shield Active")).not.toBeInTheDocument();
  });

  it("renders an updating state", () => {
    render(<ShieldStatus enabled updating />);
    expect(screen.getByRole("status", { name: "Shield status updating" })).toBeInTheDocument();
    expect(screen.getByText("Updating...")).toBeInTheDocument();
  });

  it("renders an unavailable state", () => {
    render(<ShieldStatus unavailable />);
    expect(screen.getByRole("status", { name: "Shield status unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
  });
});
