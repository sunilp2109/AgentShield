"use client";

import { ChatScenarios } from "@/components/agent/ChatScenarios";
import type { KeyboardEvent } from "react";

type ChatComposerProps = {
  value: string;
  disabled: boolean;
  showScenarios?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
};

export function ChatComposer({
  value,
  disabled,
  showScenarios = true,
  onChange,
  onSend,
}: ChatComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  }

  return (
    <div className="border-t border-border/70 bg-background/90 px-4 py-3 sm:px-6">
      {showScenarios ? <ChatScenarios compact disabled={disabled} onFill={onChange} /> : null}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="agent-message">
          Type a message
        </label>
        <textarea
          id="agent-message"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message..."
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="h-11 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
