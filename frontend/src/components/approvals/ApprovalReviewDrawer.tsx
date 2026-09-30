"use client";

import { useEffect, useState } from "react";

import { InjectionBadge } from "@/components/audit/AuditBadges";
import { ApprovalConfirmDialog } from "@/components/approvals/ApprovalConfirmDialog";
import { ApprovalPipeline } from "@/components/approvals/ApprovalPipeline";
import { ApprovalRiskIndicator } from "@/components/approvals/ApprovalRiskIndicator";
import { ApprovalStatusBadge } from "@/components/approvals/ApprovalStatusBadge";
import { Button } from "@/components/ui/button";
import {
  canApprove,
  canReject,
  executionFailed,
  executionSucceeded,
  isBlockedPolicy,
  safeResultFields,
  toolTitle,
} from "@/lib/approvals";
import { safeDisplay } from "@/lib/audit";
import { formatRelativeTime, formatSourceLabel } from "@/lib/format-time";
import type { ApprovalRequest } from "@/types";

type ApprovalReviewDrawerProps = {
  item: ApprovalRequest | null;
  submitting?: boolean;
  actionError?: string | null;
  copyFeedback?: string | null;
  onClose: () => void;
  onCopyRequestId: (requestId: string) => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
};

export function ApprovalReviewDrawer({
  item,
  submitting = false,
  actionError,
  copyFeedback,
  onClose,
  onCopyRequestId,
  onApprove,
  onReject,
}: ApprovalReviewDrawerProps) {
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!item) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !dialog && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, item, onClose, submitting]);

  if (!item) {
    return null;
  }

  const blocked = isBlockedPolicy(item);
  const expired = item.status === "EXPIRED";
  const showApprove = canApprove(item) && !blocked;
  const showReject = canReject(item) && !blocked;
  const resultFields = safeResultFields(item.result);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close approval review"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-review-title"
        className="relative z-50 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-card p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="approval-review-title" className="text-lg font-semibold tracking-tight">
              Review {toolTitle(item.tool_name)}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              AgentShield has paused this action because it requires human authorization.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ApprovalStatusBadge status={blocked ? "BLOCKED" : item.status} />
          <InjectionBadge detected={item.injection_detected} />
        </div>

        {blocked ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="status">
            BLOCKED BY POLICY. This action cannot be approved through the human-review workflow.
          </p>
        ) : null}

        {expired ? (
          <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-sm" role="status">
            EXPIRED. This request can no longer be approved or executed.
          </p>
        ) : null}

        {executionSucceeded(item) ? (
          <div className="mt-4 space-y-1 rounded-lg border border-success/30 bg-success/10 p-3 text-sm" role="status">
            <p>✓ Human approval granted</p>
            <p>✓ Security validation passed</p>
            <p>✓ Tool executed</p>
          </div>
        ) : null}

        {item.status === "APPROVED" && !executionSucceeded(item) && !executionFailed(item) ? (
          <p className="mt-4 text-sm" role="status">
            APPROVED. Waiting for tool execution.
          </p>
        ) : null}

        {executionFailed(item) ? (
          <div className="mt-4 space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm" role="status">
            <p>APPROVED</p>
            <p>EXECUTION FAILED</p>
            <p>{safeDisplay(item.execution_result_summary)}</p>
          </div>
        ) : null}

        {item.status === "REJECTED" ? (
          <div className="mt-4 space-y-1 rounded-lg border border-border bg-muted p-3 text-sm" role="status">
            <p>REJECTED</p>
            <p>Execution: NOT EXECUTED</p>
          </div>
        ) : null}

        {actionError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}

        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Request details</h4>
          <dl className="space-y-3 text-sm">
            <Detail label="Approval ID" value={safeDisplay(item.id)} />
            <div>
              <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Request ID</dt>
              <dd className="mt-1 flex items-center gap-2 font-mono text-xs">
                <span>{safeDisplay(item.request_id)}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => onCopyRequestId(item.request_id)}>
                  Copy
                </Button>
                {copyFeedback ? <span className="text-muted-foreground">{copyFeedback}</span> : null}
              </dd>
            </div>
            <Detail label="Session ID" value={safeDisplay(item.session_id)} />
            <Detail label="Created" value={formatRelativeTime(item.created_at)} />
            <Detail label="Expires" value={safeDisplay(item.expires_at)} />
          </dl>
        </section>

        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Source</h4>
          <dl className="space-y-3 text-sm">
            <Detail label="Source type" value={formatSourceLabel(item.source_type)} />
            <Detail label="Source name" value={safeDisplay(item.source_name)} />
            <Detail label="Trust level" value={safeDisplay(item.trust_level)} />
          </dl>
        </section>

        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Action</h4>
          <dl className="space-y-3 text-sm">
            <Detail label="Tool" value={safeDisplay(item.tool_name)} />
            <Detail label="Action" value={safeDisplay(item.action)} />
            <Detail label="Target resource" value={safeDisplay(item.target_resource)} />
            <Detail label="Destination type" value={safeDisplay(item.destination_type)} />
          </dl>
        </section>

        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Security assessment</h4>
          <ApprovalRiskIndicator score={item.risk_score} level={item.risk_level} />
          <dl className="space-y-3 text-sm">
            <Detail label="Injection detected" value={item.injection_detected ? "DETECTED" : "NOT DETECTED"} />
            <Detail
              label="Injection confidence"
              value={item.injection_confidence == null ? "Not recorded" : safeDisplay(item.injection_confidence)}
            />
            <Detail label="Policy decision" value={safeDisplay(item.policy_decision)} />
          </dl>
        </section>

        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reason</h4>
          <p className="text-sm">{safeDisplay(item.reason)}</p>
        </section>

        <section className="mt-6 space-y-3">
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Execution</h4>
          <dl className="space-y-3 text-sm">
            <Detail label="Current status" value={safeDisplay(item.status)} />
            <Detail label="Execution status" value={safeDisplay(item.execution_status)} />
          </dl>
          {resultFields.length > 0 ? (
            <dl className="space-y-3 text-sm">
              {resultFields.map((field) => (
                <Detail key={field.label} label={field.label} value={field.value} />
              ))}
            </dl>
          ) : null}
        </section>

        <section className="mt-6 rounded-xl border border-border bg-background/50 p-3">
          <h4 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Security pipeline
          </h4>
          <ApprovalPipeline item={item} />
        </section>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {showReject ? (
            <Button type="button" variant="destructive" onClick={() => setDialog("reject")} disabled={submitting}>
              Reject
            </Button>
          ) : null}
          {showApprove ? (
            <Button type="button" onClick={() => setDialog("approve")} disabled={submitting}>
              Approve & Execute
            </Button>
          ) : null}
        </div>
      </aside>

      {dialog === "approve" ? (
        <ApprovalConfirmDialog
          title="Approve this action?"
          description="AgentShield will authorize the pending action and allow the registered tool to execute."
          confirmLabel="Approve & Execute"
          pending={submitting}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            onApprove();
          }}
        />
      ) : null}

      {dialog === "reject" ? (
        <ApprovalConfirmDialog
          title="Reject this action?"
          description="The requested tool will not execute."
          confirmLabel="Reject Action"
          confirmVariant="destructive"
          pending={submitting}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            onReject(rejectReason);
          }}
        >
          <label className="mt-3 block text-sm" htmlFor="rejection-reason">
            Why are you rejecting this request?
          </label>
          <textarea
            id="rejection-reason"
            className="mt-1 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
          />
        </ApprovalConfirmDialog>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 break-all">{value}</dd>
    </div>
  );
}
