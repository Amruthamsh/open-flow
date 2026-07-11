# HeyFlow Mobile

A screen-aware voice companion for your phone. Say "Hey Flow" and it listens, looks at your screen, and helps — pointing at buttons, walking you through an unfamiliar app, or just chatting about what's on screen.

## Demo

📹 **[Watch the demo on LinkedIn](https://www.linkedin.com/posts/shrit1401_i-made-clicky-for-mobile-inspired-by-farza-activity-7479647749475323918-Ba5J)**

In the demo, Flow:
- Looks at a music playlist and suggests tracks that fit its vibe
- Watches the screen live and walks the user through booking a cab on Rapido, pointing at exactly what to tap
- Responds in real time via voice, no manual interaction needed

## What it does

- **Voice-first**: wake word ("Hey Flow") + real-time speech, powered by GPT-realtime
- **Screen-aware**: reads what's on screen and can point at UI elements, draw shapes, and guide you step by step
- **Agent mode**: can drive the phone itself for multi-step tasks (accessibility-based automation)
- **Proactive**: notices when you're stuck and can offer help before you ask

## Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

### Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

```sh
npm start
```

### Step 2: Build and run the app

With Metro running, open a new terminal window/pane from the root of the project, and run:

```sh
npm run android
```

If everything is set up correctly, you should see the app running in the Android Emulator or your connected device.

> **Note**: This project currently only supports Android. iOS has not been set up or tested.

### Step 3: Modify the app

Open `App.tsx` in your editor and make changes. When you save, the app will automatically update — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

To forcefully reload:

- **Android**: Press <kbd>R</kbd> twice, or select **"Reload"** from the **Dev Menu** (<kbd>Ctrl</kbd> + <kbd>M</kbd> on Windows/Linux, <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> on macOS).

## Troubleshooting

If you're having issues getting the above steps to work, see the React Native [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

## Learn More

This project is built on [React Native](https://reactnative.dev). Useful resources:

- [React Native Website](https://reactnative.dev)
- [Getting Started](https://reactnative.dev/docs/environment-setup)
- [Learn the Basics](https://reactnative.dev/docs/getting-started)
- [Blog](https://reactnative.dev/blog)
- [`@facebook/react-native`](https://github.com/facebook/react-native)
