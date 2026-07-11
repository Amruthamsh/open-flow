import type { AgentResult } from './mobileUseAgent';
import { matchScriptedTask } from './scriptedFlows';
import { runVisionTask } from './visionAgent';

export type RoutedTask =
  | { kind: 'stop' }
  | { kind: 'agent'; reason: string }
  | { kind: 'companion'; oneShot: true };

const STOP_PATTERNS = [
  /\b(shut up|stop talking|stop speaking|be quiet|cancel|never mind|nevermind)\b/i,
];

const READ_ONLY_PATTERNS = [
  /\b(see|read|scan|look at|tell me about|summari[sz]e|what(?:'s| is)|who|why|how many)\b/i,
  /\b(playlist|songs?|messages?|list|screen|page|photo|image)\b/i,
];

const ACTION_PATTERNS = [
  /\b(send|message|text|dm|reply|forward|share|post|comment|call)\b/i,
  /\b(open|go to|launch|tap|click|press|select|choose|search for)\b/i,
  /\b(change|set|turn on|turn off|enable|disable|add|remove|delete|book|order|pay)\b/i,
  /\b(how to|how do i|how can i|i want to|help me|guide me|walk me through|show me how|show me)\b/i,
];

const APP_PATTERNS = [
  /\b(whatsapp|instagram|telegram|gmail|youtube|spotify|chrome|maps|settings|calendar|contacts|uber|ola|rapido)\b/i,
];

export function routeTask(text: string): RoutedTask {
  const normalized = normalize(text);
  if (!normalized) return { kind: 'companion', oneShot: true };

  if (STOP_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { kind: 'stop' };
  }

  const asksToReadOnly =
    READ_ONLY_PATTERNS.some(pattern => pattern.test(normalized)) &&
    !/\b(send|message|text|dm|reply|post|delete|pay|book|order)\b/i.test(normalized);
  if (asksToReadOnly) {
    return { kind: 'companion', oneShot: true };
  }

  const action = ACTION_PATTERNS.some(pattern => pattern.test(normalized));
  const app = APP_PATTERNS.some(pattern => pattern.test(normalized));
  if (action && app) {
    return { kind: 'agent', reason: 'app action request' };
  }

  return { kind: 'companion', oneShot: true };
}

export async function runRoutedAgentTask(
  task: string,
  onStatus?: (status: string) => void,
): Promise<AgentResult> {
  const scripted = matchScriptedTask(task);
  if (scripted) {
    onStatus?.('running whatsapp flow');
    return scripted(step => {
      onStatus?.(step.thought || step.actionResult || 'working');
    });
  }

  onStatus?.('working through the steps');
  const result = await runVisionTask(task, {
    maxSteps: 15,
    onStep: step => {
      onStatus?.(step.actionDesc || step.thought || `step ${step.step}`);
    },
  });

  return {
    success: result.success,
    message: result.message,
    steps: result.steps.map(step => ({
      step: step.step,
      thought: step.thought,
      action: { tool: 'wait', ms: 0 },
      actionResult: step.actionDesc,
    })),
  };
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
