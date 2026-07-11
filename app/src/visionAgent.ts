/**
 * On-device vision agent — Gemini edition.
 *
 * Loop: screenshot → ask Gemini vision for the next action → execute → repeat.
 * No PC, no ADB. Stuck detection injected as warnings.
 */
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './config';
import { geminiModel } from './plan';
import {
  openApp,
  pressSystemButton,
  swipe as swipeGesture,
  takeScreenshot,
  tapAt,
  longPressAt,
  typeText,
  wait,
} from './agentTools';

export interface VisionStep {
  step: number;
  thought: string;
  actionDesc: string;
  action: VisionAction;
}

export interface VisionResult {
  success: boolean;
  message: string;
  steps: VisionStep[];
}

export interface VisionAgentConfig {
  maxSteps?: number;
  onStep?: (step: VisionStep) => void;
}

interface VisionAction {
  action: string;
  coordinate?: [number, number];
  coordinate2?: [number, number];
  text?: string;
  time?: number;
  button?: string;
  status?: string;
}

const APP_PACKAGES: Record<string, string> = {
  whatsapp: 'com.whatsapp',
  chrome: 'com.android.chrome',
  youtube: 'com.google.android.youtube',
  gmail: 'com.google.android.gm',
  maps: 'com.google.android.apps.maps',
  'google maps': 'com.google.android.apps.maps',
  settings: 'com.android.settings',
  instagram: 'com.instagram.android',
  spotify: 'com.spotify.music',
  uber: 'com.ubercab',
  ola: 'com.olacabs.customer',
  rapido: 'com.rapido.passenger',
  'play store': 'com.android.vending',
  'google play': 'com.android.vending',
  telegram: 'org.telegram.messenger',
  x: 'com.twitter.android',
  twitter: 'com.twitter.android',
  facebook: 'com.facebook.katana',
  netflix: 'com.netflix.mediaclient',
};

const TOOL_SCHEMA = `{"type":"function","function":{"name":"mobile_use","description":"Operate the phone to satisfy the user instruction.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["click","long_press","swipe","type","clear_text","system_button","open","wait","answer","terminate"],"description":"The action to take."},"coordinate":{"type":"array","description":"[x,y] pixel target for click/long_press, or swipe start."},"coordinate2":{"type":"array","description":"[x,y] pixel end point for swipe."},"text":{"type":"string","description":"Text for type; app name for open; final answer for answer."},"time":{"type":"number","description":"Seconds for long_press or wait."},"button":{"type":"string","enum":["Back","Home","Enter"],"description":"For system_button."},"status":{"type":"string","enum":["success","failure"],"description":"For terminate."}},"required":["action"]}}}`;

function systemPrompt(width: number, height: number): string {
  return `You are Flow, an AI agent that operates an Android phone to complete the user's instruction. Think like a human using the phone.

# Tools
You control the phone by calling ONE function per step. Signature:
<tools>
${TOOL_SCHEMA}
</tools>

# Action notes
- click / long_press / swipe take pixel coordinates. The screenshot resolution is ${width}x${height}: x is pixels from the left, y is pixels from the top.
- To scroll DOWN (see content further below), swipe from a lower point to a higher point, e.g. coordinate [${Math.round(width / 2)}, ${Math.round(height * 0.7)}] to coordinate2 [${Math.round(width / 2)}, ${Math.round(height * 0.3)}].
- Before typing, click the target text field first. Use "type" to enter text.
- Use "open" with an app name (e.g. {"action":"open","text":"WhatsApp"}) to launch an app instead of hunting for its icon.
- After a search box, results usually appear live — tap the right result; you rarely need Enter.
- When the whole instruction is complete, call {"action":"terminate","status":"success"}. For a question, call {"action":"answer","text":"..."}.
- Do NOT repeat an action that produced no change — try a different approach.

# Response format (exactly this)
Thought: <one sentence of reasoning>
Action: <short description of the single action>
<tool_call>
{"name":"mobile_use","arguments":{...}}
</tool_call>`;
}

async function callVision(
  systemInstruction: string,
  userParts: any[],
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('No Gemini key configured in src/config.ts.');
  }
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const model = await geminiModel();

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: userParts }],
    config: {
      systemInstruction,
      maxOutputTokens: 500,
      temperature: 0,
    },
  });

  const content = response.text;
  if (!content) {
    throw new Error('Vision model returned an empty response');
  }
  return content;
}

function parseResponse(raw: string): {
  thought: string;
  actionDesc: string;
  action: VisionAction | null;
} {
  const thought = raw.match(/Thought:\s*(.*)/i)?.[1]?.trim() ?? '';
  const actionDesc = raw.match(/Action:\s*(.*)/i)?.[1]?.trim() ?? '';
  const call = raw.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  let action: VisionAction | null = null;
  const jsonText = call ? call[1] : raw.match(/\{[\s\S]*"action"[\s\S]*\}/)?.[0];
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText.trim());
      action = (parsed.arguments ?? parsed) as VisionAction;
    } catch {
      action = null;
    }
  }
  return { thought, actionDesc, action };
}

