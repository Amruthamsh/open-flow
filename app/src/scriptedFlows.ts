/**
 * Deterministic, LLM-free app automations.
 *
 * For common tasks (like "message someone on WhatsApp") we don't need an LLM
 * in the loop — a fixed sequence of accessibility actions is faster and more
 * reliable. runScriptedTask() pattern-matches a natural-language task to one
 * of these flows; if none matches it returns null so the caller can fall back
 * to the LLM agent.
 */
import {
  elementCenter,
  findElement,
  getUiState,
  openApp,
  tapAt,
  typeText,
  wait,
} from './agentTools';
import type { UiElement, UiState } from './agentTools';
import type { AgentResult, AgentStep } from './mobileUseAgent';

const WHATSAPP_PKG = 'com.whatsapp';

type StepEmit = (step: AgentStep) => void;

function makeStepper(onStep?: StepEmit) {
  const steps: AgentStep[] = [];
  let n = 0;
  return {
    steps,
    log(thought: string, tool: string, result: string) {
      n += 1;
      console.log(`[FLOW] step ${n}: ${thought} | ${tool}: ${result}`);
      const step: AgentStep = {
        step: n,
        thought,
        action: { tool: 'wait', ms: 0 } as any,
        actionResult: `${tool}: ${result}`,
      };
      steps.push(step);
      onStep?.(step);
    },
  };
}

/**
 * Open WhatsApp, open the chat with `contact`, and send `message`.
 * Uses content-description / text matching, which is stable across WhatsApp's
 * frequent layout changes (resource IDs are obfuscated).
 */
export async function whatsAppMessage(
  contact: string,
  message: string,
  onStep?: StepEmit,
): Promise<AgentResult> {
  const s = makeStepper(onStep);

  // 1. Launch WhatsApp and wait until it is actually the foreground window
  // (a fixed sleep races the app switch — we'd read our own UI instead).
  await openApp(WHATSAPP_PKG);
  s.log(`Opening WhatsApp`, 'openApp', WHATSAPP_PKG);
  let state = await waitForPackage(WHATSAPP_PKG);
  console.log(
    `[FLOW] waitForPackage → ${state ? 'whatsapp foreground, ' + countAll(state) + ' elements' : 'NULL (never foregrounded)'}`,
  );
  if (!state) {
    return fail(s.steps, 'WhatsApp did not come to the foreground.');
  }

  // 2. Tap the search bar by coordinates. WhatsApp's search text node
  // ("Ask Meta AI or Search") isn't itself clickable, so performAction(CLICK)
  // fails — a coordinate tap on its center always works. Match strictly by
  // WhatsApp's own resource-id so we never match unrelated "search" text.
  const searchBar = findElement(
    state,
    el => idHas(el, 'search_bar') || idHas(el, 'search_text') || idHas(el, 'search_icon'),
  );
  console.log(
    `[FLOW] searchBar = ${searchBar ? JSON.stringify({ id: searchBar.resourceId, text: searchBar.text, bounds: searchBar.bounds }) : 'NOT FOUND'}`,
  );
  if (!searchBar || !(await tapCenter(searchBar))) {
    return fail(s.steps, 'Could not find WhatsApp search. Is WhatsApp open?');
  }
  s.log('Tapping search', 'tapAt', label(searchBar));
  await wait(1300);

  // 3. Type the contact name into the now-focused search box.
  await typeText(contact, true);
  s.log(`Typing "${contact}"`, 'typeText', contact);
  await wait(1700);

  // 4. Tap the first chat result matching the contact (below the search bar).
  state = await getUiState();
  const result = findElement(
    state,
    el =>
      !!el.text &&
      el.text.toLowerCase().includes(contact.toLowerCase()) &&
      (el.bounds ? boundsTop(el.bounds) > 240 : false),
  );
  if (!result || !(await tapCenter(result))) {
    return fail(s.steps, `No chat found matching "${contact}".`);
  }
  s.log(`Opening chat "${result.text}"`, 'tapAt', label(result));
  await wait(1800);

  // 5. Focus the compose field (resource-id "entry" / any editable) and type.
  state = await getUiState();
  const entry =
    findElement(state, el => el.editable === true) ??
    findElement(state, el => idHas(el, 'entry'));
  if (entry) {
    await tapCenter(entry);
    await wait(450);
  }
  await typeText(message, true);
  s.log(`Typing "${message}"`, 'typeText', message);
  await wait(700);

  // 6. Tap the send button (resource-id ".../send" or content-desc "Send").
  state = await getUiState();
  const send =
    findElement(state, el => idEndsWith(el, 'send')) ??
    findElement(state, el => (el.text ?? '').toLowerCase() === 'send');
  if (!send || !(await tapCenter(send))) {
    return fail(
      s.steps,
      `Typed "${message}" but couldn't find the Send button.`,
    );
  }
  s.log('Tapping send', 'tapAt', label(send));

  return {
    success: true,
    message: `Sent "${message}" to ${contact} on WhatsApp.`,
    steps: s.steps,
  };
}

