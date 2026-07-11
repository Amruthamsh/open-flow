/**
 * Gemini text-to-speech playback (fallback path).
 *
 * Used when the app is backgrounded and the Live API path isn't available.
 * Calls generateContent with AUDIO response modality, then streams the
 * returned PCM chunk through the native PCM player.
 */
import { NativeModules } from 'react-native';
import { GoogleGenAI, Modality } from '@google/genai';
import { GEMINI_API_KEY } from './config';
import { geminiModel } from './plan';

const { SpeechModule } = NativeModules;

const SAMPLE_RATE = 24000;

export async function speak(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!GEMINI_API_KEY || !trimmed) {
    return;
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const model = await geminiModel();

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: trimmed.slice(0, 4000) }] }],
    config: {
      responseModalities: [Modality.AUDIO] as any,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
    } as any,
  });

  const audioData =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) {
    throw new Error('TTS: no audio in response');
  }

  // PCM 24 kHz 16-bit mono: 2 bytes/sample → estimate playback duration.
  const estimatedBytes = Math.floor(audioData.length * 0.75);
  const durationMs = Math.ceil((estimatedBytes / 2 / SAMPLE_RATE) * 1000) + 500;

  SpeechModule.startPcmPlayer(SAMPLE_RATE);
  SpeechModule.writePcm(audioData);
  await new Promise(resolve => setTimeout(resolve, durationMs));
  SpeechModule.stopPcmPlayer();
}

export function stopSpeaking(): void {
  try {
    SpeechModule?.stopPcmPlayer?.();
    SpeechModule?.stopAudio?.();
  } catch {}
}
