/**
 * Flow — a tiny companion that lives in your notch.
 *
 * The app itself is deliberately small: onboarding (permissions + how it
 * works), a home screen showing Flow's status, the memory Flow has built
 * up about you, your past conversations, and settings. The real product is
 * the native notch companion.
 *
 * @format
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  DeviceEventEmitter,
  Easing,
  Image,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { GEMINI_API_KEY } from './src/config';
import {
  type GeminiModel,
  GEMINI_MODEL_OPTIONS,
  DEFAULT_GEMINI_MODEL,
} from './src/plan';
import { COMPANION_SYSTEM_PROMPT } from './src/companionPrompt';

const { OverlayModule, AutomationModule } = NativeModules;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const C = {
  bg: '#05050A',
  card: '#0C0C14',
  cardBorder: 'rgba(255,255,255,0.07)',
  blue: '#2563EB',
  blueBright: '#4F8BFF',
  purple: '#7C3AED',
  text: '#F3F4F6',
  textDim: '#8B93A7',
  textFaint: '#5A6072',
  green: '#34D399',
  red: '#F87171',
};

const GRAD: [string, string] = [C.blue, C.purple];
// Signature multi-stop gradient — orange → red → blue, the warm "flow" arc
// used across onboarding heroes and accents.
const GRAD_ARC: [string, string, string, string] = [
  '#FB923C',
  '#F97316',
  '#EF4444',
  '#2563EB',
];
// Per-step accent so each onboarding page owns a colour from the arc.
const STEP_ACCENTS: [string, string][] = [
  ['#FB923C', '#F97316'], // welcome — orange
  ['#F97316', '#EF4444'], // how — orange→red
  ['#EF4444', '#7C3AED'], // permissions — red→violet
  ['#4F8BFF', '#2563EB'], // ready — blue
];

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type Screen = 'loading' | 'onboarding' | 'main';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>('loading');

  // Hand the OpenAI key + persona to the native companion (the notch runs
  // fully native so it works while the app is backgrounded).
  useEffect(() => {
    try {
      OverlayModule?.configureCompanion?.(
        GEMINI_API_KEY,
        COMPANION_SYSTEM_PROMPT,
      );
    } catch (err) {
      console.error('configureCompanion failed', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const onboarded = await OverlayModule.getPref('onboarded');
        setScreen(onboarded === '1' ? 'main' : 'onboarding');
      } catch {
        setScreen('onboarding');
      }
    })();
  }, []);

  if (screen === 'loading') {
    return <View style={styles.root} />;
  }
  if (screen === 'onboarding') {
    return (
      <Onboarding
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onDone={async () => {
          try {
            await OverlayModule.setPref('onboarded', '1');
          } catch {}
          setScreen('main');
        }}
      />
    );
  }
  return (
    <Main
      insetsTop={insets.top}
      insetsBottom={insets.bottom}
      onReplayOnboarding={() => setScreen('onboarding')}
    />
  );
}

// ---------------------------------------------------------------------------
// Permissions helpers
// ---------------------------------------------------------------------------

type PermState = {
  overlay: boolean;
  mic: boolean;
  accessibility: boolean;
  battery: boolean;
};

async function checkPermissions(): Promise<PermState> {
  const out: PermState = {
    overlay: false,
    mic: false,
    accessibility: false,
    battery: false,
  };
  try {
    out.overlay = await OverlayModule.canDrawOverlays();
  } catch {}
  try {
    if (Platform.OS === 'android') {
      out.mic = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
    }
  } catch {}
  try {
    out.accessibility = await AutomationModule.isServiceEnabled();
  } catch {}
  try {
    out.battery = await OverlayModule.isIgnoringBatteryOptimizations();
  } catch {}
  return out;
}

/** Turn the notch on (permissions permitting). Returns whether it's on. */
async function enableNotch(): Promise<boolean> {
  const perms = await checkPermissions();
  if (!perms.overlay || !perms.mic) return false;
  try {
    OverlayModule.startAssistantService();
    await OverlayModule.showBubble();
    return true;
  } catch (err) {
    console.error('enableNotch failed', err);
    return false;
  }
}

