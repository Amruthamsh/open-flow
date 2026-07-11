import type { Plan } from "../../lib/types";
import { ShieldCheck, X } from "lucide-react";

interface ConfirmDialogProps {
  plan: Plan;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ plan, onConfirm, onCancel }: ConfirmDialogProps) {
  const hasDestructive = plan.steps.some((s) => s.destructive);

  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))]">
      <div className="flex items-center gap-2 text-sm">
        <ShieldCheck className="w-4 h-4 text-[hsl(var(--primary))]" />
        <span>
          {hasDestructive
            ? "This plan will modify files. Proceed?"
            : "Ready to execute this plan?"}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--secondary))]/80 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-white hover:opacity-90 transition-opacity"
        >
          Execute
        </button>
      </div>
    </div>
  );
}
