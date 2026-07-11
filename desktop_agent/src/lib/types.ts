export interface PlanStep {
  action:
    | "move_file"
    | "create_directory"
    | "open_application"
    | "open_url"
    | "open_in_vscode"
    | "open_terminal";
  params: Record<string, string>;
  destructive: boolean;
  description: string;
}

export interface Plan {
  summary: string;
  steps: PlanStep[];
}

export interface StepResult {
  step: PlanStep;
  success: boolean;
  error?: string;
  duration_ms: number;
}

export interface ExecutionResult {
  plan: Plan;
  results: StepResult[];
  total_duration_ms: number;
  steps_succeeded: number;
  steps_failed: number;
}

export interface ActivityLog {
  id: number;
  command: string;
  plan_json: string;
  status: "success" | "partial" | "failed";
  steps_total: number;
  steps_succeeded: number;
  steps_failed: number;
  duration_ms: number;
  created_at: string;
}

export type AppPhase =
  | "idle"
  | "planning"
  | "confirming"
  | "executing"
  | "done"
  | "error";

export interface MoveResult {
  source: string;
  destination: string;
  success: boolean;
  error?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  extension?: string;
  size_bytes: number;
}