/** Poll getUiState until `pkg` is the foreground app (or give up). */
async function waitForPackage(
  pkg: string,
  attempts: number = 12,
): Promise<UiState | null> {
  for (let i = 0; i < attempts; i++) {
    const state = await getUiState();
    if (state.phoneState.packageName === pkg) {
      // One extra settle so the first screen is fully laid out.
      await wait(600);
      return getUiState();
    }
    await wait(500);
  }
  return null;
}

async function tapCenter(el: {
  bounds?: string;
}): Promise<boolean> {
  const center = elementCenter(el as any);
  if (!center) return false;
  await tapAt(center.x, center.y);
  return true;
}

function idHas(el: { resourceId?: string }, part: string): boolean {
  return (el.resourceId ?? '').toLowerCase().includes(part);
}

function idEndsWith(el: { resourceId?: string }, part: string): boolean {
  return (el.resourceId ?? '').toLowerCase().endsWith(part);
}

function label(el: { resourceId?: string; text?: string }): string {
  return el.resourceId ?? el.text ?? '';
}

function boundsTop(bounds: string): number {
  const parts = bounds.split(',');
  return parseInt(parts[1], 10) || 0;
}

function countAll(state: UiState): number {
  let n = 0;
  const walk = (list: UiElement[]) => {
    for (const el of list) {
      if (el.index != null) n++;
      if (el.children) walk(el.children);
    }
  };
  walk(state.elements);
  return n;
}

function fail(steps: AgentStep[], message: string): AgentResult {
  return { success: false, message, steps };
}

/**
 * Try to match `task` to a scripted flow. Returns a runner, or null if the
 * task should go to the LLM agent instead.
 *
 * Matches phrasings like:
 *   "message mom hi on whatsapp"
 *   "open whatsapp, search for mom and message her hi"
 *   "whatsapp mom saying hi"
 */
export function matchScriptedTask(
  task: string,
): ((onStep?: StepEmit) => Promise<AgentResult>) | null {
  const t = task.toLowerCase();
  if (!t.includes('whatsapp')) return null;

  // contact + message extraction
  let contact: string | null = null;
  let message: string | null = null;

  // "search for X ... message (her|him|them)? Y"
  const searchMsg = t.match(
    /search (?:for )?([a-z0-9 ]+?)(?:,| and| then)?\s*(?:and )?message(?: (?:her|him|them))?\s+(.+)/,
  );
  if (searchMsg) {
    contact = searchMsg[1].trim();
    message = stripTrailing(searchMsg[2]);
  }

  if (!contact && !/(saying|that says|with message)/.test(t)) {
    return null;
  }

  // "message X saying Y" / "message X Y"
  if (!contact) {
    const msg = t.match(/message\s+([a-z0-9 ]+?)\s+(?:saying\s+)?["“]?(.+)/);
    if (msg) {
      contact = msg[1].trim();
      message = stripTrailing(msg[2]);
    }
  }

  if (contact && message) {
    const c = contact;
    const m = message;
    return (onStep?: StepEmit) => whatsAppMessage(c, m, onStep);
  }
  return null;
}

function stripTrailing(text: string): string {
  return text
    .replace(/\s+on whatsapp$/i, '')
    .replace(/["“”]/g, '')
    .trim();
}
