import { invoke } from "@tauri-apps/api/core";
import type {
  Plan,
  MoveResult,
  FileInfo,
  StepResult,
  PlanStep,
  ExecutionResult,
} from "./types";

export async function generatePlan(
  command: string,
  contextDir?: string
): Promise<Plan> {
  return invoke("generate_plan", { command, contextDir });
}

export async function listFiles(dir: string): Promise<FileInfo[]> {
  return invoke("list_files", { dir });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke("create_directory", { path });
}

export async function moveFile(
  source: string,
  destination: string
): Promise<MoveResult> {
  return invoke("move_file", { source, destination });
}

export async function moveFilesBatch(
  moves: [string, string][]
): Promise<MoveResult[]> {
  return invoke("move_files_batch", { moves });
}

export async function openApplication(appName: string): Promise<void> {
  return invoke("open_application", { appName });
}

export async function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

export async function openInVscode(path: string): Promise<void> {
  return invoke("open_in_vscode", { path });
}

export async function openTerminal(path?: string): Promise<void> {
  return invoke("open_terminal", { path: path ?? null });
}

export async function executePlan(
  plan: Plan,
  onProgress?: (index: number, results: StepResult[]) => void
): Promise<ExecutionResult> {
  const results: StepResult[] = [];
  const startTime = performance.now();

  for (let i = 0; i < plan.steps.length; i++) {
    onProgress?.(i, [...results]);
    const step = plan.steps[i];
    const stepStart = performance.now();
    try {
      await executeStep(step);
      results.push({
        step,
        success: true,
        duration_ms: Math.round(performance.now() - stepStart),
      });
    } catch (e) {
      results.push({
        step,
        success: false,
        error: e instanceof Error ? e.message : String(e),
        duration_ms: Math.round(performance.now() - stepStart),
      });
    }
  }

  const totalDuration = Math.round(performance.now() - startTime);
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    plan,
    results,
    total_duration_ms: totalDuration,
    steps_succeeded: succeeded,
    steps_failed: failed,
  };
}

async function executeStep(step: PlanStep): Promise<void> {
  switch (step.action) {
    case "move_file": {
      const result = await moveFile(step.params.source, step.params.destination);
      if (!result.success) {
        throw new Error(result.error || "Move failed");
      }
      break;
    }
    case "create_directory":
      await createDirectory(step.params.path);
      break;
    case "open_application":
      await openApplication(step.params.app_name);
      break;
    case "open_url":
      await openUrl(step.params.url);
      break;
    case "open_in_vscode":
      await openInVscode(step.params.path);
      break;
    case "open_terminal":
      await openTerminal(step.params.path);
      break;
    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}
