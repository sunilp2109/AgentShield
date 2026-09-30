"use client";

import { useRef } from "react";

import { ChatScenarios } from "@/components/agent/ChatScenarios";
import { SecurityNotice } from "@/components/agent/SecurityNotice";
import { ToolActivity } from "@/components/agent/ToolActivity";
import { shouldShowSecurityCard, worstDecision } from "@/lib/agent-chat";
import type { AgentChatMessage } from "@/types";
import { cn } from "@/lib/utils";

type ChatTranscriptProps = {
  messages: AgentChatMessage[];
  thinking: boolean;
  onRetry?: (message: string) => void;
  onFillScenario?: (prompt: string) => void;
  onRunScenario?: (prompt: string) => void;
};

export function ChatTranscript({
  messages,
  thinking,
  onRetry,
  onFillScenario,
  onRunScenario,
}: ChatTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite" aria-label="Chat messages">
      {messages.length === 0 ? (
        <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
          <p className="text-base font-medium">How can I help?</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Ask about documents, look up project information, or send a report. Security runs quietly in the background.
          </p>
          {onFillScenario ? (
            <ChatScenarios
              disabled={thinking}
              onFill={onFillScenario}
              onRun={onRunScenario}
            />
          ) : null}
        </div>
      ) : null}
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                <p className="mb-1 text-[11px] opacity-80">You</p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          );
        }
        if (message.role === "assistant") {
          const results = message.metadata?.tool_results ?? [];
          const events = message.metadata?.events ?? [];
          const decision = worstDecision(results);
          return (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] space-y-3">
                <div className="rounded-2xl rounded-bl-md border border-border/70 bg-card px-4 py-2.5 text-sm">
                  <p className="mb-1 text-[11px] text-muted-foreground">Agent</p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {decision === "ALLOW" && results.length > 0 ? (
                  <SecurityNotice decision="ALLOW" results={results} events={events} />
                ) : null}
                {shouldShowSecurityCard(decision) ? (
                  <SecurityNotice decision={decision} results={results} events={events} />
                ) : null}
                {results.length > 0 ? <ToolActivity results={results} /> : null}
              </div>
            </div>
          );
        }
        if (message.role === "system") {
          return (
            <div
              key={message.id}
              className={cn("rounded-2xl border border-border px-4 py-3 text-sm", message.metadata?.error && "border-destructive/40")}
              role="alert"
            >
              <p>{message.content}</p>
              {message.metadata?.retryMessage && onRetry ? (
                <button
                  type="button"
                  className="mt-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => onRetry(message.metadata?.retryMessage ?? "")}
                >
                  Retry
                </button>
              ) : null}
            </div>
          );
        }
        return null;
      })}
      {thinking ? (
        <p className="text-sm text-muted-foreground" role="status">
          Agent is thinking...
        </p>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
