import type { Plan } from "../../lib/types";
import {
  FolderOpen,
  FileOutput,
  Globe,
  Terminal,
  Code,
  AppWindow,
  AlertTriangle,
} from "lucide-react";

interface PlanPreviewProps {
  plan: Plan;
  command: string;
}

const actionIcons: Record<string, React.ReactNode> = {
  move_file: <FileOutput className="w-4 h-4" />,
  create_directory: <FolderOpen className="w-4 h-4" />,
  open_application: <AppWindow className="w-4 h-4" />,
  open_url: <Globe className="w-4 h-4" />,
  open_in_vscode: <Code className="w-4 h-4" />,
  open_terminal: <Terminal className="w-4 h-4" />,
};

export function PlanPreview({ plan, command }: PlanPreviewProps) {
  const destructiveCount = plan.steps.filter((s) => s.destructive).length;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">
          Command
        </p>
        <p className="text-sm font-medium">"{command}"</p>
      </div>

      <div className="bg-[hsl(var(--card))] rounded-lg p-4 border border-[hsl(var(--border))]">
        <p className="text-sm font-medium mb-3">{plan.summary}</p>
        <div className="flex flex-col gap-2">
          {plan.steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-2 rounded-md text-xs ${
                step.destructive
                  ? "bg-red-500/5 border border-red-500/20"
                  : "bg-[hsl(var(--secondary))]/50"
              }`}
            >
              <span className="text-[hsl(var(--muted-foreground))] mt-0.5">
                {actionIcons[step.action] || <FileOutput className="w-4 h-4" />}
              </span>
              <span className="flex-1">{step.description}</span>
              {step.destructive && (
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              )}
            </div>
          ))}
        </div>
      </div>

      {destructiveCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>
            {destructiveCount} step{destructiveCount > 1 ? "s" : ""} will modify
            your files
          </span>
        </div>
      )}
    </div>
  );
}
