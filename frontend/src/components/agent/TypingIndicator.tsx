"use client";

import { useEffect, useState } from "react";

const THINKING_STAGES = [
  { icon: "search",   label: "Analyzing your request..." },
  { icon: "shield",   label: "Checking trust level..." },
  { icon: "scan",     label: "Scanning for injection..." },
  { icon: "tool",     label: "Running security checks..." },
  { icon: "cpu",      label: "Calling tools..." },
  { icon: "sparkle",  label: "Generating response..." },
];

function StageIcon({ name }: { name: string }) {
  if (name === "search") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
  if (name === "shield") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
  if (name === "scan") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 7 4"/><polyline points="17 4 20 4 20 7"/>
      <polyline points="20 17 20 20 17 20"/><polyline points="7 20 4 20 4 17"/>
      <line x1="4" y1="12" x2="20" y2="12"/>
    </svg>
  );
  if (name === "tool") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
  if (name === "cpu") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
      <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  );
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

export function TypingIndicator() {
  const [stageIdx, setStageIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setStageIdx((i) => (i + 1) % THINKING_STAGES.length);
        setVisible(true);
      }, 250);
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  const stage = THINKING_STAGES[stageIdx];

  return (
    <div className="typing-indicator-wrap" role="status" aria-label="Agent is thinking">
      <div className="agent-avatar-sm flex-shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div className="thinking-stage-wrap">
        <div className={`thinking-stage ${visible ? "thinking-stage-visible" : "thinking-stage-hidden"}`}>
          <span className="thinking-stage-icon"><StageIcon name={stage.icon} /></span>
          <span className="thinking-stage-label">{stage.label}</span>
        </div>
        <div className="typing-dots-row">
          <span className="typing-dot" style={{ animationDelay: "0ms" }} />
          <span className="typing-dot" style={{ animationDelay: "150ms" }} />
          <span className="typing-dot" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
      <span className="sr-only">Agent is thinking...</span>
    </div>
  );
}