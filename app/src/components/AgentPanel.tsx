import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { askCompanion, CompanionTurn } from '../companion';
import { askRealtime } from '../realtime';
import { speak } from '../tts';

/**
 * In-app tester for the screen-aware companion. Type a question; Flow
 * screenshots the current screen, answers in its companion voice, speaks it,
 * and points the cursor at anything relevant. (Voice input uses the same
 * askCompanion path.)
 */
export default function AgentPanel() {
  const [question, setQuestion] = useState('what can i do on this screen?');
  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState('');
  const history = useRef<CompanionTurn[]>([]);

  const handleAsk = async () => {
    if (running || !question.trim()) return;
    setRunning(true);
    setReply('');
    try {
      let answer: string;
      try {
        answer = await askRealtime(question.trim(), history.current, {
          onTranscript: setReply,
        });
      } catch {
        // Fall back to companion (chat + TTS) if realtime is unavailable.
        answer = await askCompanion(question.trim(), history.current);
        setReply(answer);
        speak(answer).catch(() => {});
      }
      setReply(answer);
      history.current = [
        ...history.current.slice(-8),
        { role: 'user', content: question.trim() },
        { role: 'assistant', content: answer },
      ];
    } catch (err) {
      setReply(`⚠️ ${err}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Ask Flow</Text>
      <Text style={styles.sub}>
        Flow sees your current screen, answers, speaks, and points the cursor
        at what's relevant. Requires the accessibility service and an OpenAI key.
      </Text>
      <TextInput
        style={styles.input}
        value={question}
        onChangeText={setQuestion}
        placeholder="Ask about what's on screen…"
        placeholderTextColor="#6B7280"
        editable={!running}
        multiline
      />
      <Pressable
        testID="ask-flow-btn"
        style={[styles.runBtn, running && styles.runBtnDisabled]}
        onPress={handleAsk}
        disabled={running}
      >
        {running ? (
          <View style={styles.runningRow}>
            <ActivityIndicator color="#0B0B12" size="small" />
            <Text style={styles.runBtnText}>Thinking…</Text>
          </View>
        ) : (
          <Text style={styles.runBtnText}>Ask</Text>
        )}
      </Pressable>

      {!!reply && <Text style={styles.reply}>{reply}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#0D0D14',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    marginBottom: 12,
  },
  heading: { fontSize: 15, fontWeight: '700', color: '#E5E7FF', marginBottom: 4 },
  sub: { fontSize: 11, color: '#8B92B0', marginBottom: 10, lineHeight: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#E5E7EB',
    fontSize: 14,
    minHeight: 44,
    marginBottom: 10,
  },
  runBtn: {
    backgroundColor: '#8B9BFF',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBtnDisabled: { opacity: 0.6 },
  runningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  runBtnText: { color: '#0B0B12', fontWeight: '700', fontSize: 15 },
  reply: {
    marginTop: 12,
    color: '#E5E7FF',
    fontSize: 14,
    lineHeight: 20,
  },
});
