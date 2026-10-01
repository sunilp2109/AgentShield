import { describe, expect, it, vi } from "vitest";

import { sendChat } from "@/lib/agent-api";
import { SUGGESTED_PROMPTS, shouldShowSecurityCard, worstDecision } from "@/lib/agent-chat";

describe("agent chat helpers", () => {
  it("posts to the existing chat endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: "ok", session_id: "abc", request_id: "req", tool_results: [], tool_calls: [], sources: [], reasoning_summary: "", shield_enabled: true }),
      }),
    );
    await sendChat({ message: "Read project-report.pdf and give me a summary." });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Read project-report.pdf and give me a summary." }),
      }),
    );
  });

  it("does not invent BLOCK from an allow result", () => {
    expect(worstDecision([{ decision: "ALLOW" } as never])).toBe("ALLOW");
    expect(shouldShowSecurityCard("ALLOW")).toBe(false);
    expect(SUGGESTED_PROMPTS.length).toBeGreaterThan(0);
  });

  it("suggested prompts are natural user requests, not attack scenarios", () => {
    const prompts = SUGGESTED_PROMPTS.map((s) => s.prompt);
    // Should not contain attack/injection framing
    prompts.forEach((p) => {
      expect(p.toLowerCase()).not.toContain("ignore previous instructions");
      expect(p.toLowerCase()).not.toContain("attacker@");
    });
  });
});