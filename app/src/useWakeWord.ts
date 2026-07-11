import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

const { SpeechModule } = NativeModules;
const wakeWordSpeechEvents = new NativeEventEmitter(SpeechModule);

/**
 * Wake-word matching rule (deliberate simplification — no dedicated
 * wake-word SDK available in this build):
 *
 * We normalize the transcript to lowercase and check whether it
 * `.includes('flow')`. This alone is treated as a match. We deliberately
 * do NOT require a strict "hey flow" prefix match, because on-device
 * cloud STT frequently mishears the wake phrase and a strict match would
 * make the feature feel broken. `includes('flow')` is forgiving enough
 * to catch these variants while still being unlikely to false-positive on
 * everyday speech (it's not a common word/substring).
 *
 * Once matched, we extract the "command" portion of the utterance as
 * whatever text follows the last occurrence of the word "flow" (so
 * "hey flow open youtube" -> "open youtube"). If nothing meaningful
 * follows (user just said "hey flow"), we return null so the caller can
 * prompt for a follow-up command instead.
 */
const WAKE_TOKEN = 'flow';

function matchWakePhrase(rawTranscript: string): string | null {
  const lower = rawTranscript.toLowerCase();
  const idx = lower.lastIndexOf(WAKE_TOKEN);
  if (idx === -1) {
    return null;
  }
  const remainder = rawTranscript.slice(idx + WAKE_TOKEN.length).trim();
  return remainder.length > 0 ? remainder : '';
}

export function useWakeWord() {
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const onWakeRef = useRef<((commandFromUtterance: string | null) => void) | null>(
    null,
  );

  const setArmedState = useCallback((value: boolean) => {
    armedRef.current = value;
    setArmed(value);
  }, []);

  const startWakeWordMode = useCallback(
    (onWake: (commandFromUtterance: string | null) => void) => {
      onWakeRef.current = onWake;
      setArmedState(true);
      try {
        SpeechModule.startListening('en-US');
      } catch (err) {
        console.log('useWakeWord: startListening failed', err);
      }
    },
    [setArmedState],
  );

  const stopWakeWordMode = useCallback(() => {
    setArmedState(false);
    try {
      SpeechModule.stopListening();
    } catch (err) {
      console.log('useWakeWord: stopListening failed', err);
    }
  }, [setArmedState]);

  useEffect(() => {
    if (!armed) {
      return;
    }

    const resultsSub = wakeWordSpeechEvents.addListener(
      'SpeechResults',
      (e: { value?: string[] }) => {
        if (!armedRef.current) {
          return;
        }
        const text = e.value && e.value.length > 0 ? e.value[0] : '';
        const remainder = text ? matchWakePhrase(text) : null;

        if (remainder !== null) {
          // Wake phrase matched. Hand off to the caller and do NOT
          // auto-restart — the caller owns what happens next and will
          // call startWakeWordMode() again once it's done.
          console.log('useWakeWord: wake phrase matched, transcript=', text);
          const onWake = onWakeRef.current;
          if (onWake) {
            onWake(remainder.length > 0 ? remainder : null);
          }
          return;
        }

        // No match — keep the passive listening loop going. Restart
        // immediately (event-driven, not setTimeout) so this keeps working
        // even while the app is backgrounded — see the setTimeout-throttling
        // limitation documented in useVoiceAssistant.ts. This does mean
        // rapid restarts can occasionally trigger ERROR_SERVER_DISCONNECTED
        // from the speech service; that's a known trade-off, not a bug.
        if (armedRef.current) {
          try {
            SpeechModule.startListening('en-US');
          } catch (err) {
            console.log('useWakeWord: restart after no-match failed', err);
          }
        }
      },
    );

    const errorSub = wakeWordSpeechEvents.addListener(
      'SpeechError',
      () => {
        // Expected/normal: fires constantly on silence/no-match (and
        // occasionally ERROR_SERVER_DISCONNECTED from rapid restarts) while
        // passively polling. Not a real error, so no console.error/warn.
        if (armedRef.current) {
          try {
            SpeechModule.startListening('en-US');
          } catch (err) {
            console.log('useWakeWord: restart after error failed', err);
          }
        }
      },
    );

    return () => {
      resultsSub.remove();
      errorSub.remove();
    };
  }, [armed]);

  return {
    armed,
    startWakeWordMode,
    stopWakeWordMode,
  };
}
