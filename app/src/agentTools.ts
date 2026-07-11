/**
 * Mobile-use agent toolkit.
 *
 * This is the action space an LLM agent uses to drive the phone, modeled on
 * droidrun's tool registry. Wire these into your AI API layer as tool/function
 * definitions: call `getUiState()` to observe, then act with the rest.
 *
 * Requires the HeyFlow accessibility service to be enabled
 * (AutomationModule.openAccessibilitySettings()).
 */
import { NativeModules } from 'react-native';

const { AutomationModule, OverlayModule } = NativeModules;

function pointCursor(x: number, y: number, dwellMs = 180): Promise<void> {
  try {
    OverlayModule?.pointCursor?.(Math.round(x), Math.round(y));
  } catch {}
  return new Promise(resolve => setTimeout(resolve, dwellMs));
}

export interface UiElement {
  index?: number;
  className: string;
  resourceId?: string;
  text?: string;
  /** "left,top,right,bottom" in screen pixels. */
  bounds?: string;
  clickable?: boolean;
  editable?: boolean;
  scrollable?: boolean;
  checked?: boolean;
  focused?: boolean;
  children?: UiElement[];
}

export interface UiState {
  elements: UiElement[];
  phoneState: {
    packageName: string;
    keyboardVisible: boolean;
    focusedElement?: {
      text: string;
      className: string;
      resourceId: string;
      editable: boolean;
    };
  };
  deviceContext: {
    screenWidth: number;
    screenHeight: number;
    density: number;
  };
}

/** Snapshot the screen: indexed element tree + phone state. */
export async function getUiState(): Promise<UiState> {
  const json: string = await AutomationModule.getUiState();
  const state: UiState = JSON.parse(json);
  indexCenter.clear();
  const walk = (list: UiElement[]) => {
    for (const el of list) {
      if (el.index != null && el.bounds) {
        const [l, t, r, b] = el.bounds.split(',').map(Number);
        if (![l, t, r, b].some(Number.isNaN)) {
          indexCenter.set(el.index, {
            x: Math.round((l + r) / 2),
            y: Math.round((t + b) / 2),
          });
        }
      }
      if (el.children) walk(el.children);
    }
  };
  walk(state.elements);
  return state;
}

export interface Screenshot {
  /** Base64 JPEG (no data: prefix). */
  base64: string;
  /** Dimensions of the (downscaled) image the model sees. */
  width: number;
  height: number;
  /** True device pixel dimensions — scale model coords by device/image. */
  deviceWidth: number;
  deviceHeight: number;
}

/** Capture the current screen for the vision agent. */
export function takeScreenshot(): Promise<Screenshot> {
  return AutomationModule.takeScreenshot();
}

export function currentPackage(): Promise<string> {
  return getUiState().then(s => s.phoneState.packageName);
}

// Last-seen index → center coordinates, populated by getUiState().
const indexCenter = new Map<number, { x: number; y: number }>();

/** Tap the element with `index` from the most recent getUiState() snapshot. */
export async function tap(index: number): Promise<boolean> {
  const center = indexCenter.get(index);
  if (center) await pointCursor(center.x, center.y);
  return AutomationModule.tapByIndex(index);
}

/** Tap at absolute screen coordinates (pixels). Cursor flies there first. */
export async function tapAt(x: number, y: number): Promise<boolean> {
  await pointCursor(x, y);
  return AutomationModule.tapAt(Math.round(x), Math.round(y));
}

export async function longPressAt(x: number, y: number): Promise<boolean> {
  await pointCursor(x, y);
  return AutomationModule.longPressAt(Math.round(x), Math.round(y));
}

export async function swipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number = 300,
): Promise<boolean> {
  await pointCursor(startX, startY);
  return AutomationModule.swipe(
    Math.round(startX),
    Math.round(startY),
    Math.round(endX),
    Math.round(endY),
    Math.round(durationMs),
  );
}

/**
 * Type into the focused (or first) editable field.
 * `clear: false` appends to the existing text, `true` replaces it.
 */
export function typeText(text: string, clear: boolean = false): Promise<boolean> {
  return AutomationModule.typeText(text, clear);
}

/** back | home | recents | notifications */
export function pressSystemButton(
  button: 'back' | 'home' | 'recents' | 'notifications',
): Promise<boolean> {
  return AutomationModule.performGlobalAction(button);
}

export function openApp(packageName: string): Promise<boolean> {
  return AutomationModule.launchApp(packageName);
}

/** Click the first node whose text or content-description matches. */
export function clickByText(
  text: string,
  exactMatch: boolean = false,
): Promise<boolean> {
  return AutomationModule.clickByText(text, exactMatch);
}

/** Find the on-screen element (in the last snapshot) matching a predicate. */
export function findElement(
  state: UiState,
  predicate: (el: UiElement) => boolean,
): UiElement | null {
  const walk = (list: UiElement[]): UiElement | null => {
    for (const el of list) {
      if (predicate(el)) return el;
      if (el.children) {
        const found = walk(el.children);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(state.elements);
}

/** Center pixel of an element's "l,t,r,b" bounds string. */
export function elementCenter(
  el: UiElement,
): { x: number; y: number } | null {
  if (!el.bounds) return null;
  const [l, t, r, b] = el.bounds.split(',').map(n => parseInt(n, 10));
  if ([l, t, r, b].some(Number.isNaN)) return null;
  return { x: Math.round((l + r) / 2), y: Math.round((t + b) / 2) };
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Render a UiState as the compact indented text block droidrun feeds its LLM:
 *
 *   **Current Phone State:**
 *   • App: com.whatsapp
 *   • Keyboard: Hidden
 *
 *   Current UI elements:
 *   1. FrameLayout - (0,0,1080,2400)
 *     2. Button: "Send" - (48,1520,1032,1640)
 */
export function formatUiStateForLlm(state: UiState): string {
  const lines: string[] = [];
  lines.push('**Current Phone State:**');
  lines.push(`• App: ${state.phoneState.packageName}`);
  lines.push(
    `• Keyboard: ${state.phoneState.keyboardVisible ? 'Visible' : 'Hidden'}`,
  );
  if (state.phoneState.focusedElement) {
    lines.push(`• Focused: '${state.phoneState.focusedElement.text}'`);
  }
  lines.push('');
  lines.push('Current UI elements:');

  const walk = (element: UiElement, depth: number) => {
    if (element.index != null) {
      const indent = '  '.repeat(depth);
      const parts: string[] = [`${element.index}. ${element.className}`];
      if (element.text) parts.push(`: "${element.text}"`);
      const flags = [
        element.clickable ? 'clickable' : '',
        element.editable ? 'editable' : '',
        element.scrollable ? 'scrollable' : '',
        element.checked != null ? `checked=${element.checked}` : '',
        element.focused ? 'focused' : '',
      ]
        .filter(Boolean)
        .join(',');
      if (flags) parts.push(` [${flags}]`);
      if (element.bounds) parts.push(` - (${element.bounds})`);
      lines.push(indent + parts.join(''));
    }
    for (const child of element.children ?? []) {
      walk(child, element.index != null ? depth + 1 : depth);
    }
  };
  for (const element of state.elements) {
    walk(element, 0);
  }
  return lines.join('\n');
}
