"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApprovalCard } from "@/components/approvals/ApprovalCard";
import { ApprovalMetrics } from "@/components/approvals/ApprovalMetrics";
import { ApprovalReviewDrawer } from "@/components/approvals/ApprovalReviewDrawer";
import { PageContainer } from "@/components/layout/PageContainer";
import { useOptionalSecurityConsole } from "@/components/security/SecurityConsoleProvider";
import { Button } from "@/components/ui/button";
import {
  APPROVAL_POLL_INTERVAL_MS,
  approvalCounts,
  approvalErrorMessage,
  countNewApprovalIds,
  pendingApprovals,
  type ApprovalCounts,
} from "@/lib/approvals";
import { approveApproval, getApproval, getApprovals, rejectApproval } from "@/lib/security-api";
import { cn } from "@/lib/utils";
import type { ApprovalRequest, LoadState } from "@/types";

type ApprovalsViewProps = {
  pollIntervalMs?: number;
};

export function ApprovalsView({ pollIntervalMs = APPROVAL_POLL_INTERVAL_MS }: ApprovalsViewProps) {
  const consoleState = useOptionalSecurityConsole();
  const [items, setItems] = useState<ApprovalRequest[] | null>(null);
  const [counts, setCounts] = useState<ApprovalCounts | null>(null);
  const [status, setStatus] = useState<LoadState>("loading");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [unseenCount, setUnseenCount] = useState(0);
  const submittingRef = useRef(false);
  const itemsRef = useRef<ApprovalRequest[] | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const applyItems = useCallback((incoming: ApprovalRequest[]) => {
    const previousPending = pendingApprovals(itemsRef.current ?? []);
    const nextPending = pendingApprovals(incoming);
    const freshIds = countNewApprovalIds(previousPending, nextPending);
    if (freshIds.length > 0) {
      setUnseenCount((count) => count + freshIds.length);
    }
    itemsRef.current = incoming;
    setItems(incoming);
    setCounts(approvalCounts(incoming));
    setConnected(true);
    setStale(false);
    setStatus(nextPending.length === 0 ? "empty" : "success");
    setSelected((current) => {
      if (!current) {
        return current;
      }
      const latest = incoming.find((item) => item.id === current.id);
      if (!latest) {
        return current;
      }
      const terminal = new Set(["EXECUTED", "REJECTED", "EXPIRED", "EXECUTION_FAILED"]);
      if (terminal.has(current.status) && !terminal.has(latest.status)) {
        return current;
      }
      return latest;
    });
  }, []);

  const applyError = useCallback(() => {
    setConnected(false);
    if (itemsRef.current) {
      setStale(true);
      setStatus(pendingApprovals(itemsRef.current).length === 0 ? "empty" : "success");
    } else {
      setStatus("error");
    }
  }, []);

  const load = useCallback(async (options?: { force?: boolean }) => {
    if (submittingRef.current && !options?.force) {
      return;
    }
    try {
      const incoming = await getApprovals();
      applyItems(incoming);
    } catch {
      applyError();
    }
  }, [applyError, applyItems]);

  useEffect(() => {
    let cancelled = false;
    void getApprovals()
      .then((incoming) => {
        if (!cancelled) {
          applyItems(incoming);
        }
      })
      .catch(() => {
        if (!cancelled) {
          applyError();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyError, applyItems]);

  useEffect(() => {
    if (pollIntervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void load();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [load, pollIntervalMs]);

  const openReview = useCallback(async (item: ApprovalRequest) => {
    setActionError(null);
    setSelected(item);
    try {
      const latest = await getApproval(item.id);
      setSelected(latest);
    } catch {
      setSelected(item);
    }
  }, []);

  const finishMutation = useCallback(
    async (result: ApprovalRequest) => {
      setSelected(result);
      await load({ force: true });
      await consoleState?.refresh();
    },
    [consoleState, load],
  );

  const handleApprove = useCallback(async () => {
    if (!selected || selected.policy_decision === "BLOCK") {
      return;
    }
    if (selected.status !== "PENDING" && selected.status !== "APPROVED") {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await approveApproval(selected.id);
      await finishMutation(result);
    } catch (error) {
      try {
        const latest = await getApproval(selected.id);
        if (latest.status === "EXECUTED") {
          await finishMutation(latest);
          return;
        }
        if (latest.status === "APPROVED") {
          const retried = await approveApproval(latest.id);
          await finishMutation(retried);
          return;
        }
        setSelected(latest);
        await load({ force: true });
        await consoleState?.refresh();
      } catch {
        setSelected(selected);
      }
      setActionError(approvalErrorMessage(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [consoleState, finishMutation, load, selected]);

  const handleReject = useCallback(
    async (reason: string) => {
      if (!selected || selected.status !== "PENDING" || selected.policy_decision === "BLOCK") {
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setActionError(null);
      try {
        const payload = reason.trim() ? { reason: reason.trim() } : {};
        const result = await rejectApproval(selected.id, payload);
        await finishMutation(result);
      } catch (error) {
        try {
          const latest = await getApproval(selected.id);
          setSelected(latest);
          await load({ force: true });
        } catch {
          setSelected(selected);
        }
        setActionError(approvalErrorMessage(error));
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [finishMutation, load, selected],
  );

  const copyRequestId = useCallback(async (requestId: string) => {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopyFeedback("Copied");
    } catch {
      setCopyFeedback("Copy failed");
    }
    window.setTimeout(() => setCopyFeedback(null), 1500);
  }, []);

  const queue = pendingApprovals(items ?? []);

  return (
    <PageContainer
      title="Human Approval Queue"
      subtitle="Review agent actions that require authorization before execution."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            "inline-flex items-center gap-2 text-xs font-medium",
            connected ? "text-success" : "text-muted-foreground",
          )}
          role="status"
        >
          <span className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-muted-foreground/70")} />
          {connected
            ? "Approval system connected"
            : connected === false
              ? "Approval system unavailable"
              : "Connecting..."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {pollIntervalMs > 0 ? <span className="text-xs text-muted-foreground">Auto-refresh ON</span> : null}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
            Refresh now
          </Button>
        </div>
      </div>

      <p className="text-sm">
        Pending: {counts ? counts.pending : status === "loading" ? "…" : "—"}
      </p>

      <ApprovalMetrics
        counts={counts}
        loading={status === "loading" && !counts}
        error={!connected && !counts}
      />

      {unseenCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm">
            {unseenCount} new approval{unseenCount === 1 ? "" : "s"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setUnseenCount(0);
              void load();
            }}
          >
            View new approvals
          </Button>
        </div>
      ) : null}

      <section className="space-y-3" aria-label="Approval requests">
        {stale ? <p className="text-xs text-muted-foreground">Showing previously loaded requests.</p> : null}
        {status === "loading" ? <ApprovalSkeleton /> : null}
        {status === "error" ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-destructive" role="alert">
              Unable to load approval queue.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}
        {status === "empty" ? (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm font-medium">No pending approvals</p>
            <p className="mt-1 text-sm text-muted-foreground">
              AgentShield has no actions waiting for human authorization.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Run a legitimate high-risk action to create an approval request.
            </p>
          </div>
        ) : null}
        {status === "success" ? (
          <div className="grid gap-3">
            {queue.map((item) => (
              <ApprovalCard key={item.id} item={item} onReview={(next) => void openReview(next)} />
            ))}
          </div>
        ) : null}
      </section>

      <ApprovalReviewDrawer
        key={selected?.id ?? "closed"}
        item={selected}
        submitting={submitting}
        actionError={actionError}
        copyFeedback={copyFeedback}
        onClose={() => {
          setSelected(null);
          setActionError(null);
        }}
        onCopyRequestId={(id) => void copyRequestId(id)}
        onApprove={() => void handleApprove()}
        onReject={(reason) => void handleReject(reason)}
      />
    </PageContainer>
  );
}

function ApprovalSkeleton() {
  return (
    <div className="space-y-3" data-testid="approvals-skeleton">
      <div className="h-36 animate-pulse rounded-xl bg-muted" />
      <div className="h-36 animate-pulse rounded-xl bg-muted" />
      <div className="h-36 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
