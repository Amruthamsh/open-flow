/**
 * Screen-aware companion conversation.
 *
 * When the user talks to Flow, we screenshot whatever is on screen, send it
 * to Gemini (vision) with the companion persona, and — if the model appended
 * a [POINT:x,y:label] tag — fly the blue cursor to that element.
 */
import { NativeModules } from 'react-native';
import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from './config';
import { COMPANION_SYSTEM_PROMPT } from './companionPrompt';
import { takeScreenshot } from './agentTools';
import { geminiModel } from './plan';

const { OverlayModule } = NativeModules;

export interface CompanionTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Answers `question` with context of the current screen. Returns the spoken
 * text (POINT tag stripped); side-effect: points the cursor if the model
 * asked to.
 */
export async function askCompanion(
  question: string,
  history: CompanionTurn[] = [],
): Promise<string> {
  if (!GEMINI_API_KEY) {
    return "add your gemini key in src/config.ts and i'll be able to help.";
  }

  let shot: Awaited<ReturnType<typeof takeScreenshot>> | null = null;
  try {
    shot = await takeScreenshot();
  } catch {
    shot = null;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const model = await geminiModel();

  // History turns (text only) — Gemini uses 'model' for assistant role.
  const contents: any[] = history.slice(-8).map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }));

  const userParts: any[] = [
    {
      text: shot
        ? `[the current screen is ${shot.width} by ${shot.height} pixels]\n\n${question}`
        : question,
    },
  ];
  if (shot) {
    userParts.push({ inlineData: { mimeType: 'image/jpeg', data: shot.base64 } });
  }
  contents.push({ role: 'user', parts: userParts });

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: COMPANION_SYSTEM_PROMPT,
      maxOutputTokens: 500,
      temperature: 0.5,
    },
  });

  let text = (response.text ?? '').trim();

  // Parse [POINT:x,y:label] → fly the cursor there.
  const point = text.match(/\[POINT:\s*(\d+)\s*,\s*(\d+)[^\]]*\]/i);
  if (point && shot && OverlayModule?.pointCursor) {
    const mx = parseInt(point[1], 10);
    const my = parseInt(point[2], 10);
    const sx = shot.deviceWidth / shot.width;
    const sy = shot.deviceHeight / shot.height;
    try {
      OverlayModule.pointCursor(Math.round(mx * sx), Math.round(my * sy));
    } catch {}
  }

  text = text
    .replace(/\[POINT:[^\]]*\]/gi, '')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/\(?https?:\/\/\S+\)?/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return text;
}
