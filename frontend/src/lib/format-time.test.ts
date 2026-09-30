import { formatRelativeTime } from "@/lib/format-time";
import { describe, expect, it } from "vitest";

describe("formatRelativeTime", () => {
  it("formats seconds and minutes without throwing on invalid dates", () => {
    const now = Date.parse("2026-09-20T10:00:12Z");
    expect(formatRelativeTime("2026-09-20T10:00:10Z", now)).toBe("2 sec ago");
    expect(formatRelativeTime("2026-09-20T09:59:50Z", now)).toBe("22 sec ago");
    expect(formatRelativeTime("2026-09-20T09:57:12Z", now)).toBe("3 min ago");
    expect(formatRelativeTime("2026-09-20T10:00:10", now)).toBe("2 sec ago");
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
