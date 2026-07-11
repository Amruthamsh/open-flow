# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

HeyFlow Mobile — a screen-aware voice companion for Android. The user says "Hey Flow" (or taps the notch pill overlay), it listens, screenshots the screen, sends it to OpenAI (GPT-4o / GPT-realtime), speaks the answer aloud, and can point a cursor at specific UI elements or autonomously drive the phone through multi-step tasks via the accessibility service.

Android only. iOS scaffolding exists but is unused.

## Commands

```bash
npm start              # Start Metro bundler
npm run android        # Build + install on connected device/emulator
npm run lint           # ESLint (extends @react-native)
npm test               # Jest (react-native preset)
npx jest --testPathPattern=<pattern>  # Run a single test
```

Requires Node >= 22.11.0. The Android build uses Gradle 9.3 (wrapper in `android/`).

## Architecture

The app has two execution domains that run in parallel:

### JS side (React Native 0.86, React 19)

- **`App.tsx`** — The in-app UI: onboarding flow, home/agent/mind/settings tabs. Deliberately thin; the real product is the native overlay.
- **`src/useVoiceAssistant.ts`** — Hook orchestrating the full voice loop: listen → route → respond. Bridges native speech events to the JS AI layer.
- **`src/useWakeWord.ts`** — Passive "Hey Flow" detection that triggers listening.
- **`src/taskRouter.ts`** — Pattern-matching classifier that decides whether user speech is a stop command, a read-only question (→ companion), or an action request (→ agent).
- **`src/companion.ts`** — Chat completions path: screenshot + GPT-4o vision → text reply + optional `[POINT:x,y]` cursor command.
- **`src/realtime.ts`** — WebSocket path: OpenAI Realtime API → streamed PCM audio (marin voice) for sub-second first-word latency. Falls back to companion when backgrounded.
- **`src/visionAgent.ts`** — Screenshot-only autonomous agent loop (MobileUse-style): screenshot → vision model → execute gesture → repeat. Has stuck-detection heuristics.
- **`src/mobileUseAgent.ts`** — Accessibility-tree agent loop: reads the UI element tree (not screenshots) and acts by element index. Faster but less robust for visual tasks.
- **`src/agentTools.ts`** — Action primitives (tap, swipe, type, openApp, screenshot) that call into `AutomationModule` native module.
- **`src/plan.ts`** — Model tier system: "default" (gpt-4o-mini / realtime-mini) vs "max" (gpt-5.5 / realtime full). Password-gated upgrade in settings.
- **`src/scriptedFlows.ts`** — Hard-coded multi-step flows (e.g. WhatsApp message) that bypass the LLM loop for reliability.

### Native side (Kotlin, `android/app/src/main/java/com/heyclickymobile/`)

- **`OverlayModule.kt`** — React Native bridge: overlay/bubble drawing, preferences (SharedPreferences), memory/history CRUD, telemetry, permission helpers.
- **`AutomationModule.kt`** + **`AutomationAccessibilityService.kt`** — Accessibility service that reads the UI tree, takes screenshots, and performs gestures (tap/swipe/type by coordinate or element index).
- **`SpeechModule.kt`** — Android SpeechRecognizer bridge + raw PCM audio player for realtime streaming.
- **`HeyClickyForegroundService.kt`** — Foreground service keeping the companion alive while backgrounded. (Note: class/file names still use HeyClicky internally to avoid breaking the build.)
- **`agent/ClickyAgent.kt`** — Native agent (Flow) that runs autonomously even when the JS app is backgrounded; emits progress via `DeviceEventEmitter`.
- **`agent/ProactiveWatcher.kt`** — Observes user patterns and offers proactive nudges (currently delivery is disabled pre-release, data collection active).
- **`agent/Telemetry.kt`** — PostHog event pipeline shared by JS and native layers.

### Native Modules bridged to JS

- `OverlayModule` — overlay control, prefs, memory, history, telemetry, bubble state
- `AutomationModule` — UI tree, screenshots, gestures, app launching
- `SpeechModule` — speech recognition, PCM player

## Key Patterns

- **Config**: API keys live in `src/config.ts` (gitignored). The OpenAI key is passed to native via `OverlayModule.configureCompanion()` at app start.
- **Coordinate mapping**: Screenshots are downscaled for the model; all cursor/gesture positions must be scaled back to device pixels using `deviceWidth/width` ratios.
- **Fallback chain**: Realtime API (foreground) → companion chat + TTS (background) → error state.
- **Plan pref**: Both JS (`src/plan.ts`) and native (`Plan.kt`) read the same SharedPreferences `plan` key to select model tiers.
