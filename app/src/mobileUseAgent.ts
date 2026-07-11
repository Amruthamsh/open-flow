/**
 * Mobile-use agent loop — Gemini edition.
 *
 * Observe → decide → act, driven by Gemini generateContent. Each step:
 *   1. Snapshot the screen (getUiState) and format it for the model.
 *   2. Ask Gemini for the next action as a JSON tool call.
 *   3. Execute it against the accessibility service.
 *   4. Repeat until the model calls `complete` or we hit the step limit.
 */
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './config';
import { geminiModel } from './plan';
import {
  formatUiStateForLlm,
  getUiState,
  openApp,
  pressSystemButton,
  swipe,
  tap,
  tapAt,
  typeText,
  wait,
} from './agentTools';

export type AgentAction =
  | { tool: 'tap'; index: number }
  | { tool: 'tapAt'; x: number; y: number }
  | { tool: 'swipe'; startX: number; startY: number; endX: number; endY: number; durationMs?: number }
  | { tool: 'type'; text: string; clear?: boolean }
  | { tool: 'systemButton'; button: 'back' | 'home' | 'recents' | 'notifications' }
  | { tool: 'openApp'; packageName: string }
  | { tool: 'wait'; ms: number }
  | { tool: 'complete'; success: boolean; message: string };

export interface AgentStep {
  step: number;
  thought: string;
  action: AgentAction;
  actionResult?: string;
}

export interface AgentConfig {
  maxSteps?: number;
  onStep?: (step: AgentStep) => void;
  complete?: (messages: ChatMessage[]) => Promise<string>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are an agent that controls an Android phone to accomplish a user's task.

Each turn you are given the current screen as an indexed list of UI elements. Respond with EXACTLY ONE action as a JSON object and nothing else. Available actions:

{"thought": "...", "tool": "tap", "index": <number>}
{"thought": "...", "tool": "tapAt", "x": <px>, "y": <px>}
{"thought": "...", "tool": "swipe", "startX":<px>,"startY":<px>,"endX":<px>,"endY":<px>,"durationMs":300}
{"thought": "...", "tool": "type", "text": "...", "clear": false}
{"thought": "...", "tool": "systemButton", "button": "back|home|recents|notifications"}
{"thought": "...", "tool": "openApp", "packageName": "com.whatsapp"}
{"thought": "...", "tool": "wait", "ms": 800}
{"thought": "...", "tool": "complete", "success": true, "message": "what you accomplished"}

Rules:
- Always include a short "thought" explaining why.
- Prefer tapping by "index" over coordinates when the element is listed.
- After typing, you usually need to tap a send/submit/search button or press enter.
- To scroll down, swipe from a lower Y to a higher Y (e.g. startY 1600 -> endY 600).
- When the task is done (or impossible), use "complete".
- Output ONLY the JSON object. No markdown, no prose around it.`;

async function defaultComplete(messages: ChatMessage[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('No Gemini key configured in src/config.ts.');
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const model = await geminiModel();

  // Build Gemini contents: skip the system message (passed via systemInstruction).
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemMsg = messages.find(m => m.role === 'system');

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemMsg?.content ?? SYSTEM_PROMPT,
      maxOutputTokens: 400,
      temperature: 0,
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error('Gemini returned an empty response');
  }
  return content;
}

function parseAction(raw: string): { thought: string; action: AgentAction } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  const thought = typeof parsed.thought === 'string' ? parsed.thought : '';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { thought: _t, ...action } = parsed;
  return { thought, action: action as AgentAction };
}

async function executeAction(action: AgentAction): Promise<string> {
  switch (action.tool) {
    case 'tap':
      await tap(action.index);
      return `tapped index ${action.index}`;
    case 'tapAt':
      await tapAt(action.x, action.y);
      return `tapped (${action.x}, ${action.y})`;
    case 'swipe':
      await swipe(action.startX, action.startY, action.endX, action.endY, action.durationMs ?? 300);
      return 'swiped';
    case 'type':
      await typeText(action.text, action.clear ?? false);
      return `typed "${action.text}"`;
    case 'systemButton':
      await pressSystemButton(action.button);
      return `pressed ${action.button}`;
    case 'openApp':
      await openApp(action.packageName);
      return `opened ${action.packageName}`;
    case 'wait':
      await wait(action.ms);
      return `waited ${action.ms}ms`;
    case 'complete':
      return action.message;
    default:
      return `unknown action: ${JSON.stringify(action)}`;
  }
}

export interface AgentResult {
  success: boolean;
  message: string;
  steps: AgentStep[];
}

export async function runAgentTask(
  task: string,
  config: AgentConfig = {},
): Promise<AgentResult> {
  const maxSteps = config.maxSteps ?? 15;
  const complete = config.complete ?? defaultComplete;

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Task: ${task}` },
  ];

  const steps: AgentStep[] = [];

  for (let i = 1; i <= maxSteps; i++) {
    const state = await getUiState();
    const observation = formatUiStateForLlm(state);
    messages.push({ role: 'user', content: `Screen (step ${i}/${maxSteps}):\n${observation}` });

    const raw = await complete(messages);
    messages.push({ role: 'assistant', content: raw });

    let thought: string;
    let action: AgentAction;
    try {
      ({ thought, action } = parseAction(raw));
    } catch (err) {
      const step: AgentStep = {
        step: i,
        thought: 'Failed to parse model output',
        action: { tool: 'complete', success: false, message: String(err) },
        actionResult: raw.slice(0, 200),
      };
      steps.push(step);
      config.onStep?.(step);
      return { success: false, message: `Parse error: ${err}`, steps };
    }

    if (action.tool === 'complete') {
      const step: AgentStep = { step: i, thought, action };
      steps.push(step);
      config.onStep?.(step);
      return { success: action.success, message: action.message, steps };
    }

    let actionResult: string;
    try {
      actionResult = await executeAction(action);
    } catch (err) {
      actionResult = `action failed: ${err}`;
    }

    const step: AgentStep = { step: i, thought, action, actionResult };
    steps.push(step);
    config.onStep?.(step);

    messages.push({ role: 'user', content: `Action result: ${actionResult}` });

    await wait(action.tool === 'openApp' ? 2200 : 650);
  }

  return {
    success: false,
    message: `Reached step limit (${maxSteps}) without completing.`,
    steps,
  };
}
