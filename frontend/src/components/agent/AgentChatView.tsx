"use client";

import { useCallback, useRef, useState } from "react";

import { ChatComposer } from "@/components/agent/ChatComposer";
import { ChatHeader } from "@/components/agent/ChatHeader";
import { ChatTranscript } from "@/components/agent/ChatTranscript";
import { sendChat } from "@/lib/agent-api";
import { createMessage, matchingEvents } from "@/lib/agent-chat";
import { ApiError } from "@/lib/api";
import { getAuditEvents } from "@/lib/security-api";
import type { AgentChatMessage, SecurityEvent } from "@/types";

/** Play a soft chime when the agent replies */
function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => { void ctx.close(); };
  } catch {
    // AudioContext not available
  }
}

export function AgentChatView() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setDraft("");
      setMessages((cur) => [...cur, createMessage("user", text)]);
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
        setMessages((cur) => [
          ...cur,
          createMessage("assistant", payload.response, {
            tool_results: payload.tool_results,
            events,
          }),
        ]);
        playNotificationSound();
      } catch (error) {
        const unavailable = !(error instanceof ApiError) || error.status >= 500;
        setMessages((cur) => [
          ...cur,
          createMessage(
            "system",
            unavailable
              ? "Agent backend unavailable."
              : "Something went wrong while contacting the agent.",
            { error: error instanceof Error ? error.message : "request failed", retryMessage: text },
          ),
        ]);
      } finally {
        setSending(false);
        sendingRef.current = false;
      }
    },
    [sessionId],
  );

  return (
    <div className="chat-shell">
      <div className="chat-container">
        <div className="chat-panel">
          <ChatHeader
            messageCount={messages.length}
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
