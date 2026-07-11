# Nova

AI-native desktop companion. Takes a natural-language command, generates a visible step-by-step plan, confirms before anything destructive, executes it, and shows results.

## Quick Start

### Prerequisites
- Node.js 20+
- Rust (via rustup)
- Gemini API key

### Setup

```bash
cd nova
npm install

# Set your Gemini API key
export GEMINI_API_KEY="your-key-here"

# Run the app
npm run tauri dev
```

### Demo Setup

```bash
# Create test files for the "Organize Downloads" demo
./scripts/setup-demo.sh

# Then in Nova, type: "Organize my Downloads folder"
# (It will use ~/Downloads by default, or /tmp/nova-test-downloads)
```

## Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Desktop**: Tauri 2.x (Rust backend)
- **AI**: Gemini 2.0 Flash (JSON-only plan generation)
- **Storage**: SQLite (activity log)

## Project Structure

```
src/           — React frontend (pages, components, lib)
src-tauri/     — Rust backend (commands, planner, DB)
scripts/       — Demo setup scripts
```
