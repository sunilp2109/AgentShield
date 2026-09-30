import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ApprovalConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
};

export function ApprovalConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  pending = false,
  onCancel,
  onConfirm,
  children,
}: ApprovalConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Cancel confirmation"
        disabled={pending}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-confirm-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-xl"
      >
        <h3 id="approval-confirm-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button type="button" size="sm" variant={confirmVariant} onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
