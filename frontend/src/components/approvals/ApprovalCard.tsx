import { InjectionBadge } from "@/components/audit/AuditBadges";
import { ApprovalRiskIndicator } from "@/components/approvals/ApprovalRiskIndicator";
import { ApprovalStatusBadge } from "@/components/approvals/ApprovalStatusBadge";
import { Button } from "@/components/ui/button";
import {
  approvalSourceLabel,
  canApprove,
  formatExpiresIn,
  isBlockedPolicy,
  toolTitle,
} from "@/lib/approvals";
import { safeDisplay } from "@/lib/audit";
import { formatRelativeTime } from "@/lib/format-time";
import type { ApprovalRequest } from "@/types";

type ApprovalCardProps = {
  item: ApprovalRequest;
  onReview: (item: ApprovalRequest) => void;
};

export function ApprovalCard({ item, onReview }: ApprovalCardProps) {
  const blocked = isBlockedPolicy(item);
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold tracking-wide">{toolTitle(item.tool_name)}</h3>
          <ApprovalStatusBadge status={blocked ? "BLOCKED" : item.status} />
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="Source" value={approvalSourceLabel(item.source_type)} />
          <Detail label="Action" value={safeDisplay(item.action)} />
          <Detail label="Destination" value={safeDisplay(item.target_resource ?? item.destination_type)} />
          <div>
            <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Risk</dt>
            <dd className="mt-1">
              <ApprovalRiskIndicator score={item.risk_score} level={item.risk_level} />
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">Injection</dt>
            <dd className="mt-1">
              <InjectionBadge detected={item.injection_detected} />
            </dd>
          </div>
          <Detail label="Created" value={formatRelativeTime(item.created_at)} />
          <Detail label="Expires" value={formatExpiresIn(item.expires_at)} />
        </dl>
        <p className="text-sm text-muted-foreground">{safeDisplay(item.reason)}</p>
        {blocked ? (
          <p className="text-sm text-destructive" role="status">
            BLOCKED BY POLICY. This action cannot be approved through the human-review workflow.
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {canApprove(item) ? (
          <Button type="button" onClick={() => onReview(item)}>
            Review
          </Button>
        ) : null}
        {blocked ? (
          <p className="text-xs font-medium tracking-wide text-destructive">BLOCKED BY POLICY</p>
        ) : null}
      </div>
    </article>
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