async function disableNotch() {
  try {
    await OverlayModule.hideBubble();
    OverlayModule.stopAssistantService();
  } catch {}
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

const ONBOARDING_STEPS = ['welcome', 'how', 'permissions', 'ready'] as const;

function Onboarding({
  insetsTop,
  insetsBottom,
  onDone,
}: {
  insetsTop: number;
  insetsBottom: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [perms, setPerms] = useState<PermState>({
    overlay: false,
    mic: false,
    accessibility: false,
    battery: false,
  });

  const refreshPerms = useCallback(() => {
    checkPermissions().then(setPerms);
  }, []);

  // Re-check every time the user comes back from a settings screen.
  useEffect(() => {
    refreshPerms();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refreshPerms();
    });
    return () => sub.remove();
  }, [refreshPerms]);

  const required = perms.overlay && perms.mic && perms.accessibility;
  const isPermStep = ONBOARDING_STEPS[step] === 'permissions';
  const isLast = step === ONBOARDING_STEPS.length - 1;

  const next = async () => {
    if (isLast) {
      const on = await enableNotch();
      if (on) {
        await OverlayModule.setPref('notch', 'on');
      }
      onDone();
      return;
    }
    setStep(s => s + 1);
  };

  const accent = STEP_ACCENTS[step] ?? STEP_ACCENTS[0];

  return (
    <View style={[styles.root, { paddingTop: insetsTop }]}>
      {/* Ambient glow that shifts colour with the step. */}
      <LinearGradient
        colors={[accent[0] + '2E', '#05050A00']}
        style={styles.onbGlow}
        pointerEvents="none"
      />
      {/* Slim gradient progress bar. */}
      <View style={styles.onbProgressTrack}>
        <LinearGradient
          colors={GRAD_ARC}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.onbProgressFill,
            { width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%` },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.onbScroll,
          { paddingBottom: insetsBottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {ONBOARDING_STEPS[step] === 'welcome' && (
          <View style={styles.onbPage}>
            <View style={styles.onbHero}>
              <LinearGradient
                colors={GRAD_ARC}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.onbHeroRing}
              >
                <View style={styles.onbHeroInner}>
                  <ClickyOrb />
                </View>
              </LinearGradient>
            </View>
            <Text style={[styles.onbKicker, { color: accent[0] }]}>welcome</Text>
            <Text style={styles.onbTitle}>meet flow</Text>
            <Text style={styles.onbBody}>
              a tiny buddy that lives in a little pill at the top of your
              screen — like a dynamic island, but it talks.
            </Text>
            <Text style={styles.onbBody}>
              tap it, ask anything, and flow sees your screen, answers out
              loud, points its cursor at things, and walks you through
              whatever you're doing.
            </Text>
          </View>
        )}

        {ONBOARDING_STEPS[step] === 'how' && (
          <View style={styles.onbPage}>
            <Text style={[styles.onbKicker, { color: accent[0] }]}>the basics</Text>
            <Text style={styles.onbTitle}>how it works</Text>
            <HowRow
              n="1"
              title="tap the notch"
              body="the little pill at the top. tap it and just start talking — the mic is on instantly."
            />
            <HowRow
              n="2"
              title="flow sees your screen"
              body="ask “what is this?”, “open uber”, “where do i tap to book a ride?” — it knows what you're looking at."
            />
            <HowRow
              n="3"
              title="it points and draws"
              body="a glowing cursor flies to the exact spot to tap, and it can box out whole sections while explaining them."
            />
            <HowRow
              n="4"
              title="it remembers you"
              body="flow keeps a little memory — your name, what you like — so it gets more helpful over time. you can see and delete everything in the app."
            />
            <HowRow
              n="5"
              title="it stays out of the way"
              body="the notch slides down when a search bar or keyboard needs the space, and you can say “close that banner” anytime to dismiss it."
            />
          </View>
        )}

        {isPermStep && (
          <View style={styles.onbPage}>
            <Text style={[styles.onbKicker, { color: accent[0] }]}>almost there</Text>
            <Text style={styles.onbTitle}>a few permissions</Text>
            <Text style={styles.onbBody}>
              flow needs these to live on your screen. each opens a system
              page — flip it on and come back here.
            </Text>
            <PermCard
              title="display over other apps"
              body="lets the notch, cursor and boxes draw on top of your apps."
              done={perms.overlay}
              actionLabel="allow"
              onPress={() => OverlayModule.requestOverlayPermission()}
            />
            <PermCard
              title="microphone"
              body="so flow can hear you when you tap the notch."
              done={perms.mic}
              actionLabel="allow"
              onPress={async () => {
                await PermissionsAndroid.request(
                  PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                );
                refreshPerms();
              }}
            />
            <PermCard
              title="accessibility service"
              body="how flow reads your screen and finds the exact buttons to point at. find “HeyFlow” in the list and turn it on."
              done={perms.accessibility}
              actionLabel="open settings"
              onPress={() => AutomationModule.openAccessibilitySettings()}
            />
            <PermCard
              title="run in background"
              body="optional but recommended — lets flow answer while you're inside other apps without the phone freezing it."
              done={perms.battery}
              actionLabel="allow"
              onPress={() => OverlayModule.requestIgnoreBatteryOptimizations()}
            />
          </View>
        )}

        {ONBOARDING_STEPS[step] === 'ready' && (
          <View style={styles.onbPage}>
            <View style={styles.onbHero}>
              <LinearGradient
                colors={['#4F8BFF', '#2563EB', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.onbHeroRing}
              >
                <View style={styles.onbHeroInner}>
                  <ClickyOrb />
                </View>
              </LinearGradient>
            </View>
            <Text style={[styles.onbKicker, { color: accent[0] }]}>ready</Text>
            <Text style={styles.onbTitle}>you're all set</Text>
            <Text style={styles.onbBody}>
              the notch turns on now and stays on. look for the little pill at
              the top of your screen, tap it, and say hi.
            </Text>
            <Text style={styles.onbBody}>
              try: “open spotify”, “what's on my screen?”, or “remember that i
              go by {'“'}boss{'”'}”.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.onbFooter, { paddingBottom: insetsBottom + 18 }]}>
        <GradientButton
          label={
            isLast
              ? 'start flow'
              : isPermStep && !required
              ? 'finish permissions above'
              : 'continue'
          }
          disabled={isPermStep && !required}
          onPress={next}
        />
        {step > 0 && (
          <Pressable onPress={() => setStep(s => s - 1)}>
            <Text style={styles.onbBack}>back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const HOW_BADGE_GRADS: [string, string][] = [
  ['#FB923C', '#F97316'],
  ['#F97316', '#EF4444'],
  ['#EF4444', '#EC4899'],
  ['#A855F7', '#7C3AED'],
  ['#4F8BFF', '#2563EB'],
];

function HowRow({ n, title, body }: { n: string; title: string; body: string }) {
  const grad = HOW_BADGE_GRADS[(parseInt(n, 10) - 1) % HOW_BADGE_GRADS.length];
  return (
    <View style={styles.howRow}>
      <LinearGradient
        colors={grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.howBadge}
      >
        <Text style={styles.howBadgeText}>{n}</Text>
      </LinearGradient>
      <View style={styles.howTextWrap}>
        <Text style={styles.howTitle}>{title}</Text>
        <Text style={styles.howBody}>{body}</Text>
      </View>
    </View>
  );
}

function PermCard({
  title,
  body,
  done,
  actionLabel,
  onPress,
}: {
  title: string;
  body: string;
  done: boolean;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View style={[styles.card, styles.permCard]}>
      <View style={styles.permHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View
          style={[
            styles.permBadge,
            { backgroundColor: done ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)' },
          ]}
        >
          <Text style={{ color: done ? C.green : C.textDim, fontSize: 11, fontWeight: '700' }}>
            {done ? 'done' : 'needed'}
          </Text>
        </View>
      </View>
      <Text style={styles.cardBody}>{body}</Text>
      {!done && (
        <Pressable style={styles.permBtn} onPress={onPress}>
          <Text style={styles.permBtnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main (tabs: home / memory / history / settings)
// ---------------------------------------------------------------------------

type Tab = 'home' | 'agent' | 'mind' | 'settings';

type MemoryItem = { t: number; fact: string };
type HistoryItem = { t: number; user: string; assistant: string };

function Main({
  insetsTop,
  insetsBottom,
  onReplayOnboarding,
}: {
  insetsTop: number;
  insetsBottom: number;
  onReplayOnboarding: () => void;
}) {
  const [tab, setTab] = useState<Tab>('home');
  const [notchOn, setNotchOn] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [turnTotal, setTurnTotal] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const m = JSON.parse(await OverlayModule.getMemories());
      setMemories([...m].reverse());
    } catch {}
    try {
      const h = JSON.parse(await OverlayModule.getHistory());
      setHistory([...h].reverse());
    } catch {}
    try {
      // Lifetime count, not capped at the 100 kept for the scrollback list —
      // without this the "conversations" stat froze at 100 forever.
      setTurnTotal(await OverlayModule.getTurnTotal());
    } catch {}
  }, []);

  // Notch is on by default: bring it up on every app open unless the user
  // turned it off in settings.
  useEffect(() => {
    (async () => {
      const pref = await OverlayModule.getPref('notch').catch(() => '');
      if (pref !== 'off') {
        setNotchOn(await enableNotch());
      }
      refresh();
    })();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const toggleNotch = async () => {
    if (notchOn) {
      await disableNotch();
      await OverlayModule.setPref('notch', 'off');
      setNotchOn(false);
    } else {
      const on = await enableNotch();
      if (!on) {
        Alert.alert(
          'permissions missing',
          'flow needs the overlay + microphone permissions. re-run the walkthrough from settings.',
        );
        return;
      }
      await OverlayModule.setPref('notch', 'on');
      setNotchOn(true);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insetsTop }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>flow</Text>
        <View style={styles.statusWrap}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: notchOn ? C.green : C.textFaint },
            ]}
          />
          <Text style={styles.statusText}>
            {notchOn ? 'in your notch' : 'sleeping'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insetsBottom + 96, paddingHorizontal: 18 }}
      >
        {tab === 'home' && (
          <HomeTab
            notchOn={notchOn}
            onToggle={toggleNotch}
            memoryCount={memories.length}
            historyCount={turnTotal}
          />
        )}
        {tab === 'agent' && <AgentTab />}
        {tab === 'mind' && (
          <MindTab memories={memories} history={history} refresh={refresh} />
        )}
        {tab === 'settings' && (
          <SettingsTab
            notchOn={notchOn}
            onToggleNotch={toggleNotch}
            onReplayOnboarding={onReplayOnboarding}
            refresh={refresh}
          />
        )}
      </ScrollView>

      <View style={[styles.tabBar, { paddingBottom: insetsBottom + 8 }]}>
        {(['home', 'agent', 'mind', 'settings'] as Tab[]).map(t => (
          <TabButton
            key={t}
            label={t}
            active={tab === t}
            onPress={() => {
              refresh();
              setTab(t);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabBtn} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      {active && <LinearGradient colors={GRAD} style={styles.tabIndicator} />}
    </Pressable>
  );
}

// --- Agent --------------------------------------------------------------------
// Chat-style view over the native ClickyAgent: type a task, watch live step
// progress stream in, answer its questions, stop it anytime. The agent itself
// runs fully native, so it keeps working (and showing progress in the notch)
// even when this screen is backgrounded.

type AgentMsg = {
  id: number;
  kind: 'user' | 'agent' | 'progress' | 'error';
  text: string;
};

let agentMsgId = 0;

function AgentTab() {
  const [messages, setMessages] = useState<AgentMsg[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [awaiting, setAwaiting] = useState(false);

  const push = useCallback((kind: AgentMsg['kind'], text: string) => {
    setMessages(prev => {
      // Progress notes replace the previous progress line instead of stacking.
      const next =
        kind === 'progress' && prev.length > 0 && prev[prev.length - 1].kind === 'progress'
          ? prev.slice(0, -1)
          : prev;
      return [...next, { id: ++agentMsgId, kind, text }];
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await OverlayModule.agentState();
        setRunning(!!s.running);
        setAwaiting(!!s.awaitingUser);
        if (s.awaitingUser && s.question) push('agent', s.question);
      } catch {}
    })();
    const sub = DeviceEventEmitter.addListener('clickyAgent', (e: any) => {
      switch (e?.type) {
        case 'start':
          setRunning(true);
          setAwaiting(false);
          break;
        case 'resume':
          setRunning(true);
          setAwaiting(false);
          break;
        case 'progress':
          push('progress', e.text);
          break;
        case 'ask':
          setRunning(false);
          setAwaiting(true);
          push('agent', e.text);
          break;
        case 'done':
          setRunning(false);
          setAwaiting(false);
          push('agent', e.text);
          break;
        case 'error':
          setRunning(false);
          setAwaiting(false);
          push('error', e.text);
          break;
      }
    });
    return () => sub.remove();
  }, [push]);

  const send = async () => {
    const task = input.trim();
    if (!task) return;
    setInput('');
    push('user', task);
    try {
      const status = awaiting
        ? await OverlayModule.agentReply(task)
        : await OverlayModule.agentStart(task);
      if (status && !/started|continuing/.test(status)) push('error', status);
    } catch (e: any) {
      push('error', e?.message ?? 'could not reach the agent');
    }
  };

  const stop = async () => {
    try {
      await OverlayModule.agentStop();
    } catch {}
  };

  return (
    <View>
      <View style={aStyles.head}>
        <Text style={styles.cardTitle}>agent mode</Text>
        <Text style={styles.cardBody}>
          tell flow what to do and it operates your phone by itself — taps,
          types, opens apps. it asks before anything is sent, booked, or paid.
        </Text>
      </View>

      {messages.length === 0 && (
        <View style={[styles.card, aStyles.hintCard]}>
          <Text style={aStyles.hintTitle}>try</Text>
          {[
            'play lo-fi beats on spotify',
            'message dad on whatsapp that i\'ll call tonight',
            'search flights to goa next weekend',
          ].map(s => (
            <Pressable key={s} onPress={() => setInput(s)}>
              <Text style={aStyles.hintRow}>“{s}”</Text>
            </Pressable>
          ))}
        </View>
      )}

      {messages.map(m => (
        <View
          key={m.id}
          style={[
            aStyles.bubble,
            m.kind === 'user' && aStyles.bubbleUser,
            m.kind === 'agent' && aStyles.bubbleAgent,
            m.kind === 'progress' && aStyles.bubbleProgress,
            m.kind === 'error' && aStyles.bubbleError,
          ]}
        >
          {m.kind === 'user' ? (
            <LinearGradient colors={GRAD} style={aStyles.bubbleUserFill}>
              <Text style={aStyles.userText}>{m.text}</Text>
            </LinearGradient>
          ) : (
            <Text
              style={[
                aStyles.agentText,
                m.kind === 'progress' && aStyles.progressText,
                m.kind === 'error' && aStyles.errorText,
              ]}
            >
              {m.kind === 'progress' ? `⋯ ${m.text}` : m.text}
            </Text>
          )}
        </View>
      ))}

      {running && (
        <Pressable style={aStyles.stopBtn} onPress={stop}>
          <Text style={aStyles.stopText}>✕ stop the agent</Text>
        </Pressable>
      )}

      <View style={[styles.card, aStyles.inputRow]}>
        <TextInput
          style={aStyles.input}
          value={input}
          onChangeText={setInput}
          placeholder={
            awaiting ? 'answer flow…' : running ? 'agent is working…' : 'what should flow do?'
          }
          placeholderTextColor={C.textFaint}
          editable={!running}
          multiline
          onSubmitEditing={send}
        />
        <Pressable
          style={[aStyles.sendBtn, (running || !input.trim()) && { opacity: 0.4 }]}
          onPress={send}
          disabled={running || !input.trim()}
        >
          <LinearGradient colors={GRAD} style={aStyles.sendFill}>
            <Text style={aStyles.sendGlyph}>➤</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const aStyles = StyleSheet.create({
  head: { marginTop: 18, marginBottom: 14 },
  hintCard: { paddingVertical: 14 },
  hintTitle: {
    color: C.textFaint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  hintRow: { color: C.blueBright, fontSize: 14, lineHeight: 30 },
  bubble: { marginBottom: 10, maxWidth: '88%' },
  bubbleUser: { alignSelf: 'flex-end' },
  bubbleUserFill: {
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  bubbleAgent: {
    alignSelf: 'flex-start',
    backgroundColor: C.card,
    borderColor: C.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  agentText: { color: C.text, fontSize: 14, lineHeight: 20 },
  bubbleProgress: { alignSelf: 'flex-start', paddingHorizontal: 6 },
  progressText: { color: C.textDim, fontSize: 13, fontStyle: 'italic' },
  bubbleError: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderColor: 'rgba(248,113,113,0.25)',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: { color: C.red, fontSize: 13, lineHeight: 19 },
  stopBtn: { alignSelf: 'center', marginVertical: 6, padding: 8 },
  stopText: { color: C.red, fontSize: 13, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    maxHeight: 110,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendBtn: { marginLeft: 8 },
  sendFill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: { color: '#fff', fontSize: 15, marginLeft: 2 },
});

// --- Mind ---------------------------------------------------------------------
// One place for everything going on in flow's head: proactive thoughts
// (patterns it noticed, nudges it gave and how they went), the facts it
// remembers, and past conversations.

type InsightItem = { id: number; t: number; kind: string; text: string; status: string };
type MindSection = 'thoughts' | 'memory' | 'history';

function MindTab({
  memories,
  history,
  refresh,
}: {
  memories: MemoryItem[];
  history: HistoryItem[];
  refresh: () => void;
}) {
  const [section, setSection] = useState<MindSection>('thoughts');
  const [insights, setInsights] = useState<InsightItem[]>([]);

  const loadInsights = useCallback(async () => {
    try {
      const list = JSON.parse(await OverlayModule.getInsights());
      setInsights([...list].reverse());
    } catch {}
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const statusColor = (s: string) =>
    s === 'accepted' ? C.green : s === 'dismissed' ? C.textFaint : s === 'offered' ? '#A78BFA' : C.blueBright;

  const kindGlyph = (k: string) =>
    k === 'stuck' ? '◉' : k === 'cab-habit' ? '⏰' : k === 'morning' ? '☀' : k === 'topic' ? '↺' : '✦';

  return (
    <View>
      <View style={mStyles.head}>
        <Text style={styles.cardTitle}>flow's mind</Text>
        <Text style={styles.cardBody}>
          what it notices, remembers, and has talked about with you. proactive
          nudges only happen a few times a day, never at night, and back off
          when you ignore them.
        </Text>
      </View>

      <View style={mStyles.segRow}>
        {(['thoughts', 'memory', 'history'] as MindSection[]).map(s => (
          <Pressable
            key={s}
            style={[mStyles.segBtn, section === s && mStyles.segBtnActive]}
            onPress={() => {
              refresh();
              loadInsights();
              setSection(s);
            }}
          >
            <Text style={[mStyles.segText, section === s && mStyles.segTextActive]}>{s}</Text>
          </Pressable>
        ))}
      </View>

      {section === 'thoughts' && (
        <View>
          {insights.length === 0 && (
            <View style={[styles.card, styles.emptyCard]}>
              <Text style={styles.emptyText}>
                nothing noticed yet — flow learns your patterns quietly as you
                use the phone (repeated asks, morning apps, usual cab times) and
                they'll show up here.
              </Text>
            </View>
          )}
          {insights.map(i => (
            <View key={`${i.id}-${i.t}`} style={[styles.card, mStyles.thoughtRow]}>
              <Text style={mStyles.thoughtGlyph}>{kindGlyph(i.kind)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={mStyles.thoughtText}>{i.text}</Text>
                <Text style={mStyles.thoughtTime}>{timeAgo(i.t)}</Text>
              </View>
              <View style={[mStyles.statusPill, { borderColor: statusColor(i.status) }]}>
                <Text style={{ color: statusColor(i.status), fontSize: 10, fontWeight: '700' }}>
                  {i.status}
                </Text>
              </View>
            </View>
          ))}
          {insights.length > 0 && (
            <DangerLink
              label="clear thoughts"
              onPress={() =>
                confirmThen('clear everything flow has noticed?', async () => {
                  await OverlayModule.clearInsights();
                  loadInsights();
                })
              }
            />
          )}
        </View>
      )}

      {section === 'memory' && <MemoryTab memories={memories} refresh={refresh} />}
      {section === 'history' && <HistoryTab history={history} refresh={refresh} />}
    </View>
  );
}

const mStyles = StyleSheet.create({
  head: { marginTop: 18, marginBottom: 14 },
  segRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 4,
    marginBottom: 14,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  segBtnActive: { backgroundColor: 'rgba(79,139,255,0.16)' },
  segText: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  segTextActive: { color: C.blueBright },
  thoughtRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thoughtGlyph: { color: C.blueBright, fontSize: 16, width: 22, textAlign: 'center' },
  thoughtText: { color: C.text, fontSize: 13, lineHeight: 19 },
  thoughtTime: { color: C.textFaint, fontSize: 11, marginTop: 2 },
  statusPill: {
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
});

// --- Home -------------------------------------------------------------------

function HomeTab({
  notchOn,
  onToggle,
  memoryCount,
  historyCount,
}: {
  notchOn: boolean;
  onToggle: () => void;
  memoryCount: number;
  historyCount: number;
}) {
  return (
    <View>
      <View style={styles.heroWrap}>
        <ClickyOrb />
        <Text style={styles.heroTitle}>
          {notchOn ? 'flow is up in your notch' : 'flow is asleep'}
        </Text>
        <Text style={styles.heroBody}>
          {notchOn
            ? 'tap the pill at the top of any screen and start talking.'
            : 'turn it on and the pill appears at the top of every screen.'}
        </Text>
        <GradientButton
          label={notchOn ? 'turn notch off' : 'turn notch on'}
          onPress={onToggle}
          subtle={notchOn}
        />
      </View>

      <View style={styles.statRow}>
        <View style={[styles.card, styles.statCard]}>
          <Text style={styles.statNumber}>{memoryCount}</Text>
          <Text style={styles.statLabel}>things remembered</Text>
        </View>
        <View style={[styles.card, styles.statCard]}>
          <Text style={styles.statNumber}>{historyCount}</Text>
          <Text style={styles.statLabel}>conversations</Text>
        </View>
      </View>

      <View style={[styles.card, styles.tryCard]}>
        <Text style={styles.cardTitle}>things to try</Text>
        <Text style={styles.tryLine}>“open uber and show me where to book”</Text>
        <Text style={styles.tryLine}>“what's on my screen?”</Text>
        <Text style={styles.tryLine}>“remember that i live in indirapuram”</Text>
        <Text style={styles.tryLine}>“go through this playlist and tell me about it”</Text>
      </View>
    </View>
  );
}

// --- Memory -------------------------------------------------------------------

function MemoryTab({
  memories,
  refresh,
}: {
  memories: MemoryItem[];
  refresh: () => void;
}) {
  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [draft, setDraft] = useState('');

  // Index in stored (chronological) order.
  const storedIndexOf = async (item: MemoryItem) => {
    const stored: MemoryItem[] = JSON.parse(await OverlayModule.getMemories());
    return stored.findIndex(m => m.t === item.t && m.fact === item.fact);
  };

  const remove = async (item: MemoryItem) => {
    try {
      const idx = await storedIndexOf(item);
      if (idx >= 0) await OverlayModule.deleteMemory(idx);
      refresh();
    } catch {}
  };

  const saveEdit = async () => {
    const item = editing;
    if (!item) return;
    try {
      const idx = await storedIndexOf(item);
      if (idx >= 0) await OverlayModule.updateMemory(idx, draft);
      setEditing(null);
      refresh();
    } catch {}
  };

  return (
    <View>
      <Text style={styles.tabHeading}>what flow knows about you</Text>
      <Text style={styles.tabSub}>
        saved when you tell flow things worth keeping. it reads these at the
        start of every conversation.
      </Text>
      {memories.length === 0 && (
        <View style={[styles.card, styles.emptyCard]}>
          <Text style={styles.emptyText}>
            nothing yet — try “remember that …” while talking to flow.
          </Text>
        </View>
      )}
      {memories.map(m =>
        editing && editing.t === m.t && editing.fact === m.fact ? (
          <View key={`${m.t}-${m.fact}`} style={[styles.card, styles.memRow]}>
            <TextInput
              style={styles.memInput}
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              placeholderTextColor={C.textFaint}
            />
            <Pressable onPress={saveEdit} hitSlop={8}>
              <Text style={styles.memSave}>save</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(null)} hitSlop={8}>
              <Text style={styles.memDelete}>✕</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            key={`${m.t}-${m.fact}`}
            style={[styles.card, styles.memRow]}
            onPress={() => {
              setEditing(m);
              setDraft(m.fact);
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.memFact}>{m.fact}</Text>
              <Text style={styles.memTime}>{timeAgo(m.t)} · tap to edit</Text>
            </View>
            <Pressable onPress={() => remove(m)} hitSlop={10}>
              <Text style={styles.memDelete}>✕</Text>
            </Pressable>
          </Pressable>
        ),
      )}
      {memories.length > 0 && (
        <DangerLink
          label="forget everything"
          onPress={() =>
            confirmThen('forget everything flow knows about you?', async () => {
              await OverlayModule.clearMemories();
              refresh();
            })
          }
        />
      )}
    </View>
  );
}

// --- History -------------------------------------------------------------------

function HistoryTab({
  history,
  refresh,
}: {
  history: HistoryItem[];
  refresh: () => void;
}) {
  return (
    <View>
      <Text style={styles.tabHeading}>past conversations</Text>
      <Text style={styles.tabSub}>
        your most recent {history.length} turns with flow
        {history.length >= 100 ? ' (the last 100 kept on device)' : ''}.
      </Text>
      {history.length === 0 && (
        <View style={[styles.card, styles.emptyCard]}>
          <Text style={styles.emptyText}>no conversations yet — tap the notch and say hi.</Text>
        </View>
      )}
      {history.map(h => (
        <View key={`${h.t}`} style={[styles.card, styles.historyRow]}>
          {!!h.user && <Text style={styles.historyUser}>you: {h.user}</Text>}
          {!!h.assistant && (
            <Text style={styles.historyClicky}>flow: {h.assistant}</Text>
          )}
          <Text style={styles.memTime}>{timeAgo(h.t)}</Text>
        </View>
      ))}
      {history.length > 0 && (
        <DangerLink
          label="clear history"
          onPress={() =>
            confirmThen('clear all conversation history?', async () => {
              await OverlayModule.clearHistory();
              refresh();
            })
          }
        />
      )}
    </View>
  );
}

// --- Settings -------------------------------------------------------------------

// Kept for when proactive nudges come back (see ProactiveWatcher.kt) — its
// only call site below is commented out for now, so it's otherwise unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProactiveRow() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    OverlayModule.getPref('proactive')
      .then((v: string) => setOn(v !== 'off'))
      .catch(() => {});
  }, []);
  return (
    <SettingRow
      title="proactive nudges"
      body={
        on
          ? 'on — flow chimes softly when it notices you stuck or spots a routine (max a few times a day, sleeps at night).'
          : 'off — flow only speaks when you tap it.'
      }
      actionLabel={on ? 'turn off' : 'turn on'}
      onPress={async () => {
        const next = !on;
        setOn(next);
        await OverlayModule.setPref('proactive', next ? 'on' : 'off').catch(() => {});
      }}
    />
  );
}

function ModelRow() {
  const [selected, setSelected] = useState<GeminiModel>(DEFAULT_GEMINI_MODEL);

  useEffect(() => {
    OverlayModule.getPref('gemini_model')
      .then((v: string) => {
        if (GEMINI_MODEL_OPTIONS.some(o => o.id === v)) {
          setSelected(v as GeminiModel);
        }
      })
      .catch(() => {});
  }, []);

  const pick = async (id: GeminiModel) => {
    setSelected(id);
    await OverlayModule.setPref('gemini_model', id).catch(() => {});
  };

  return (
    <View style={[styles.card, styles.planCard]}>
      <Text style={styles.cardTitle}>model</Text>
      <Text style={[styles.cardBody, { marginBottom: 12 }]}>
        used for chat, vision, and agent tasks. voice always uses gemini live.
      </Text>
      <View style={mdStyles.optionRow}>
        {GEMINI_MODEL_OPTIONS.map(opt => {
          const active = selected === opt.id;
          return (
            <Pressable
              key={opt.id}
              style={[mdStyles.optionBtn, active && mdStyles.optionBtnActive]}
              onPress={() => pick(opt.id)}
            >
              <Text style={[mdStyles.optionLabel, active && mdStyles.optionLabelActive]}>
                {opt.label}
              </Text>
              <Text style={mdStyles.optionDesc}>{opt.desc}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const mdStyles = StyleSheet.create({
  optionRow: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  optionBtnActive: {
    borderColor: 'rgba(79,139,255,0.55)',
    backgroundColor: 'rgba(79,139,255,0.12)',
  },
  optionLabel: {
    color: C.textDim,
    fontSize: 14,
    fontWeight: '700',
  },
  optionLabelActive: { color: C.blueBright },
  optionDesc: {
    color: C.textFaint,
    fontSize: 11,
    marginTop: 2,
  },
});

function SettingsTab({
  notchOn,
  onToggleNotch,
  onReplayOnboarding,
  refresh,
}: {
  notchOn: boolean;
  onToggleNotch: () => void;
  onReplayOnboarding: () => void;
  refresh: () => void;
}) {
  return (
    <View>
      <Text style={styles.tabHeading}>settings</Text>
      <SettingRow
        title="notch assistant"
        body={notchOn ? 'on — living at the top of your screen' : 'off'}
        actionLabel={notchOn ? 'turn off' : 'turn on'}
        onPress={onToggleNotch}
      />
      <ModelRow />
      <SettingRow
        title="setup walkthrough"
        body="re-run onboarding: how flow works and every permission."
        actionLabel="open"
        onPress={onReplayOnboarding}
      />
      <SettingRow
        title="accessibility service"
        body="flow's eyes. if pointing stops working after an update, re-enable it here."
        actionLabel="open"
        onPress={() => AutomationModule.openAccessibilitySettings()}
      />
      <SettingRow
        title="background use"
        body="keep flow awake while you're in other apps."
        actionLabel="allow"
        onPress={() => OverlayModule.requestIgnoreBatteryOptimizations()}
      />
      <SettingRow
        title="notch position"
        body="drag the pill anywhere — it docks to the left, center, or right. this puts it back top-center."
        actionLabel="reset"
        onPress={() => OverlayModule.resetNotchDock().catch(() => {})}
      />
      {/* Proactive nudges are disabled ahead of release (see ProactiveWatcher.kt
          — Chime/notch delivery commented out, data gathering stays on), so
          this toggle is hidden for now rather than controlling a dead UI. */}
      {/* <ProactiveRow /> */}
      <SettingRow
        title="forget everything"
        body="wipe flow's memory about you."
        actionLabel="wipe"
        danger
        onPress={() =>
          confirmThen('forget everything flow knows about you?', async () => {
            await OverlayModule.clearMemories();
            refresh();
          })
        }
      />
      <SettingRow
        title="clear history"
        body="delete all past conversations."
        actionLabel="clear"
        danger
        onPress={() =>
          confirmThen('clear all conversation history?', async () => {
            await OverlayModule.clearHistory();
            refresh();
          })
        }
      />
      <Text style={styles.about}>hey flow · your little screen buddy</Text>
    </View>
  );
}

function SettingRow({
  title,
  body,
  actionLabel,
  onPress,
  danger,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <View style={[styles.card, styles.settingRow]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
      </View>
      <Pressable
        style={[styles.permBtn, danger && styles.dangerBtn]}
        onPress={onPress}
      >
        <Text style={[styles.permBtnText, danger && { color: C.red }]}>
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/** The Flow identity mark: a breathing gradient orb with the pointer. */
function ClickyOrb() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Image
        source={require('./src/assets/clicky-logo.png')}
        style={styles.orbImg}
      />
    </Animated.View>
  );
}

function GradientButton({
  label,
  onPress,
  disabled,
  subtle,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  subtle?: boolean;
}) {
  if (subtle) {
    return (
      <Pressable style={styles.subtleBtn} onPress={onPress}>
        <Text style={styles.subtleBtnText}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={disabled ? undefined : onPress}>
      <LinearGradient
        colors={disabled ? ['#1F2430', '#1F2430'] : GRAD}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradBtn, disabled && { opacity: 0.55 }]}
      >
        <Text style={styles.gradBtnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function DangerLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignSelf: 'center', padding: 14 }}>
      <Text style={{ color: C.red, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function confirmThen(message: string, action: () => void) {
  Alert.alert('are you sure?', message, [
    { text: 'cancel', style: 'cancel' },
    { text: 'yes', style: 'destructive', onPress: action },
  ]);
}

function timeAgo(t: number): string {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: {
    color: C.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: C.textDim, fontSize: 12, fontWeight: '600' },

  // Onboarding
  onbScroll: { paddingHorizontal: 24 },
  onbPage: { paddingTop: 30, alignItems: 'center' },
  onbGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  onbProgressTrack: {
    height: 4,
    marginHorizontal: 24,
    marginTop: 6,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  onbProgressFill: { height: 4, borderRadius: 2 },
  onbHero: { alignItems: 'center', marginTop: 18, marginBottom: 8 },
  onbHeroRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onbHeroInner: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#08080E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onbKicker: {
    color: C.blueBright,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 24,
    alignSelf: 'flex-start',
  },
  onbTitle: {
    color: C.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 6,
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  onbBody: {
    color: C.textDim,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 18,
    alignSelf: 'flex-start',
  },
  onbFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 26,
    paddingTop: 14,
    backgroundColor: C.bg,
  },
  onbBack: {
    color: C.textFaint,
    textAlign: 'center',
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  dotActive: { backgroundColor: C.blueBright, width: 20 },

  howRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
    marginBottom: 12,
  },
  howBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  howBadgeText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  howTextWrap: { flex: 1 },
  howTitle: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 3 },
  howBody: { color: C.textDim, fontSize: 14, lineHeight: 21 },

  // Cards
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 16,
  },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardBody: { color: C.textDim, fontSize: 13, lineHeight: 19 },

  permCard: { alignSelf: 'stretch', marginTop: 14 },
  permHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  permBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(79,139,255,0.45)',
    backgroundColor: 'rgba(79,139,255,0.10)',
  },
  permBtnText: { color: '#9DB4FF', fontSize: 13, fontWeight: '700' },
  dangerBtn: {
    borderColor: 'rgba(248,113,113,0.4)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },

  // Buttons
  gradBtn: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
  },
  gradBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  subtleBtn: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  subtleBtnText: { color: C.textDim, fontSize: 14, fontWeight: '700' },

  // Logo
  orbImg: {
    width: 148,
    height: 148,
    marginTop: 12,
  },

  // Home
  heroWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 22 },
  heroTitle: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 6,
  },
  heroBody: {
    color: C.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
    paddingHorizontal: 10,
  },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statNumber: { color: C.text, fontSize: 28, fontWeight: '800' },
  statLabel: { color: C.textFaint, fontSize: 12, fontWeight: '600', marginTop: 2 },
  tryCard: { marginBottom: 12 },
  tryLine: { color: C.textDim, fontSize: 13.5, lineHeight: 24 },

  // Tabs content
  tabHeading: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 4,
  },
  tabSub: { color: C.textFaint, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  emptyCard: { alignItems: 'center', paddingVertical: 28 },
  emptyText: { color: C.textFaint, fontSize: 13.5, textAlign: 'center', lineHeight: 20 },

  memRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  memFact: { color: C.text, fontSize: 14.5, lineHeight: 21 },
  memTime: { color: C.textFaint, fontSize: 11.5, marginTop: 4 },
  memDelete: { color: C.textFaint, fontSize: 15, padding: 6 },
  memInput: {
    flex: 1,
    color: C.text,
    fontSize: 14.5,
    lineHeight: 21,
    padding: 0,
    marginRight: 8,
  },
  memSave: { color: C.blueBright, fontSize: 13.5, fontWeight: '700', padding: 6 },

  historyRow: { marginBottom: 10 },
  historyUser: { color: C.textDim, fontSize: 13.5, lineHeight: 20, marginBottom: 4 },
  historyClicky: { color: C.text, fontSize: 14, lineHeight: 21 },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  planCard: { marginBottom: 10 },
  about: {
    color: C.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 22,
  },

  // Tab bar
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(8,8,14,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 10,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabLabel: { color: C.textFaint, fontSize: 12.5, fontWeight: '700' },
  tabLabelActive: { color: C.text },
  tabIndicator: {
    width: 18,
    height: 3,
    borderRadius: 2,
    marginTop: 5,
  },
});

export default App;
