import { looksSensitive } from "@/lib/audit";
import type { AgentChatMessage, AgentToolRun, SecurityEvent } from "@/types";

/** Natural suggested prompts shown in the empty state — no attack framing */
export const SUGGESTED_PROMPTS = [
  {
    id: "read-report",
    label: "Summarize a document",
    prompt: "Read project-report.pdf and give me a summary.",
    icon: "file",
  },
  {
    id: "send-email",
    label: "Send a report",
    prompt: "Send project-report.pdf to my manager at manager@example.com.",
    icon: "mail",
  },
  {
    id: "browse",
    label: "Look up information",
    prompt: "Browse https://intranet.acme.local/handbook and summarize the key policies.",
    icon: "globe",
  },
  {
    id: "list-files",
    label: "List available files",
    prompt: "List the files available to me.",
    icon: "folder",
  },
];

export function worstDecision(results: AgentToolRun[]): string | null {
  const rank: Record<string, number> = {
    BLOCK: 40,
    APPROVAL_REQUIRED: 30,
    BYPASS: 20,
    ALLOW: 10,
  };
  let current: string | null = null;
  let score = -1;
  for (const item of results) {
    const decision = item.decision;
    if (!decision) continue;
    const next = rank[decision] ?? 0;
    if (next > score) {
      current = decision;
      score = next;
    }
  }
  return current;
}

export function matchingEvents(events: SecurityEvent[], requestId?: string, sessionId?: string): SecurityEvent[] {
  return events.filter((event) => {
    if (requestId && event.request_id === requestId) return true;
    if (!requestId && sessionId && event.session_id === sessionId) return true;
    return false;
  });
}

export function primaryEvent(events: SecurityEvent[]): SecurityEvent | null {
  const rank: Record<string, number> = {
    BLOCK: 40,
    APPROVAL_REQUIRED: 30,
    BYPASS: 20,
    ALLOW: 10,
  };
  return [...events].sort((l, r) => {
    const ls = rank[String(l.firewall_decision)] ?? 0;
    const rs = rank[String(r.firewall_decision)] ?? 0;
    return rs - ls;
  })[0] ?? null;
}

export function shouldShowSecurityCard(decision: string | null): decision is "BLOCK" | "APPROVAL_REQUIRED" | "BYPASS" {
  return decision === "BLOCK" || decision === "APPROVAL_REQUIRED" || decision === "BYPASS";
}

export function toolTarget(run: AgentToolRun): string | null {
  const args = run.arguments ?? {};
  const value = args.path ?? args.recipient ?? args.url ?? args.destination;
  return typeof value === "string" && value.trim() ? value : null;
}

export function redactText(value: string | null | undefined): string {
  if (!value) return "";
  if (looksSensitive(value) || /ignore previous instructions/i.test(value)) return "Redacted";
  return value;
}

export function createMessage(
  role: AgentChatMessage["role"],
  content: string,
  metadata?: AgentChatMessage["metadata"],
): AgentChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata,
  };
}