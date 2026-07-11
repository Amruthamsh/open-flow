import { invoke } from "@tauri-apps/api/core";

type VoiceCallback = (transcript: string, isFinal: boolean) => void;
type StateCallback = (listening: boolean) => void;

interface VoiceRecognition {
  start: () => void;
  stop: () => void;
  isListening: () => boolean;
}

interface NativeVoiceResult {
  transcript: string | null;
  error: string | null;
  confidence: number | null;
}

export function createVoiceRecognition(
  onResult: VoiceCallback,
  onStateChange: StateCallback
): VoiceRecognition {
  let listening = false;
  let aborted = false;

  async function startNative() {
    if (listening) return;
    listening = true;
    aborted = false;
    onStateChange(true);

    try {
      const result: NativeVoiceResult = await invoke("start_voice_recognition");

      if (aborted) return;

      if (result.transcript) {
        onResult(result.transcript, true);
      } else if (result.error) {
        console.warn("Voice recognition error:", result.error);
      }
    } catch (e) {
      if (!aborted) {
        console.error("Voice recognition failed:", e);
      }
    } finally {
      listening = false;
      onStateChange(false);
    }
  }

  function stop() {
    aborted = true;
    listening = false;
    onStateChange(false);
  }

  function isListeningFn() {
    return listening;
  }

  return { start: startNative, stop, isListening: isListeningFn };
}
