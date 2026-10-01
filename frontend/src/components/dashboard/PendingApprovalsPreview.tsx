"use client";

import Link from "next/link";

import { formatRelativeTime } from "@/lib/format-time";
import type { ApprovalRequest, LoadState } from "@/types";

type PendingApprovalsPreviewProps = {
  approvals: ApprovalRequest[] | null;
  status: LoadState;
};

export function PendingApprovalsPreview({ approvals, status }: PendingApprovalsPreviewProps) {
  const items = approvals ?? [];

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Pending approvals">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Pending Approvals</h2>
          <p className="text-xs text-muted-foreground">
            {status === "success" ? `${items.length} pending` : "Human review queue"}
          </p>
        </div>
        <Link
          href="/approvals"
          className="text-xs font-medium text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          View all approvals →
        </Link>
      </div>
      {status === "loading" ? (
        <div className="mt-4 space-y-2" data-testid="approvals-skeleton">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
        </div>
      ) : null}
      {status === "error" ? (
        <p className="mt-3 text-sm text-destructive">Unable to load approvals.</p>
      ) : null}
      {status === "empty" || (status === "success" && items.length === 0) ? (
        <p className="mt-3 text-sm text-muted-foreground">No pending approvals.</p>
      ) : null}
      {status === "success" && items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {items.slice(0, 4).map((item) => (
            <li key={item.id} className="rounded-lg border border-border/80 px-3 py-2">
              <p className="text-sm font-medium">{item.tool_name}</p>
              <p className="text-xs text-muted-foreground">
                Risk CVSS {item.risk_score != null ? item.risk_score.toFixed(1) : "n/a"} · {formatRelativeTime(item.created_at)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
