import type { Plan, StepResult } from "../../lib/types";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface ExecutionPanelProps {
  plan: Plan;
  currentIndex: number;
  results: StepResult[];
}

export function ExecutionPanel({ plan, currentIndex, results }: ExecutionPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--primary))]" />
        <span className="text-sm font-medium">
          Executing step {currentIndex + 1} of {plan.steps.length}...
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {plan.steps.map((step, i) => {
          const result = results[i];
          return (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-md text-xs ${
                result
                  ? result.success
                    ? "bg-green-500/5 border border-green-500/20"
                    : "bg-red-500/5 border border-red-500/20"
                  : i === currentIndex
                    ? "bg-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/20"
                    : "bg-[hsl(var(--secondary))]/30"
              }`}
            >
              {result ? (
                result.success ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )
              ) : i === currentIndex ? (
                <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--primary))]" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-[hsl(var(--border))]" />
              )}
              <span className="flex-1">{step.description}</span>
              {result && (
                <span className="text-[hsl(var(--muted-foreground))]">
                  {result.duration_ms}ms
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
