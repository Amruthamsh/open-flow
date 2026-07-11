export type ActionType =
  | "move_file"
  | "create_directory"
  | "open_application"
  | "open_url"
  | "open_in_vscode"
  | "open_terminal"
  | "read_screen"
  | "type_text"
  | "click_element"
  | "scroll"
  | "explain_document"
  | "fill_form"
  | "summarize_content"
  | "compose_message"
  | "translate_text"
  | "read_aloud"
  | "take_screenshot"
  | "search_web"
  | "wait"
  | "notify_user"
  | "write_file"
  | "run_script"
  | "read_file"
  | "open_file";

export interface PlanStep {
  action: ActionType;
  params: Record<string, unknown>;
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

export type ConnectivityLevel = "cloud" | "edge" | "local";

export interface ConnectivityStatus {
  level: ConnectivityLevel;
  latency_ms: number | null;
}

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
