import { approvalPipelineStages } from "@/lib/approvals";
import { safeDisplay } from "@/lib/audit";
import type { ApprovalRequest } from "@/types";

type ApprovalPipelineProps = {
  item: ApprovalRequest;
};

export function ApprovalPipeline({ item }: ApprovalPipelineProps) {
  const stages = approvalPipelineStages(item);
  return (
    <ol className="space-y-2" aria-label="Security pipeline">
      {stages.map((stage, index) => (
        <li key={stage.label}>
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{stage.label}</p>
          <p className="text-sm font-medium">{safeDisplay(stage.value)}</p>
          {index < stages.length - 1 ? (
            <p className="text-muted-foreground" aria-hidden="true">
              ↓
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