async function executeAction(
  action: VisionAction,
): Promise<{ done: boolean; message?: string; success?: boolean }> {
  const c = action.coordinate;
  const c2 = action.coordinate2;
  switch (action.action) {
    case 'click':
      if (c) await tapAt(c[0], c[1]);
      return { done: false };
    case 'long_press':
      if (c) await longPressAt(c[0], c[1]);
      return { done: false };
    case 'swipe':
      if (c && c2) await swipeGesture(c[0], c[1], c2[0], c2[1], 300);
      return { done: false };
    case 'type':
      await typeText(action.text ?? '', false);
      return { done: false };
    case 'clear_text':
      await typeText('', true);
      return { done: false };
    case 'system_button': {
      const b = (action.button ?? '').toLowerCase();
      if (b === 'back') await pressSystemButton('back');
      else if (b === 'home') await pressSystemButton('home');
      return { done: false };
    }
    case 'open': {
      const name = (action.text ?? '').toLowerCase().trim();
      const pkg = APP_PACKAGES[name];
      if (pkg) {
        try {
          await openApp(pkg);
        } catch {}
      }
      return { done: false };
    }
    case 'wait':
      await wait((action.time ?? 1) * 1000);
      return { done: false };
    case 'answer':
      return { done: true, success: true, message: action.text ?? 'Done.' };
    case 'terminate':
      return {
        done: true,
        success: action.status !== 'failure',
        message: action.status === 'failure' ? 'Could not complete the task.' : 'Task completed.',
      };
    default:
      return { done: false };
  }
}

function actionSignature(action: VisionAction): string {
  return JSON.stringify([action.action, action.coordinate, action.coordinate2, action.text, action.button]);
}

function detectStuck(sigs: string[], screens: string[]): string | null {
  const n = sigs.length;
  if (n >= 3 && sigs[n - 1] === sigs[n - 2] && sigs[n - 2] === sigs[n - 3]) {
    return 'WARNING: You repeated the same action 3 times. Change your approach.';
  }
  if (n >= 4 && sigs[n - 1] === sigs[n - 3] && sigs[n - 2] === sigs[n - 4] && sigs[n - 1] !== sigs[n - 2]) {
    return 'WARNING: Your last two actions are cycling back and forth. Try something different.';
  }
  const s = screens.length;
  if (s >= 3 && screens[s - 1] === screens[s - 2] && screens[s - 2] === screens[s - 3]) {
    return 'WARNING: The screen has not changed for several actions — you may be stuck. Try a different action.';
  }
  return null;
}

export async function runVisionTask(
  task: string,
  config: VisionAgentConfig = {},
): Promise<VisionResult> {
  const maxSteps = config.maxSteps ?? 15;
  const steps: VisionStep[] = [];
  const history: string[] = [];
  const actionSigs: string[] = [];
  const screenHashes: string[] = [];

  for (let i = 1; i <= maxSteps; i++) {
    const shot = await takeScreenshot();
    screenHashes.push(shot.base64.length + ':' + shot.base64.slice(0, 64));

    const warning = detectStuck(actionSigs, screenHashes);

    const userParts: any[] = [
      {
        text:
          `### User Instruction ###\n${task}\n\n` +
          (history.length ? `### History (most recent last) ###\n${history.join('\n')}\n\n` : '') +
          (warning ? `${warning}\n\n` : '') +
          `### Observation ###\nThis is the current screenshot (resolution ${shot.width}x${shot.height}).`,
      },
      { inlineData: { mimeType: 'image/jpeg', data: shot.base64 } },
    ];

    const raw = await callVision(systemPrompt(shot.width, shot.height), userParts);
    const { thought, actionDesc, action } = parseResponse(raw);

    if (!action) {
      history.push(`Step ${i}: (could not parse an action)`);
      continue;
    }

    const scaleX = shot.deviceWidth / shot.width;
    const scaleY = shot.deviceHeight / shot.height;
    if (action.coordinate) {
      action.coordinate = [
        Math.round(action.coordinate[0] * scaleX),
        Math.round(action.coordinate[1] * scaleY),
      ];
    }
    if (action.coordinate2) {
      action.coordinate2 = [
        Math.round(action.coordinate2[0] * scaleX),
        Math.round(action.coordinate2[1] * scaleY),
      ];
    }

    const step: VisionStep = { step: i, thought, actionDesc, action };
    steps.push(step);
    config.onStep?.(step);

    actionSigs.push(actionSignature(action));
    history.push(`Step ${i}: ${actionDesc || action.action} — ${actionSignature(action)}`);

    const result = await executeAction(action);
    if (result.done) {
      return { success: result.success ?? true, message: result.message ?? 'Done.', steps };
    }

    await wait(action.action === 'open' ? 2200 : 900);
  }

  return {
    success: false,
    message: `Reached the ${maxSteps}-step limit without finishing.`,
    steps,
  };
}
