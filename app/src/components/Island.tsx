import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AssistantState } from '../useVoiceAssistant';

let LinearGradient: any;
try {
  LinearGradient = require('react-native-linear-gradient').default;
} catch {
  LinearGradient = null;
}

const SCREEN_WIDTH = Dimensions.get('window').width;

type Dimensions2 = { width: number; height: number; radius: number };

const SIZES: Record<AssistantState, Dimensions2> = {
  idle: { width: 130, height: 38, radius: 19 },
  listening: { width: 300, height: 160, radius: 34 },
  thinking: { width: 260, height: 150, radius: 32 },
  done: { width: 260, height: 120, radius: 28 },
  error: { width: 280, height: 120, radius: 26 },
  answer: { width: Math.min(SCREEN_WIDTH * 0.9, 440), height: 400, radius: 30 },
};

// Vivid per-state gradients: blue for listening, purple for thinking.
const STATE_GRADIENTS: Record<AssistantState, string[]> = {
  idle: ['#1E88FF', '#7C3AED'],
  listening: ['#2563EB', '#1E3A8A'],
  thinking: ['#7C3AED', '#4C1D95'],
  done: ['#059669', '#065F46'],
  error: ['#DC2626', '#7F1D1D'],
  answer: ['#1E3A8A', '#312E81'],
};

const BAR_COUNT = 5;

interface IslandProps {
  state: AssistantState;
  transcript: string;
  answer: string;
  error: string;
  doneLabel: string;
  onPress: () => void;
  onClose: () => void;
}

function GradientFill({
  style,
  colors,
}: {
  style: any;
  colors: string[];
}) {
  if (LinearGradient) {
    return (
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={style}
      />
    );
  }
  return <View style={[style, { backgroundColor: colors[0] }]} />;
}

export default function Island({
  state,
  transcript,
  answer,
  error,
  doneLabel,
  onPress,
  onClose,
}: IslandProps) {
  const width = useRef(new Animated.Value(SIZES.idle.width)).current;
  const height = useRef(new Animated.Value(SIZES.idle.height)).current;
  const radius = useRef(new Animated.Value(SIZES.idle.radius)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(1)).current;

  const barValues = useMemo(
    () => Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3)),
    [],
  );
  const dotValues = useMemo(
    () => [
      new Animated.Value(0.3),
      new Animated.Value(0.3),
      new Animated.Value(0.3),
    ],
    [],
  );

  // Animate size/shape whenever state changes.
  useEffect(() => {
    const target = SIZES[state];
    contentOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(width, {
        toValue: target.width,
        useNativeDriver: false,
        friction: 9,
        tension: 80,
      }),
      Animated.spring(height, {
        toValue: target.height,
        useNativeDriver: false,
        friction: 9,
        tension: 80,
      }),
      Animated.timing(radius, {
        toValue: target.radius,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 260,
      delay: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [state, width, height, radius, contentOpacity]);

  // Idle breathing loop.
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (state === 'idle') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1.06,
            duration: 1000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(breath, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      );
      loop.start();
    } else {
      breath.setValue(1);
    }
    return () => {
      loop?.stop();
    };
  }, [state, breath]);

  // Waveform bars while listening.
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    if (state === 'listening') {
      barValues.forEach((val, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(val, {
              toValue: 0.4 + Math.random() * 0.6,
              duration: 260 + i * 40,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(val, {
              toValue: 0.2 + Math.random() * 0.3,
              duration: 260 + i * 30,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        );
        loop.start();
        loops.push(loop);
      });
    }
    return () => loops.forEach(l => l.stop());
  }, [state, barValues]);

  // Thinking dots.
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    if (state === 'thinking') {
      dotValues.forEach((val, i) => {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(i * 150),
            Animated.timing(val, {
              toValue: 1,
              duration: 320,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(val, {
              toValue: 0.3,
              duration: 320,
              easing: Easing.in(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.delay((BAR_COUNT - i) * 40),
          ]),
        );
        loop.start();
        loops.push(loop);
      });
    }
    return () => loops.forEach(l => l.stop());
  }, [state, dotValues]);

  const containerStyle = {
    width,
    height,
    borderRadius: radius,
    transform: [{ scale: breath }],
  };

  const isCard = state === 'answer';

  return (
    <Pressable
      onPress={state === 'idle' ? onPress : undefined}
      disabled={state !== 'idle'}
    >
      <Animated.View
        style={[
          styles.container,
          containerStyle,
          state === 'error' && styles.errorGlow,
          state === 'done' && styles.doneGlow,
        ]}
      >
        <GradientFill
          style={StyleSheet.absoluteFill}
          colors={STATE_GRADIENTS[state] ?? STATE_GRADIENTS.idle}
        />
        {state !== 'error' && state !== 'done' && (
          <View style={[StyleSheet.absoluteFill, styles.rim]} pointerEvents="none" />
        )}

        <Animated.View style={[styles.content, { opacity: contentOpacity }]}>
          {state === 'idle' && <View style={styles.idleDot} />}

          {state === 'listening' && (
            <>
              <View style={styles.barsRow}>
                {barValues.map((val, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.bar,
                      {
                        height: val.interpolate({
                          inputRange: [0, 1],
                          outputRange: [8, 56],
                        }),
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.label}>Listening...</Text>
            </>
          )}

          {state === 'thinking' && (
            <>
              <View style={styles.dotsRow}>
                {dotValues.map((val, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        opacity: val,
                        transform: [
                          {
                            scale: val.interpolate({
                              inputRange: [0.3, 1],
                              outputRange: [0.8, 1.2],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={styles.label}>Thinking...</Text>
            </>
          )}

          {state === 'done' && (
            <>
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>{'✓'}</Text>
              </View>
              <Text style={styles.label} numberOfLines={2}>
                {doneLabel}
              </Text>
            </>
          )}

          {state === 'error' && (
            <>
              <Text style={styles.errorLabel} numberOfLines={2}>
                {error}
              </Text>
            </>
          )}

          {isCard && (
            <View style={styles.answerCard}>
              <Pressable
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={12}
              >
                <Text style={styles.closeButtonText}>{'×'}</Text>
              </Pressable>
              {!!transcript && (
                <Text style={styles.answerPrompt} numberOfLines={2}>
                  "{transcript}"
                </Text>
              )}
              <ScrollView
                style={styles.answerScroll}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.answerText}>{answer}</Text>
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const GLOW_BLUE = '#4F7FFF';
const GLOW_PURPLE = '#8B5CF6';

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12162B',
    shadowColor: GLOW_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 16,
  },
  rim: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
  },
  doneGlow: {
    shadowColor: '#34D399',
  },
  errorGlow: {
    shadowColor: '#F87171',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '100%',
    height: '100%',
  },
  idleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GLOW_BLUE,
    shadowColor: GLOW_PURPLE,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 56,
    marginBottom: 14,
    gap: 6,
  },
  bar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: GLOW_BLUE,
  },
  label: {
    color: '#E5E7FF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  errorLabel: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    marginBottom: 14,
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GLOW_PURPLE,
  },
  checkCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(52,211,153,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  checkMark: {
    color: '#34D399',
    fontSize: 20,
    fontWeight: '700',
  },
  answerCard: {
    width: '100%',
    height: '100%',
    paddingTop: 8,
  },
  closeButton: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    zIndex: 2,
  },
  closeButtonText: {
    color: '#E5E7FF',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  answerPrompt: {
    color: '#93A3C4',
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 8,
    paddingRight: 28,
  },
  answerScroll: {
    flex: 1,
  },
  answerText: {
    color: '#F1F3FF',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    paddingBottom: 12,
  },
});
