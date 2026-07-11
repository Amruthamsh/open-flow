import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { generatePlan, executePlan, checkConnectivity } from "../lib/tauri-api";
import { createVoiceRecognition } from "../lib/voice";
import type { Plan, ExecutionResult, AppPhase, StepResult, ConnectivityLevel } from "../lib/types";
import {
  Send,
  X,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Mic,
  MicOff,
  FileOutput,
  FolderOpen,
  Globe,
  Terminal,
  Code,
  AppWindow,
  RotateCcw,
  Monitor,
  Type,
  MousePointer,
  ArrowUpDown,
  FileText,
  PenTool,
  MessageSquare,
  Languages,
  Volume2,
  Camera,
  Search,
  Clock,
  Bell,
  Wifi,
  WifiOff,
  Cloud,
  FilePlus,
  Play,
  FileSearch,
} from "lucide-react";

const actionIcons: Record<string, React.ReactNode> = {
  move_file: <FileOutput className="w-3.5 h-3.5" />,
  create_directory: <FolderOpen className="w-3.5 h-3.5" />,
  open_application: <AppWindow className="w-3.5 h-3.5" />,
  open_url: <Globe className="w-3.5 h-3.5" />,
  open_in_vscode: <Code className="w-3.5 h-3.5" />,
  open_terminal: <Terminal className="w-3.5 h-3.5" />,
  read_screen: <Monitor className="w-3.5 h-3.5" />,
  type_text: <Type className="w-3.5 h-3.5" />,
  click_element: <MousePointer className="w-3.5 h-3.5" />,
  scroll: <ArrowUpDown className="w-3.5 h-3.5" />,
  explain_document: <FileText className="w-3.5 h-3.5" />,
  fill_form: <PenTool className="w-3.5 h-3.5" />,
  summarize_content: <FileText className="w-3.5 h-3.5" />,
  compose_message: <MessageSquare className="w-3.5 h-3.5" />,
  translate_text: <Languages className="w-3.5 h-3.5" />,
  read_aloud: <Volume2 className="w-3.5 h-3.5" />,
  take_screenshot: <Camera className="w-3.5 h-3.5" />,
  search_web: <Search className="w-3.5 h-3.5" />,
  wait: <Clock className="w-3.5 h-3.5" />,
  notify_user: <Bell className="w-3.5 h-3.5" />,
  write_file: <FilePlus className="w-3.5 h-3.5" />,
  run_script: <Play className="w-3.5 h-3.5" />,
  read_file: <FileSearch className="w-3.5 h-3.5" />,
};

const connectivityColors: Record<ConnectivityLevel, string> = {
  cloud: "text-emerald-400",
  edge: "text-amber-400",
  local: "text-red-400",
};

