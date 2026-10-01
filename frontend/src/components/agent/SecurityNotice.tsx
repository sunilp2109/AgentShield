"use client";

import { useState } from "react";
import Link from "next/link";

import { primaryEvent } from "@/lib/agent-chat";
import { approveApproval, rejectApproval } from "@/lib/security-api";
import type { AgentToolRun, SecurityEvent } from "@/types";

type SecurityNoticeProps = {
  decision: "BLOCK" | "APPROVAL_REQUIRED" | "BYPASS" | "ALLOW";
  results: AgentToolRun[];
  events: SecurityEvent[];
};

type ApprovalState = "idle" | "loading-approve" | "loading-reject" | "approved" | "rejected" | "error";

function InlineApprovalCard({
  approvalId,
  toolName,
  riskLevel,
  riskScore,
}: {
  approvalId: string | null | undefined;
  toolName: string | null | undefined;
  riskLevel: string | null | undefined;
  riskScore: number | null | undefined;
}) {
  const [state, setState] = useState<ApprovalState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const riskLabel =
    riskScore != null && riskLevel
      ? `${riskScore} / ${riskLevel}`
      : riskLevel
        ? String(riskLevel)
        : null;

  async function handleApprove() {
    if (!approvalId) return;
    setState("loading-approve");
    setErrorMsg(null);
    try {
      await approveApproval(approvalId, { decided_by: "chat-user" });
      setState("approved");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Approval failed");
      setState("error");
    }
  }

  async function handleReject() {
    if (!approvalId) return;
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    setState("loading-reject");
    setErrorMsg(null);
    try {
      await rejectApproval(approvalId, {
        decided_by: "chat-user",
        reason: rejectReason.trim() || "Rejected from chat",
      });
      setState("rejected");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Rejection failed");
      setState("error");
    }
  }

  /* ── Resolved states ─────────────────────────────────── */
  if (state === "approved") {
    return (
      <div className="inline-approval-resolved inline-approval-approved" role="status">
        <span className="approval-resolved-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <span>Action approved — tool will execute</span>
      </div>
    );
  }

  if (state === "rejected") {
    return (
      <div className="inline-approval-resolved inline-approval-rejected" role="status">
        <span className="approval-resolved-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
        <span>Action rejected — tool will not execute</span>
      </div>
    );
  }

  /* ── Pending approval card ───────────────────────────── */
  return (
    <section className="inline-approval-card" aria-label="Approval required">
      {/* Header */}
      <div className="inline-approval-header">
        <div className="inline-approval-pulse" aria-hidden="true" />
        <span className="inline-approval-label">AgentShield</span>
        <span className="inline-approval-badge">Awaiting approval</span>
      </div>

      <h3 className="inline-approval-title">Action requires your approval</h3>

      {/* Details row */}
      <div className="inline-approval-details">
        {toolName && (
          <div className="approval-detail-chip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <span>{toolName}</span>
          </div>
        )}
        {riskLabel && (
          <div className={`approval-detail-chip approval-risk-chip ${
            String(riskLevel) === "CRITICAL" ? "risk-critical" :
            String(riskLevel) === "HIGH" ? "risk-high" : "risk-low"
          }`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Risk: {riskLabel}</span>
          </div>
        )}
      </div>

      {/* Reject reason input */}
      {showRejectInput && state !== "loading-reject" && (
        <div className="approval-reject-input-wrap">
          <input
            type="text"
            className="approval-reject-input"
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleReject(); }}
            autoFocus
          />
        </div>
      )}

      {/* Error */}
      {state === "error" && errorMsg && (
        <p className="approval-error">{errorMsg}</p>
      )}

      {/* No approvalId warning */}
      {!approvalId && (
        <p className="approval-no-id">
          No approval ID found.{" "}
          <Link href="/approvals" className="approval-link">View in Approvals</Link>
        </p>
      )}

      {/* Action buttons */}
      {approvalId && (
        <div className="inline-approval-actions">
          <button
            type="button"
            disabled={state === "loading-approve" || state === "loading-reject"}
            onClick={() => void handleApprove()}
            className="approval-btn approval-btn-approve"
            aria-label="Approve this action"
          >
            {state === "loading-approve" ? (
              <span className="approval-spinner" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {state === "loading-approve" ? "Approving…" : "Approve"}
          </button>

          <button
            type="button"
            disabled={state === "loading-approve" || state === "loading-reject"}
            onClick={() => void handleReject()}
            className="approval-btn approval-btn-reject"
            aria-label="Reject this action"
          >
            {state === "loading-reject" ? (
              <span className="approval-spinner" />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            {state === "loading-reject"
              ? "Rejecting…"
              : showRejectInput
                ? "Confirm Reject"
                : "Reject"}
          </button>

          {showRejectInput && (
            <button
              type="button"
              onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
              className="approval-btn-cancel"
            >
              Cancel
            </button>
          )}

          <Link href="/approvals" className="approval-link approval-link-inline">
            Full Review
          </Link>
        </div>
      )}
    </section>
  );
}

export function SecurityNotice({ decision, results, events }: SecurityNoticeProps) {
  const event = primaryEvent(events);
  const lead = results.find((item) => item.decision === decision) ?? results[0];
  const riskLevel = event?.risk_level ?? lead?.risk_level;
  const riskScore = event?.risk_score ?? lead?.risk_score;
  const injection = event?.injection_detected;
  const toolName = event?.tool_name ?? lead?.name;
  const execution = event?.execution_status ?? lead?.execution_status;

  if (decision === "ALLOW") {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        AgentShield · Action allowed
      </p>
    );
  }

  if (decision === "BYPASS") {
    return (
      <p className="text-[11px] text-muted-foreground" role="status">
        AgentShield · Baseline / Bypass{execution ? ` · ${execution}` : ""}
      </p>
    );
  }

  if (decision === "APPROVAL_REQUIRED") {
    const approvalId = lead?.approval_id ?? event?.id;
    return (
      <InlineApprovalCard
        approvalId={approvalId}
        toolName={toolName}
        riskLevel={riskLevel}
        riskScore={riskScore}
      />
    );
  }

  const riskLabel =
    riskScore != null && riskLevel
      ? `${riskScore} / ${riskLevel}`
      : riskLevel
        ? String(riskLevel)
        : null;

  return (
    <section
      className="rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3"
      aria-label="Security action blocked"
    >
      <p className="text-xs font-medium tracking-wide text-destructive">AgentShield</p>
      <h3 className="mt-1 text-sm font-semibold">Action blocked</h3>
      <dl className="mt-2 space-y-1 text-sm text-muted-foreground">
        {injection === true ? (
          <div>
            <dt className="inline text-foreground/80">Prompt injection:</dt>{" "}
            <dd className="inline">Detected</dd>
          </div>
        ) : null}
        {riskLabel ? (
          <div>
            <dt className="inline text-foreground/80">Risk:</dt>{" "}
            <dd className="inline">{riskLabel}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline text-foreground/80">Policy:</dt>{" "}
          <dd className="inline">{event?.policy_decision ?? "BLOCK"}</dd>
        </div>
        <div>
          <dt className="inline text-foreground/80">Firewall:</dt>{" "}
          <dd className="inline">{event?.firewall_decision ?? "BLOCK"}</dd>
        </div>
        <div>
          <dt className="inline text-foreground/80">Tool:</dt>{" "}
          <dd className="inline">
            {execution && execution !== "EXECUTED" ? "NOT EXECUTED" : execution ?? "NOT EXECUTED"}
          </dd>
        </div>
      </dl>
    </section>
  );
}