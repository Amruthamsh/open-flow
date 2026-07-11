import { invoke } from "@tauri-apps/api/core";
import type {
  Plan,
  MoveResult,
  FileInfo,
  StepResult,
  PlanStep,
  ExecutionResult,
  ConnectivityStatus,
} from "./types";

// Planner
export async function generatePlan(
  command: string,
  contextDir?: string
): Promise<Plan> {
  return invoke("generate_plan", { command, contextDir });
}

export async function checkConnectivity(): Promise<ConnectivityStatus> {
  return invoke("check_connectivity");
}

// File operations
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

// App operations
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

// Screen & interaction
export async function readScreen(
  region?: string
): Promise<{ text: string; screenshot_path: string | null }> {
  return invoke("read_screen", { region: region ?? null });
}

export async function takeScreenshot(saveTo?: string): Promise<string> {
  return invoke("take_screenshot", { saveTo: saveTo ?? null });
}

export async function typeText(text: string): Promise<void> {
  return invoke("type_text", { text });
}

export async function clickElement(target: string): Promise<void> {
  return invoke("click_element", { target });
}

export async function scrollScreen(
  direction: string,
  amount?: number
): Promise<void> {
  return invoke("scroll_screen", { direction, amount: amount ?? null });
}

export async function readAloud(
  text: string,
  language?: string
): Promise<void> {
  return invoke("read_aloud", { text, language: language ?? null });
}

export async function notifyUser(
  message: string,
  notificationType?: string
): Promise<void> {
  return invoke("notify_user", { message, notificationType: notificationType ?? null });
}

export async function searchWeb(query: string): Promise<void> {
  return invoke("search_web", { query });
}

// Automation
export async function writeFile(path: string, content: string): Promise<void> {
  return invoke("write_file", { path, content });
}

export async function runScript(
  interpreter: string,
  script: string,
  workingDir?: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return invoke("run_script", { interpreter, script, workingDir: workingDir ?? null });
}

export async function readFile(path: string): Promise<string> {
  return invoke("read_file", { path });
}

export async function openFile(path: string): Promise<void> {
  return invoke("open_file", { path });
}

// Plan execution
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
  const p = step.params as Record<string, unknown>;

  switch (step.action) {
    case "move_file": {
      const result = await moveFile(p.source as string, p.destination as string);
      if (!result.success) {
        throw new Error(result.error || "Move failed");
      }
      break;
    }
    case "create_directory":
      await createDirectory(p.path as string);
      break;
    case "open_application":
      await openApplication(p.app_name as string);
      break;
    case "open_url":
      await openUrl(p.url as string);
      break;
    case "open_in_vscode":
      await openInVscode(p.path as string);
      break;
    case "open_terminal":
      await openTerminal(p.path as string | undefined);
      break;
    case "read_screen":
      await readScreen(p.region as string | undefined);
      break;
    case "type_text":
      await typeText(p.text as string);
      break;
    case "click_element":
      await clickElement(p.target as string);
      break;
    case "scroll":
      await scrollScreen(
        p.direction as string,
        p.amount as number | undefined
      );
      break;
    case "explain_document":
      // For now, open the document and notify
      await openUrl(p.path as string);
      await notifyUser(`Explaining: ${p.path}`, "info");
      break;
    case "fill_form": {
      const fields = p.fields as Record<string, string>;
      for (const [, value] of Object.entries(fields)) {
        await typeText(value);
        // Tab to next field
        await typeText("\t");
      }
      break;
    }
    case "summarize_content":
      await readScreen(p.source as string);
      break;
    case "compose_message":
      if (p.app === "WhatsApp") {
        await openUrl(`https://web.whatsapp.com`);
      }
      await notifyUser(`Message ready for: ${p.to}`, "info");
      break;
    case "translate_text":
      await notifyUser(`Translation: ${p.text}`, "info");
      break;
    case "read_aloud":
      await readAloud(p.text as string, p.language as string | undefined);
      break;
    case "take_screenshot":
      await takeScreenshot(p.save_to as string | undefined);
      break;
    case "search_web":
      await searchWeb(p.query as string);
      break;
    case "wait": {
      const seconds = (p.seconds as number) || 1;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      break;
    }
    case "notify_user":
      await notifyUser(p.message as string, p.type as string | undefined);
      break;
    case "write_file":
      await writeFile(p.path as string, p.content as string);
      break;
    case "run_script": {
      const scriptResult = await runScript(
        p.interpreter as string,
        p.script as string,
        p.working_dir as string | undefined
      );
      if (!scriptResult.success) {
        throw new Error(scriptResult.stderr || scriptResult.stdout || "Script failed");
      }
      break;
    }
    case "read_file":
      await readFile(p.path as string);
      break;
    case "open_file":
      await openFile(p.path as string);
      break;
    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}
