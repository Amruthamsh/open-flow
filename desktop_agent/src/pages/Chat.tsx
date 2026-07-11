import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { generatePlan, executePlan } from "../lib/tauri-api";
import type { Plan, ExecutionResult, AppPhase, StepResult } from "../lib/types";
import {
  Send,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  FileOutput,
  FolderOpen,
  Globe,
  Terminal,
  Code,
  AppWindow,
} from "lucide-react";

const actionIcons: Record<string, React.ReactNode> = {
  move_file: <FileOutput className="w-3.5 h-3.5" />,
  create_directory: <FolderOpen className="w-3.5 h-3.5" />,
  open_application: <AppWindow className="w-3.5 h-3.5" />,
  open_url: <Globe className="w-3.5 h-3.5" />,
  open_in_vscode: <Code className="w-3.5 h-3.5" />,
  open_terminal: <Terminal className="w-3.5 h-3.5" />,
};

export function Chat() {
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [command, setCommand] = useState("");
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executingIndex, setExecutingIndex] = useState(-1);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);

  const handleClose = async () => {
    const win = getCurrentWindow();
    await win.hide();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setCommand(input.trim());
    setInput("");
    setPhase("planning");
    setError(null);
    setPlan(null);
    setResult(null);

    try {
      const newPlan = await generatePlan(input.trim());
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
    setStepResults([]);

    try {
      const execResult = await executePlan(plan, (index, results) => {
        setExecutingIndex(index);
        setStepResults(results);
      });
      setResult(execResult);
      setPhase("done");

      try {
        const { default: Database } = await import("@tauri-apps/plugin-sql");
        const db = await Database.load("sqlite:nova.db");
        await db.execute(
          `INSERT INTO activity_log (command, plan_json, status, steps_total, steps_succeeded, steps_failed, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            command,
            JSON.stringify(plan),
            execResult.steps_failed === 0 ? "success" : execResult.steps_succeeded === 0 ? "failed" : "partial",
            plan.steps.length,
            execResult.steps_succeeded,
            execResult.steps_failed,
            execResult.total_duration_ms,
          ]
        );
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
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
    <div className="w-full h-full flex flex-col bg-[hsl(0,0%,8%)]/95 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b border-white/5"
        data-tauri-drag-region
      >
        <span className="text-xs font-medium text-white/70" data-tauri-drag-region>
          Nova
        </span>
        <button
          onClick={handleClose}
          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-3 h-3 text-white/50" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {phase === "idle" && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-white/40 text-center">
              What would you like me to do?
            </p>
          </div>
        )}

        {phase === "planning" && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            <p className="text-xs text-white/50">Thinking...</p>
          </div>
        )}

        {phase === "confirming" && plan && (
          <div className="flex flex-col gap-3">
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs font-medium text-white/90 mb-2">{plan.summary}</p>
              <div className="flex flex-col gap-1.5">
                {plan.steps.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                      step.destructive
                        ? "bg-red-500/10 text-red-300"
                        : "bg-white/5 text-white/70"
                    }`}
                  >
                    <span className="opacity-60">
                      {actionIcons[step.action] || <FileOutput className="w-3.5 h-3.5" />}
                    </span>
                    <span className="flex-1">{step.description}</span>
                    {step.destructive && <AlertTriangle className="w-3 h-3 text-red-400" />}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>{plan.steps.some((s) => s.destructive) ? "Will modify files" : "Safe to run"}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setPhase("idle"); setPlan(null); }}
                  className="px-2.5 py-1 rounded-md text-[11px] bg-white/5 text-white/60 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-3 py-1 rounded-md text-[11px] font-medium bg-purple-600 text-white hover:bg-purple-500"
                >
                  Run
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "executing" && plan && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-white/70">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span>Running {executingIndex + 1}/{plan.steps.length}...</span>
            </div>
            <div className="flex flex-col gap-1">
              {plan.steps.map((step, i) => {
                const r = stepResults[i];
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] ${
                      r
                        ? r.success
                          ? "bg-green-500/10 text-green-300"
                          : "bg-red-500/10 text-red-300"
                        : i === executingIndex
                          ? "bg-purple-500/10 text-purple-300"
                          : "bg-white/5 text-white/40"
                    }`}
                  >
                    {r ? (
                      r.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />
                    ) : i === executingIndex ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-white/20" />
                    )}
                    <span className="flex-1 truncate">{step.description}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col gap-3">
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                result.steps_failed === 0
                  ? "bg-green-500/10 border border-green-500/20"
                  : "bg-yellow-500/10 border border-yellow-500/20"
              }`}
            >
              {result.steps_failed === 0 ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
              )}
              <div>
                <p className="text-xs font-medium text-white/90">
                  {result.steps_failed === 0 ? "Done!" : "Completed with errors"}
                </p>
                <p className="text-[11px] text-white/50">
                  {result.steps_succeeded}/{result.results.length} steps · {result.total_duration_ms}ms
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="self-center px-3 py-1.5 rounded-md text-[11px] bg-purple-600 text-white hover:bg-purple-500"
            >
              New Command
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
              <p className="text-[11px] text-red-300">{error}</p>
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-md text-[11px] bg-white/5 text-white/60 hover:bg-white/10"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Input bar - always visible */}
      {(phase === "idle" || phase === "done") && (
        <form onSubmit={handleSubmit} className="p-3 pt-0">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus-within:border-purple-500/50">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Nova anything..."
              className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-white/30"
              autoFocus
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-1 rounded-md bg-purple-600 text-white disabled:opacity-30 hover:bg-purple-500 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
