"use client";

import { SUGGESTED_PROMPTS } from "@/lib/agent-chat";

type SuggestedPromptsProps = {
  disabled?: boolean;
  onFill: (prompt: string) => void;
  onRun?: (prompt: string) => void;
};

function PromptIcon({ name }: { name: string }) {
  if (name === "file") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
  if (name === "mail") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );
  if (name === "globe") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

export function ChatScenarios({ disabled = false, onFill, onRun }: SuggestedPromptsProps) {
  return (
    <div className="suggested-prompts-grid" aria-label="Suggested prompts">
      {SUGGESTED_PROMPTS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onFill(item.prompt)}
          className="suggested-prompt-card"
        >
          <span className="suggested-prompt-icon">
            <PromptIcon name={item.icon} />
          </span>
          <span className="suggested-prompt-label">{item.label}</span>
          <span className="suggested-prompt-hint">{item.prompt}</span>
        </button>
      ))}
    </div>
  );
}