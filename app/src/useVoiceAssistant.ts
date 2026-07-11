import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { GEMINI_API_KEY } from './config';
import { speak } from './tts';
import { askCompanion, CompanionTurn } from './companion';
import { askRealtime } from './realtime';
import { routeTask, runRoutedAgentTask } from './taskRouter';

const { SpeechModule, OverlayModule } = NativeModules;
const speechEvents = new NativeEventEmitter(SpeechModule);
const overlayEvents = new NativeEventEmitter(OverlayModule);

export type AssistantState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'done'
  | 'error'
  | 'answer';

export function useVoiceAssistant() {
  const [state, setState] = useState<AssistantState>('idle');
  const [transcript, setTranscript] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [doneLabel, setDoneLabel] = useState('');

  const autoResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef<AssistantState>('idle');
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearAutoResetTimer = useCallback(() => {
    if (autoResetTimer.current) {
      clearTimeout(autoResetTimer.current);
      autoResetTimer.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearAutoResetTimer();
    setState('idle');
    setTranscript('');
    setAnswer('');
    setError('');
    setDoneLabel('');
  }, [clearAutoResetTimer]);

  const showError = useCallback(
    (message: string) => {
      clearAutoResetTimer();
      setError(message);
      setState('error');
      autoResetTimer.current = setTimeout(() => {
        reset();
      }, 1600);
    },
    [clearAutoResetTimer, reset],
  );

  const showDone = useCallback(
    (label: string) => {
      clearAutoResetTimer();
      setDoneLabel(label);
      setState('done');
      autoResetTimer.current = setTimeout(() => {
        reset();
      }, 1400);
    },
    [clearAutoResetTimer, reset],
  );

  // Ongoing companion conversation (text only — screenshots are per-turn).
  const historyRef = useRef<CompanionTurn[]>([]);

  const callCompanion = useCallback(
    async (prompt: string) => {
      setState('thinking');
      if (!GEMINI_API_KEY) {
        setAnswer('Add your Gemini key in src/config.ts so I can help.');
        setState('answer');
        return;
      }
      try {
        // gpt-realtime (streamed marin audio) only works while the app is
        // foreground — backgrounded (notch use over another app), the JS event
        // loop is throttled and the socket stalls, so go straight to the
        // companion (chat + TTS), which completes reliably in the background.
        const foreground = AppState.currentState === 'active';
        let reply: string;
        if (foreground && GEMINI_API_KEY) {
          try {
            reply = await askRealtime(prompt, historyRef.current, {
              onTranscript: t => {
                setAnswer(t);
                setState('answer');
              },
            });
          } catch (realtimeErr) {
            console.warn('Realtime failed, using companion', realtimeErr);
            reply = await askCompanion(prompt, historyRef.current);
            setAnswer(reply);
            setState('answer');
            speak(reply).catch(e => console.error('TTS failed', e));
          }
        } else {
          reply = await askCompanion(prompt, historyRef.current);
          setAnswer(reply);
          setState('answer');
          speak(reply).catch(e => console.error('TTS failed', e));
        }
        setAnswer(reply);
        setState('answer');
        historyRef.current = [
          ...historyRef.current.slice(-8),
          { role: 'user', content: prompt },
          { role: 'assistant', content: reply },
        ];
      } catch (err) {
        showError('Could not reach Flow. Please try again.');
        console.error('Companion request failed', err);
      }
    },
    [showError],
  );

  const handleTranscript = useCallback(
    async (text: string) => {
      setTranscript(text);
      const route = routeTask(text);

      if (route.kind === 'stop') {
        try {
          SpeechModule.stopListening?.();
          SpeechModule.stopAudio?.();
          SpeechModule.stopPcmPlayer?.();
        } catch {}
        reset();
        return;
      }

      if (route.kind === 'agent') {
        if (!GEMINI_API_KEY) {
          setAnswer('Add your Gemini key in src/config.ts so I can work through app steps.');
          setState('answer');
          return;
        }

        try {
          setState('thinking');
          setAnswer('starting');
          const result = await runRoutedAgentTask(text, status => {
            setAnswer(status);
            setState('answer');
          });
          if (result.success) {
            showDone(result.message);
          } else {
            setAnswer(result.message);
            setState('answer');
          }
          speak(result.message).catch(e => console.error('TTS failed', e));
        } catch (err) {
          console.error('Agent task failed', err);
          showError('Could not complete that task.');
        }
        return;
      }

      await callCompanion(text);
    },
    [callCompanion, reset, showDone, showError],
  );

  useEffect(() => {
    const resultsSub = speechEvents.addListener(
      'SpeechResults',
      (e: { value?: string[] }) => {
        // SpeechModule is a shared singleton — ignore events that arrive
        // while this hook isn't the one that started listening (e.g. the
        // wake-word passive loop owns the recognizer instead).
        if (stateRef.current !== 'listening') {
          return;
        }
        const text = e.value && e.value.length > 0 ? e.value[0] : '';
        if (text) {
          handleTranscript(text);
        } else {
          showError('No speech detected.');
        }
      },
    );

    const errorSub = speechEvents.addListener(
      'SpeechError',
      (e: { error?: string }) => {
        if (stateRef.current !== 'listening') {
          return;
        }
        console.warn('Speech error', e.error);
        showError('No speech detected. Try again.');
      },
    );

    return () => {
      clearAutoResetTimer();
      resultsSub.remove();
      errorSub.remove();
      SpeechModule.destroyRecognizer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(async () => {
    clearAutoResetTimer();
    setError('');
    setAnswer('');
    setTranscript('');

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showError('Microphone permission needed');
          return;
        }
      } catch (err) {
        console.error('Permission request failed', err);
        showError('Microphone permission needed');
        return;
      }
    }

    try {
      setState('listening');
      SpeechModule.startListening('en-US');
    } catch (err) {
      console.error('SpeechModule.startListening failed', err);
      showError('Could not start listening.');
    }
  }, [clearAutoResetTimer, showError]);

  // Native bubble tap (from the persistent floating overlay) triggers the
  // same listening flow as tapping the in-app Island.
  useEffect(() => {
    const tapSub = overlayEvents.addListener('BubbleTapped', () => {
      startListening();
    });
    return () => {
      tapSub.remove();
    };
  }, [startListening]);

  // Mirror every JS state change onto the native notch overlay so it
  // visually reflects the assistant's status even while another app is
  // foregrounded. The notch expands to show whatever text fits the state.
  useEffect(() => {
    try {
      if (!OverlayModule || typeof OverlayModule.setBubbleState !== 'function') {
        return;
      }
      const notchText =
        state === 'answer'
          ? answer
          : state === 'error'
          ? error
          : state === 'done'
          ? doneLabel
          : state === 'thinking'
          ? transcript
          : '';
      OverlayModule.setBubbleState(state, notchText || undefined);
    } catch (err) {
      console.error('OverlayModule.setBubbleState failed', err);
    }
  }, [state, doneLabel, answer, error, transcript]);

  return {
    state,
    transcript,
    answer,
    error,
    doneLabel,
    startListening,
    reset,
    handleTranscript,
  };
}
