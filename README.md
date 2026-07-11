<div align="center">

# 🌊 OpenFlow

**Desktop-class AI, on the screen you actually use.**

Over 90% of Indians access the internet through a smartphone. OpenFlow brings agentic, screen-aware AI assistance to that screen — think *Antigravity* or *Claude*, but for everyone, not just developers.

<img width="1996" height="816" alt="OpenFlow" src="https://github.com/user-attachments/assets/5f86501d-4812-488b-91dc-05fd4fa4461f" />

</div>

---

## What is this?

OpenFlow is an AI companion that **lives on your screen** — mobile or desktop — and helps you get things done. Say what you want, and it watches, points, explains, and can even take the wheel and complete multi-step tasks for you.

This repo hosts two companions, one shared vision:

| | [`app/`](./app) — **HeyFlow Mobile** | [`desktop_agent/`](./desktop_agent) — **Nova** |
|---|---|---|
| **Platform** | Android (screen-aware voice agent) | macOS / Windows desktop |
| **Wakes on** | "Hey Flow" | Global shortcut |
| **Does** | Watches your screen, talks back, points at UI, can drive the phone | Plans a visible step-by-step task, confirms before anything destructive, executes it |
| **Stack** | React Native 0.86 + Kotlin, GPT-realtime / GPT-4o vision | Tauri 2 (Rust) + React + TypeScript, Gemini |

---

## 🧠 Why "graceful degradation"?

Most AI assistants are cloud-first — and they fall over exactly when you need them most:

- ✈️ on a flight
- 🏥 inside a hospital
- 🏭 at a factory
- 🌪️ in a disaster zone
- 🏫 in a classroom with poor connectivity

OpenFlow is built to **degrade gracefully instead of failing**:

```
Cloud  →  Edge  →  Local (Gemma fallback)
```

If the network drops, the agent keeps working with a smaller local model rather than going silent.

---

## 👋 Who is this for?

OpenFlow is designed around real people doing real things on real, often unreliable, connections:

- 🎓 **Students** — understanding lectures, filling scholarship forms, explaining PDFs
- 🛍️ **Small business owners** — reading invoices, replying to customers, GST summaries
- 🧰 **Field workers** — updating CRMs, filling inspection forms, live translation
- 🏛️ **Citizens** — navigating government portals and official documents
- 🏭 **Factory & manufacturing operators** — following SOPs, reporting issues, maintenance manuals
- 🌾 **Farmers** — diagnosing crop issues via camera, subsidy applications, farm records
- 👵 **Senior citizens** — reading things aloud, navigating unfamiliar apps

---

## 📱 HeyFlow Mobile

A screen-aware voice companion for Android. Say **"Hey Flow"** and it listens, looks at your screen, and helps.

- 🎙️ **Voice-first** — wake word + real-time speech via GPT-realtime
- 👀 **Screen-aware** — reads what's on screen, points at UI elements, draws shapes, guides you step by step
- 🤖 **Agent mode** — can drive the phone itself for multi-step tasks (accessibility-based automation)
- 🔔 **Proactive** — notices when you're stuck before you have to ask

📹 [Watch the demo](https://www.linkedin.com/posts/shrit1401_i-made-clicky-for-mobile-inspired-by-farza-activity-7479647749475323918-Ba5J)

### Quick start

```bash
cd app
npm install
npm start          # start Metro
npm run android     # build + run (Android only — iOS scaffolding exists but is untested)
```

Requires Node ≥ 22.11.0 and the [React Native environment](https://reactnative.dev/docs/set-up-your-environment) set up.

---

## 🖥️ Nova (Desktop Agent)

An AI-native desktop companion. Give it a plain-English command, watch it draw up a visible plan, confirm anything destructive, then let it execute — with results shown right back to you.

### Quick start

```bash
cd desktop_agent
npm install

export GEMINI_API_KEY="your-key-here"
npm run tauri dev
```

**Prerequisites:** Node.js 20+, Rust (via `rustup`), a Gemini API key.

### Try the demo

```bash
./scripts/setup-demo.sh
# Then in Nova, type: "Organize my Downloads folder"
```

### Stack

- **Frontend:** React + TypeScript + Tailwind CSS
- **Desktop shell:** Tauri 2.x (Rust backend)
- **AI:** Gemini 2.0 Flash for JSON-only plan generation
- **Storage:** SQLite for the activity log

---

## 🗂️ Repository structure

```
open-flow/
├── app/                  # HeyFlow Mobile — React Native + Kotlin (Android)
│   ├── App.tsx           # Onboarding + home/agent/mind/settings tabs
│   ├── src/               # Voice loop, wake word, task router, agents
│   └── android/           # Native modules: overlay, automation, speech
│
└── desktop_agent/        # Nova — Tauri desktop agent
    ├── src/               # React frontend
    ├── src-tauri/         # Rust backend: planner, commands, db
    └── scripts/           # Demo setup scripts
```

---

## 🛣️ Status

Both companions are early and moving fast. Expect rough edges, active refactors, and features that outrun their docs. If something breaks, that usually means we just shipped it.

## 🤝 Contributing

Issues and PRs are welcome. If you're picking up either the mobile or desktop agent, start with the README in that folder — `app/README.md` and `desktop_agent/README.md` — for the deeper technical dive.

---

<div align="center">

Built for the next billion screens, not just the ones with a keyboard attached.

</div>
