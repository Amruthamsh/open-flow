import type { ExecutionResult } from "../../lib/types";
import { CheckCircle, XCircle, Clock, Zap } from "lucide-react";

interface ResultLogProps {
  result: ExecutionResult;
  command: string;
}

export function ResultLog({ result, command }: ResultLogProps) {
  const allSuccess = result.steps_failed === 0;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`flex items-center gap-3 p-4 rounded-lg border ${
          allSuccess
            ? "bg-green-500/5 border-green-500/20"
            : "bg-yellow-500/5 border-yellow-500/20"
        }`}
      >
        {allSuccess ? (
          <CheckCircle className="w-5 h-5 text-green-400" />
        ) : (
          <XCircle className="w-5 h-5 text-yellow-400" />
        )}
        <div>
          <p className="text-sm font-medium">
            {allSuccess ? "All steps completed successfully" : "Some steps failed"}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
            "{command}"
          </p>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {result.results.length} steps
        </span>
        <span className="flex items-center gap-1 text-green-400">
          <CheckCircle className="w-3 h-3" />
          {result.steps_succeeded} passed
        </span>
        {result.steps_failed > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="w-3 h-3" />
            {result.steps_failed} failed
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {result.total_duration_ms}ms
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {result.results.map((r, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-md text-xs ${
              r.success
                ? "bg-[hsl(var(--secondary))]/30"
                : "bg-red-500/5 border border-red-500/20"
            }`}
          >
            {r.success ? (
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p>{r.step.description}</p>
              {r.error && (
                <p className="text-red-400 mt-1 truncate">{r.error}</p>
              )}
            </div>
            <span className="text-[hsl(var(--muted-foreground))] flex-shrink-0">
              {r.duration_ms}ms
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