const connectivityLabels: Record<ConnectivityLevel, string> = {
  cloud: "Cloud",
  edge: "Edge",
  local: "Offline",
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
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [connectivity, setConnectivity] = useState<ConnectivityLevel>("cloud");
  const voiceRef = useRef<ReturnType<typeof createVoiceRecognition>>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check connectivity on mount
  useEffect(() => {
    checkConnectivity()
      .then((status) => setConnectivity(status.level as ConnectivityLevel))
      .catch(() => setConnectivity("local"));
  }, []);

  // Listen for voice commands from the Pet orb
  useEffect(() => {
    const handler = (e: Event) => {
      const transcript = (e as CustomEvent).detail;
      if (transcript && phase === "idle") {
        setInput(transcript);
        setTimeout(() => submitCommand(transcript), 100);
      }
    };
    window.addEventListener("nova-voice-command", handler);
    return () => window.removeEventListener("nova-voice-command", handler);
  }, [phase]);

  // Initialize voice recognition
  useEffect(() => {
    voiceRef.current = createVoiceRecognition(
      (transcript, isFinal) => {
        if (isFinal) {
          setInput(transcript);
          setInterimText("");
          setTimeout(() => submitCommand(transcript), 100);
        } else {
          setInterimText(transcript);
        }
      },
      (listening) => {
        setIsListening(listening);
        if (!listening) setInterimText("");
      }
    );
  }, []);

  const handleClose = async () => {
    const win = getCurrentWindow();
    await win.hide();
  };

  const submitCommand = async (text: string) => {
    if (!text.trim()) return;
    const cmd = text.trim();
    setCommand(cmd);
    setInput("");
    setPhase("planning");
    setError(null);
    setPlan(null);
    setResult(null);

    try {
      const newPlan = await generatePlan(cmd);
      setPlan(newPlan);
      setPhase("confirming");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submitCommand(input);
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

  const toggleVoice = () => {
    if (!voiceRef.current) return;
    if (isListening) {
      voiceRef.current.stop();
    } else {
      voiceRef.current.start();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0a0a0f]/95 backdrop-blur-2xl rounded-2xl border border-white/[0.06] overflow-hidden shadow-2xl">
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <span className="text-[11px] font-medium text-white/50 tracking-wide uppercase" data-tauri-drag-region>
            OpenFlow
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Connectivity indicator */}
          <div className={`flex items-center gap-1 ${connectivityColors[connectivity]}`}>
            {connectivity === "cloud" ? (
              <Cloud className="w-3 h-3" />
            ) : connectivity === "edge" ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            <span className="text-[9px] uppercase tracking-wider">
              {connectivityLabels[connectivity]}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-3 h-3 text-white/40" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {phase === "idle" && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/[0.06] flex items-center justify-center">
              <div className="w-4 h-4 rounded-sm rotate-45 bg-gradient-to-br from-purple-400/80 to-blue-400/60" />
            </div>
            <div className="text-center">
              <p className="text-[13px] text-white/50">
                {isListening ? (
                  <span className="text-blue-400">
                    {interimText || "Listening..."}
                  </span>
                ) : (
                  "How can I help?"
                )}
              </p>
              <p className="text-[10px] text-white/25 mt-1">
                Fill forms · Read screens · Navigate apps · Explain docs
              </p>
            </div>
          </div>
        )}

        {phase === "planning" && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="relative">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
            </div>
            <p className="text-[12px] text-white/40">Planning...</p>
            <p className="text-[11px] text-white/25 max-w-[240px] text-center">
              "{command}"
            </p>
          </div>
        )}

        {phase === "confirming" && plan && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] font-medium text-white/80">{plan.summary}</p>
            <div className="flex flex-col gap-1">
              {plan.steps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] ${
                    step.destructive
                      ? "bg-red-500/[0.06] border border-red-500/10 text-red-300/80"
                      : "bg-white/[0.02] border border-white/[0.04] text-white/60"
                  }`}
                >
                  <span className="opacity-50">
                    {actionIcons[step.action] || <FileOutput className="w-3.5 h-3.5" />}
                  </span>
                  <span className="flex-1">{step.description}</span>
                  {step.destructive && <AlertTriangle className="w-3 h-3 text-red-400/60" />}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-white/30">
                {plan.steps.length} step{plan.steps.length > 1 ? "s" : ""}
                {plan.steps.some(s => s.destructive) && " · will modify files"}
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setPhase("idle"); setPlan(null); }}
                  className="px-3 py-1.5 rounded-lg text-[11px] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-3.5 py-1.5 rounded-lg text-[11px] font-medium bg-purple-600/90 text-white hover:bg-purple-500/90 transition-colors"
                >
                  Run
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "executing" && plan && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span className="text-[11px] text-white/50">
                Step {executingIndex + 1} of {plan.steps.length}
              </span>
            </div>
            {plan.steps.map((step, i) => {
              const r = stepResults[i];
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] transition-all duration-200 ${
                    r
                      ? r.success
                        ? "bg-emerald-500/[0.06] border border-emerald-500/10 text-emerald-300/80"
                        : "bg-red-500/[0.06] border border-red-500/10 text-red-300/80"
                      : i === executingIndex
                        ? "bg-purple-500/[0.06] border border-purple-500/15 text-purple-300/80"
                        : "bg-white/[0.01] border border-white/[0.03] text-white/30"
                  }`}
                >
                  {r ? (
                    r.success ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />
                  ) : i === executingIndex ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-white/10" />
                  )}
                  <span className="flex-1 truncate">{step.description}</span>
                </div>
              );
            })}
          </div>
        )}

        {phase === "done" && result && (
          <div className="flex flex-col gap-3">
            <div
              className={`flex items-center gap-3 p-3 rounded-xl ${
                result.steps_failed === 0
                  ? "bg-emerald-500/[0.06] border border-emerald-500/10"
                  : "bg-amber-500/[0.06] border border-amber-500/10"
              }`}
            >
              {result.steps_failed === 0 ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <div>
                <p className="text-[12px] font-medium text-white/80">
                  {result.steps_failed === 0 ? "Done" : "Completed with errors"}
                </p>
                <p className="text-[10px] text-white/30 mt-0.5">
                  {result.steps_succeeded}/{result.results.length} steps · {result.total_duration_ms}ms
                </p>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white/50 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              New command
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="bg-red-500/[0.06] border border-red-500/10 rounded-xl p-3 max-w-full">
              <p className="text-[11px] text-red-300/80 break-words">{error}</p>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-white/50 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Input bar */}
      {(phase === "idle" || phase === "done") && (
        <form onSubmit={handleSubmit} className="p-3 pt-0">
          <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 focus-within:border-purple-500/30 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={isListening ? interimText : input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening..." : "What should I do?"}
              className="flex-1 bg-transparent outline-none text-[12px] text-white/90 placeholder:text-white/20"
              autoFocus
              readOnly={isListening}
            />
            <button
              type="button"
              onClick={toggleVoice}
              className={`p-1.5 rounded-lg transition-all duration-200 ${
                isListening
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-white/25 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              {isListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            </button>
            <button
              type="submit"
              disabled={!input.trim() || isListening}
              className="p-1.5 rounded-lg bg-purple-600/80 text-white disabled:opacity-20 hover:bg-purple-500/80 transition-all"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
