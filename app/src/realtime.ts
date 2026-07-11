/**
 * Gemini Live companion.
 *
 * Opens a Live session to the Gemini API, sends the current screen + the
 * user's question, and streams the spoken response (PCM audio) to the native
 * PCM player as it's generated — so Flow starts talking in ~1s instead of
 * waiting for a full text→speech round-trip.
 */
import { NativeModules } from 'react-native';
import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';
import { GEMINI_API_KEY } from './config';
import { COMPANION_SYSTEM_PROMPT } from './companionPrompt';
import { takeScreenshot } from './agentTools';

const { SpeechModule, OverlayModule } = NativeModules;

// Gemini Live outputs 24 kHz 16-bit PCM mono by default.
const SAMPLE_RATE = 24000;
const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

export interface RealtimeCallbacks {
  /** Streamed transcript of what Flow is saying (for on-screen display). */
  onTranscript?: (text: string) => void;
}

/**
 * Ask Flow via the Gemini Live API. Resolves with the final spoken transcript.
 * Audio plays as it streams in. Falls back by throwing so the caller can use
 * another path if live is unavailable.
 */
export function askRealtime(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  callbacks: RealtimeCallbacks = {},
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    if (!GEMINI_API_KEY) {
      reject(new Error('No Gemini key configured.'));
      return;
    }

    let shot: Awaited<ReturnType<typeof takeScreenshot>> | null = null;
    try {
      shot = await takeScreenshot();
    } catch {
      shot = null;
    }

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    let transcript = '';
    let playing = false;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(firstAudioTimeout);
      clearTimeout(hardTimeout);
      try {
        if (playing) SpeechModule.stopPcmPlayer();
      } catch {}
      fn();
    };

    const firstAudioTimeout = setTimeout(() => {
      if (!playing) finish(() => reject(new Error('Gemini Live stalled (no audio)')));
    }, 5000);
    const hardTimeout = setTimeout(() => finish(() => resolve(cleanText(transcript))), 30000);

    let session: Awaited<ReturnType<typeof ai.live.connect>> | undefined;
    try {
      session = await ai.live.connect({
        model: LIVE_MODEL,
        callbacks: {
          onopen: () => {},
          onmessage: (message: any) => {
            if (settled) return;
            const parts = message.serverContent?.modelTurn?.parts;
            if (parts) {
              for (const part of parts) {
                if (part.inlineData?.data) {
                  // Raw PCM base64 chunk — feed straight to the native player.
                  if (!playing) {
                    playing = true;
                    SpeechModule.startPcmPlayer(SAMPLE_RATE);
                  }
                  SpeechModule.writePcm(part.inlineData.data);
                }
                if (typeof part.text === 'string' && part.text) {
                  transcript += part.text;
                  callbacks.onTranscript?.(transcript);
                }
              }
            }
            if (message.serverContent?.turnComplete) {
              maybePoint(transcript, shot);
              finish(() => resolve(cleanText(transcript)));
            }
          },
          onerror: (e: ErrorEvent) => {
            finish(() => reject(new Error(e.message || 'Gemini Live error')));
          },
          onclose: (e: CloseEvent) => {
            if (playing) {
              finish(() => resolve(cleanText(transcript)));
            } else {
              finish(() => reject(new Error('Gemini Live closed before audio')));
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
          systemInstruction: COMPANION_SYSTEM_PROMPT,
          contextWindowCompression: {
            triggerTokens: '104857',
            slidingWindow: { targetTokens: '52428' },
          },
        } as any,
      });
    } catch (err) {
      clearTimeout(firstAudioTimeout);
      clearTimeout(hardTimeout);
      reject(err);
      return;
    }

    // Build the conversation turns to send.
    const turns: string[] = [];

    // Prior turns for context (text only).
    for (const turn of history.slice(-8)) {
      turns.push(`${turn.role === 'assistant' ? 'Assistant' : 'User'}: ${turn.content}`);
    }

    // Current question, optionally with the screenshot.
    let userMessage = question;
    if (shot) {
      // Gemini Live sendClientContent supports inline image parts; we pass
      // the screenshot as a separate part in the parts array below.
    }
    turns.push(`User: ${userMessage}`);

    try {
      if (shot) {
        session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                { text: turns.slice(0, -1).join('\n') + (turns.length > 1 ? '\n' : '') + question },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: shot.base64,
                  },
                },
              ],
            },
          ],
        } as any);
      } else {
        session.sendClientContent({ turns } as any);
      }
    } catch (err) {
      finish(() => reject(err));
      return;
    }
  });
}

function maybePoint(text: string, shot: { deviceWidth: number; width: number; deviceHeight: number; height: number } | null) {
  const point = text.match(/\[POINT:\s*(\d+)\s*,\s*(\d+)[^\]]*\]/i);
  if (point && shot && OverlayModule?.pointCursor) {
    const sx = shot.deviceWidth / shot.width;
    const sy = shot.deviceHeight / shot.height;
    try {
      OverlayModule.pointCursor(
        Math.round(parseInt(point[1], 10) * sx),
        Math.round(parseInt(point[2], 10) * sy),
      );
    } catch {}
  }
}

function cleanText(text: string): string {
  return text.replace(/\[POINT:[^\]]*\]/gi, '').trim();
}
