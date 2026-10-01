"use client";

import { getHealthStatus, getShieldStatus, readShieldEnabled } from "@/lib/security-api";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

type ChatHeaderProps = {
  onNewChat: () => void;
  messageCount?: number;
};

export function ChatHeader({ onNewChat, messageCount = 0 }: ChatHeaderProps) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [protectedByShield, setProtectedByShield] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([getHealthStatus(), getShieldStatus()]).then(([health, shield]) => {
      if (cancelled) return;
      setOnline(health.status === "fulfilled" && health.value.status === "ok");
      if (shield.status === "fulfilled") {
        try {
          setProtectedByShield(readShieldEnabled(shield.value));
        } catch {
          setProtectedByShield(null);
        }
      } else {
        setProtectedByShield(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = online ? "Online" : online === false ? "Offline" : "Connecting";

  function shieldSubtitle() {
    if (protectedByShield === true) return "Runtime security active";
    if (protectedByShield === false) return "Baseline mode";
    return "AI Assistant";
  }

  function shieldBadge() {
    if (protectedByShield === true) return "Protected";
    if (protectedByShield === false) return "Unprotected";
    return null;
  }

  const badge = shieldBadge();

  return (
    <header className="chat-header">
      <div className="chat-header-left">
        <div className="agent-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div className="agent-info">
          <div className="agent-title-row">
            <h1 className="agent-name">AgentShield AI</h1>
            {badge && (
              <span
                className={cn(
                  "status-badge",
                  protectedByShield ? "status-online" : "status-offline",
                )}
                role="status"
                aria-live="polite"
              >
                <span
                  className={cn("status-dot", protectedByShield ? "dot-online" : "dot-offline")}
                  aria-hidden="true"
                />
                {badge}
              </span>
            )}
          </div>
          <p className="agent-subtitle">{shieldSubtitle()}</p>
        </div>
      </div>
      <div className="chat-header-right">
        <span className={cn("header-online-dot", online ? "dot-online" : "dot-offline")} aria-label={statusLabel} />
        {messageCount > 0 && (
          <span className="msg-count-badge">{messageCount} msg{messageCount !== 1 ? "s" : ""}</span>
        )}
        <button
          type="button"
          onClick={onNewChat}
          className="new-chat-btn"
          title="Start a new chat session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New Chat
        </button>
      </div>
    </header>
  );
}