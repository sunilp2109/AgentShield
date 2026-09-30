"use client";

import { useCallback, useState } from "react";

import { ChatComposer } from "@/components/agent/ChatComposer";
import { ChatHeader } from "@/components/agent/ChatHeader";
import { ChatTranscript } from "@/components/agent/ChatTranscript";
import { sendChat } from "@/lib/agent-api";
import { createMessage, matchingEvents } from "@/lib/agent-chat";
import { ApiError } from "@/lib/api";
import { getAuditEvents } from "@/lib/security-api";
import type { AgentChatMessage, SecurityEvent } from "@/types";

export function AgentChatView() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) {
        return;
      }
      setSending(true);
      setDraft("");
      setMessages((current) => [...current, createMessage("user", text)]);
      try {
        const payload = await sendChat({ message: text, session_id: sessionId });
        setSessionId(payload.session_id);
        let events: SecurityEvent[] = [];
        try {
          const audit = await getAuditEvents({ session_id: payload.session_id, limit: 50 });
          events = matchingEvents(audit, payload.request_id, payload.session_id);
        } catch {
          events = [];
        }
        setMessages((current) => [
          ...current,
          createMessage("assistant", payload.response, {
            tool_results: payload.tool_results,
            events,
          }),
        ]);
      } catch (error) {
        const unavailable = !(error instanceof ApiError) || error.status >= 500;
        setMessages((current) => [
          ...current,
          createMessage(
            "system",
            unavailable ? "Agent backend unavailable." : "Something went wrong while contacting the agent.",
            { error: error instanceof Error ? error.message : "request failed", retryMessage: text },
          ),
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, sessionId],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-1 flex-col md:max-w-[960px] md:py-4">
        <div className="flex min-h-dvh flex-1 flex-col overflow-hidden md:min-h-[calc(100dvh-2rem)] md:rounded-3xl md:border md:border-border/80 md:bg-card/40">
          <ChatHeader
            onNewChat={() => {
              setMessages([]);
              setDraft("");
              setSessionId(null);
            }}
          />
          <ChatTranscript
            messages={messages}
            thinking={sending}
            onRetry={(message) => void send(message)}
            onFillScenario={setDraft}
            onRunScenario={(prompt) => void send(prompt)}
          />
          <ChatComposer
            value={draft}
            disabled={sending}
            showScenarios={messages.length > 0}
            onChange={setDraft}
            onSend={() => void send(draft)}
          />
        </div>
      </div>
    </div>
  );
}
