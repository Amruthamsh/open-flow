/**
 * Gemini model selection.
 *
 * Voice always uses gemini-3.1-flash-live-preview (fixed).
 * Everything else (chat, vision, agent) uses whichever model the user picks
 * from the settings dropdown — default is gemini-3.5-flash.
 */
import { NativeModules } from 'react-native';

const { OverlayModule } = NativeModules;

export const GEMINI_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

export type GeminiModel =
  | 'gemini-3.5-flash'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite';

export const GEMINI_MODEL_OPTIONS: { id: GeminiModel; label: string; desc: string }[] = [
  { id: 'gemini-3.5-flash', label: 'Flash', desc: 'fast · default' },
  { id: 'gemini-3.1-pro-preview', label: 'Pro', desc: 'smartest' },
  { id: 'gemini-3.1-flash-lite', label: 'Lite', desc: 'cheapest' },
];

export const DEFAULT_GEMINI_MODEL: GeminiModel = 'gemini-3.5-flash';

/** Read the pref fresh each call so a model change applies to the next request. */
export async function geminiModel(): Promise<GeminiModel> {
  try {
    const v = await OverlayModule.getPref('gemini_model');
    if (GEMINI_MODEL_OPTIONS.some(o => o.id === v)) {
      return v as GeminiModel;
    }
  } catch {}
  return DEFAULT_GEMINI_MODEL;
}
