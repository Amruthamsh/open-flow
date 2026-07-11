import { useState } from "react";
import { ChatInput } from "../components/chat/ChatInput";
import { PlanPreview } from "../components/plan/PlanPreview";
import { ConfirmDialog } from "../components/plan/ConfirmDialog";
import { ExecutionPanel } from "../components/execution/ExecutionPanel";
import { ResultLog } from "../components/execution/ResultLog";
import { generatePlan, executePlan } from "../lib/tauri-api";
import type { Plan, ExecutionResult, AppPhase, StepResult } from "../lib/types";

export function Home() {
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [command, setCommand] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executingIndex, setExecutingIndex] = useState(-1);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);

  const handleSubmit = async (input: string) => {
    setCommand(input);
    setPhase("planning");
    setError(null);
    setPlan(null);
    setResult(null);

    try {
      const newPlan = await generatePlan(input);
      setPlan(newPlan);
      setPhase("confirming");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const handleConfirm = async () => {
    if (!plan) return;
    setPhase("executing");
    setExecutingIndex(0);

    try {
      const execResult = await executePlan(plan, (index, results) => {
        setExecutingIndex(index);
        setStepResults(results);
      });
      setResult(execResult);
      setPhase("done");

      // Log to SQLite
      try {
        const { default: Database } = await import(
          "@tauri-apps/plugin-sql"
        );
        const db = await Database.load("sqlite:nova.db");
        await db.execute(
          `INSERT INTO activity_log (command, plan_json, status, steps_total, steps_succeeded, steps_failed, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            command,
            JSON.stringify(plan),
            execResult.steps_failed === 0
              ? "success"
              : execResult.steps_succeeded === 0
                ? "failed"
                : "partial",
            plan.steps.length,
            execResult.steps_succeeded,
            execResult.steps_failed,
            execResult.total_duration_ms,
          ]
        );
      } catch {
        // Don't fail the execution if logging fails
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const handleCancel = () => {
    setPhase("idle");
    setPlan(null);
  };

  const handleReset = () => {
    setPhase("idle");
    setCommand("");
    setPlan(null);
    setResult(null);
    setError(null);
    setExecutingIndex(-1);
    setStepResults([]);
  };

  return (
    <div className="flex flex-col h-full p-6">
      {phase === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-2">What can I help you with?</h1>
            <p className="text-[hsl(var(--muted-foreground))] text-sm">
              Describe what you'd like to do and I'll create a plan for you.
            </p>
          </div>
          <ChatInput onSubmit={handleSubmit} disabled={false} />
        </div>
      )}

      {phase === "planning" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Creating a plan for: "{command}"
            </p>
          </div>
        </div>
      )}

      {phase === "confirming" && plan && (
        <div className="flex-1 flex flex-col gap-4 overflow-auto">
          <PlanPreview plan={plan} command={command} />
          <ConfirmDialog
            plan={plan}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        </div>
      )}

      {phase === "executing" && plan && (
        <div className="flex-1 flex flex-col gap-4 overflow-auto">
          <ExecutionPanel plan={plan} currentIndex={executingIndex} results={stepResults} />
        </div>
      )}

      {phase === "done" && result && (
        <div className="flex-1 flex flex-col gap-4 overflow-auto">
          <ResultLog result={result} command={command} />
          <button
            onClick={handleReset}
            className="self-center px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            New Command
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 max-w-md text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg bg-[hsl(var(--secondary))] text-sm hover:bg-[hsl(var(--secondary))]/80 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
