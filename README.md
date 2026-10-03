# omp-devmode-guard

An **omp-exclusive** extension that enforces development mode boundaries (`frontend`, `backend`, or `both`) across your coding sessions.

Instead of rigid, brittle hardcoded path lists, `omp-devmode-guard` leverages the **Jev System One judge** (via OpenRouter `~typesafe/jev-latest` or TypeSafe) to dynamically classify files into **Frontend**, **Backend**, or **Shared** and blocks unauthorized modifications before tools execute.

---

## Features

- **Dynamic Boundary Detection with Jev**: Classifies arbitrary file trees accurately without hardcoded rules.
- **Strict Enforcement on Modifications**: Intercepts `edit` and `write` tool calls before execution.
- **Interactive Violation Handling**:
  - `Block`: Denies the modification and halts agent action.
  - `Allow for this prompt only`: Grants permission for the current prompt turn, resetting automatically on `turn_end`.
  - `Allow for this session`: Permits modifying the file for the active session.
  - `Switch mode to BOTH`: Switches development mode to `both` dynamically.
- **Persistent Cache**: File classifications are cached persistently in `~/.omp/devmode-cache.json` for lightning-fast zero-latency repeat evaluations.
- **Slash Commands**: Quick mode switching and status via `/devmode`.

---

## Installation & Setup in omp

Add the extension to your omp configuration (`~/.omp/agent/config.json` or project `.omp/` config):

```json
{
  "extensions": [
    "D:/Workspace/Personal/omp-devmode-guard/dist/index.js"
  ]
}
```

Or install it locally:

```bash
cd D:/Workspace/Personal/omp-devmode-guard
npm install
npm run build
```

---

## Commands

- `/devmode status` — Check active development mode and Jev judge status.
- `/devmode frontend` — Restrict modifications to frontend files only.
- `/devmode backend` — Restrict modifications to backend files only.
- `/devmode both` — Allow both frontend and backend modifications.
- `/devmode setup` — Interactive wizard to configure OpenRouter API key and default dev mode.

---

## Configuration

Credentials and defaults can be configured globally (`~/.omp/devmode-guard.json`) or per-project (`.omp-devmode.json`). It also automatically reuses existing OpenRouter keys configured in `~/.omp/subagent-router.json` or `OPENROUTER_API_KEY`.

---

## License

MIT
