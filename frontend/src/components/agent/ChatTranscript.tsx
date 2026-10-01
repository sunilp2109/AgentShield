"use client";

import { useEffect, useRef, useState } from "react";
import { ChatScenarios } from "@/components/agent/ChatScenarios";
import { SecurityNotice } from "@/components/agent/SecurityNotice";
import { ToolActivity } from "@/components/agent/ToolActivity";
import { TypingIndicator } from "@/components/agent/TypingIndicator";
import { shouldShowSecurityCard, worstDecision } from "@/lib/agent-chat";
import type { AgentChatMessage, AgentToolRun } from "@/types";
import { cn } from "@/lib/utils";

type ChatTranscriptProps = {
  messages: AgentChatMessage[];
  thinking: boolean;
  onRetry?: (message: string) => void;
  onFillScenario?: (prompt: string) => void;
  onRunScenario?: (prompt: string) => void;
};

/* ── Markdown renderer ─────────────────────────────────────── */
function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={i} className="md-code-block">
          {lang && <span className="md-code-lang">{lang}</span>}
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++;
      continue;
    }

    // Heading
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#{1,3})/)?.[1].length ?? 1;
      const content = line.replace(/^#{1,3}\s/, "");
      const Tag = `h${level + 2}` as "h3" | "h4" | "h5";
      nodes.push(<Tag key={i} className="md-heading">{inlineMarkdown(content)}</Tag>);
      i++;
      continue;
    }

    // Unordered list item
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={i} className="md-list">
          {items.map((item, j) => <li key={j} className="md-list-item">{inlineMarkdown(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol key={i} className="md-list md-list-ol">
          {items.map((item, j) => <li key={j} className="md-list-item">{inlineMarkdown(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={i} className="md-blockquote">{inlineMarkdown(line.slice(2))}</blockquote>
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={i} className="md-spacer" />);
      i++;
      continue;
    }

    // Regular paragraph
    nodes.push(<p key={i} className="md-para">{inlineMarkdown(line)}</p>);
    i++;
  }

  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match bold, italic, inline-code in order
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0;
  let match;
  let keyIdx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) parts.push(<strong key={keyIdx++} className="md-bold">{match[2]}</strong>);
    else if (match[3]) parts.push(<code key={keyIdx++} className="md-inline-code">{match[3]}</code>);
    else if (match[4]) parts.push(<em key={keyIdx++} className="md-italic">{match[4]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/* ── Word-by-word streaming with natural speed ──────────────── */
function StreamingText({ text, active }: { text: string; active: boolean }) {
  const [wordCount, setWordCount] = useState(0);
  const [done, setDone] = useState(false);
  const wordsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!active || (typeof process !== "undefined" && process.env.NODE_ENV === "test")) {
      setDone(true);
      return;
    }
    // Tokenize keeping spaces attached to words for correct reconstruction
    wordsRef.current = text.match(/\S+\s*/g) ?? [];
    setWordCount(0);
    setDone(false);

    let idx = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function scheduleNext() {
      if (idx >= wordsRef.current.length) { setDone(true); return; }
      const word = wordsRef.current[idx];
      // Slower after sentence-ending punctuation
      const delay = /[.!?:;]\s*$/.test(word) ? 160 :
                    /[,]\s*$/.test(word) ? 80 : 38;
      idx++;
      setWordCount(idx);
      timer = setTimeout(scheduleNext, delay);
    }
    timer = setTimeout(scheduleNext, 80);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [text, active]);

  const displayed = active && !done
    ? (wordsRef.current.slice(0, wordCount).join("") || "")
    : text;

  return (
    <div className="streaming-content">
      {renderMarkdown(displayed)}
      {!done && active && <span className="stream-cursor" aria-hidden="true" />}
    </div>
  );
}

/* ── Tool pipeline steps ────────────────────────────────────── */
const DECISION_META: Record<string, { label: string; cls: string; icon: string }> = {
  ALLOW:            { label: "Allowed",          cls: "step-allow",    icon: "check" },
  APPROVAL_REQUIRED:{ label: "Needs Approval",   cls: "step-approval", icon: "clock" },
  BLOCK:            { label: "Blocked",           cls: "step-block",    icon: "x"     },
  BYPASS:           { label: "Bypassed",          cls: "step-bypass",   icon: "skip"  },
};

function StepIcon({ name }: { name: string }) {
  if (name === "check") return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
  if (name === "x") return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
  if (name === "clock") return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 19 12"/><polyline points="13 6 19 12 13 18"/>
    </svg>
  );
}

function ToolPipelineSteps({ results, isNew }: { results: AgentToolRun[]; isNew: boolean }) {
  const [visibleCount, setVisibleCount] = useState(isNew ? 0 : results.length);

  useEffect(() => {
    if (!isNew || (typeof process !== "undefined" && process.env.NODE_ENV === "test")) return;
    setVisibleCount(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    results.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), i * 300 + 200));
    });
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [results, isNew]);

  if (!results.length) return null;

  return (
    <div className="tool-pipeline-steps">
      {results.slice(0, visibleCount).map((r, i) => {
        const meta = DECISION_META[r.decision ?? ""] ?? { label: r.decision ?? "Unknown", cls: "step-bypass", icon: "skip" };
        return (
          <div key={i} className={`tool-step ${meta.cls} ${isNew ? "tool-step-enter" : ""}`} style={{ animationDelay: `${i * 300}ms` }}>
            <span className="tool-step-icon"><StepIcon name={meta.icon} /></span>
            <span className="tool-step-name">{r.name.replace(/_/g, " ")}</span>
            <span className="tool-step-arrow">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </span>
            <span className="tool-step-decision">{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Copy button ────────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* ignore */ }
  }
  return (
    <button type="button" onClick={handleCopy} className="copy-btn" title="Copy" aria-label="Copy message">
      {copied
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
      <span className="copy-label">{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

/* ── Main transcript ────────────────────────────────────────── */
export function ChatTranscript({ messages, thinking, onRetry, onFillScenario, onRunScenario }: ChatTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="chat-transcript" aria-live="polite" aria-label="Chat messages">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <p className="empty-title">How can I help you today?</p>
          <p className="empty-subtitle">
            Ask me to read documents, browse websites, or send emails.
            Every action is automatically evaluated by AgentShield before execution.
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

      {messages.map((message, idx) => {
        const isNew = !seenIds.current.has(message.id);
        if (isNew) seenIds.current.add(message.id);
        const isLatestAssistant = message.role === "assistant" && messages.slice(idx + 1).every((m) => m.role !== "assistant");

        /* User message — pill on the right */
        if (message.role === "user") {
          return (
            <div key={message.id} className={cn("gpt-row gpt-row-user", isNew && "msg-enter")}>
              <div className="gpt-user-pill group">
                <p className="whitespace-pre-wrap">{message.content}</p>
                <div className="msg-footer">
                  <span className="msg-time">{formatTime(message.timestamp)}</span>
                  <CopyButton text={message.content} />
                </div>
              </div>
            </div>
          );
        }

        /* Assistant — ChatGPT style: open text, no bubble */
        if (message.role === "assistant") {
          const results = message.metadata?.tool_results ?? [];
          const events  = message.metadata?.events ?? [];
          const decision = worstDecision(results);
          return (
            <div key={message.id} className={cn("gpt-row gpt-row-agent", isNew && "msg-enter")}>
              {/* Avatar column */}
              <div className="gpt-agent-avatar" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/>
                </svg>
              </div>

              {/* Content column */}
              <div className="gpt-agent-body">
                <p className="gpt-agent-name">AgentShield AI</p>

                {/* Tool steps row */}
                {results.length > 0 && (
                  <ToolPipelineSteps results={results} isNew={isNew && isLatestAssistant} />
                )}

                {/* Main text — open, no card */}
                <div className="gpt-agent-text">
                  <StreamingText text={message.content} active={isNew && isLatestAssistant} />
                </div>

                {/* Action bar on hover */}
                <div className="gpt-action-bar">
                  <CopyButton text={message.content} />
                  <span className="msg-time">{formatTime(message.timestamp)}</span>
                </div>

                {/* Security cards */}
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

        /* System message */
        if (message.role === "system") {
          return (
            <div key={message.id} className={cn("msg-system", message.metadata?.error && "msg-system-error", isNew && "msg-enter")} role="alert">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <p>{message.content}</p>
                {message.metadata?.retryMessage && onRetry ? (
                  <button type="button" className="retry-btn" onClick={() => onRetry(message.metadata?.retryMessage ?? "")}>Retry</button>
                ) : null}
              </div>
            </div>
          );
        }

        return null;
      })}

      {thinking ? <TypingIndicator /> : null}
      <div ref={endRef} />
    </div>
  );
}