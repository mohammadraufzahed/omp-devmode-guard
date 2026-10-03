# omp-devmode-guard

An **omp-exclusive** extension that enforces development mode boundaries (`frontend`, `backend`, or `both`) across your coding sessions.

Instead of rigid, brittle hardcoded path lists, `omp-devmode-guard` leverages the **Jev System One judge** (via OpenRouter `~typesafe/jev-latest` or TypeSafe) to dynamically classify files into **Frontend**, **Backend**, or **Shared** and blocks unauthorized modifications before tools execute.

---

## What It Does

1. **System Prompt & Self-Restraint (`before_agent_start`)**:
   - Injects explicit mode instructions into the LLM context.
   - In `frontend` mode, tells the agent not to attempt backend edits and to use mock fixtures/stubs instead.

2. **Tool & Shell Guard (`tool_call`)**:
   - Inspects `edit`, `write`, and mutating `bash` shell commands (`sed -i`, `rm`, `mv`, `git restore`, `>`).
   - Blocks unauthorized mutations before execution begins.

3. **Subagent Enforcement (`before_subagent_spawn`)**:
   - Propagates boundary restrictions to spawned subagents (`task`, `scout`, `coder`).

4. **TUI Status Line Integration**:
   - Renders live mode status indicator directly in omp: `[DEV: FRONTEND]`, `[DEV: BACKEND]`, or `[DEV: BOTH]`.

5. **Diff & Pre-Commit Verification (`/devmode verify`)**:
   - Analyzes `git diff HEAD` using Jev to verify no forbidden boundary files were changed before committing.

6. **Interactive Overrides**:
   - `1. Block`: Stops the agent.
   - `2. Allow for this prompt only`: Pass expires as soon as the prompt finishes (`turn_end`).
   - `3. Allow for this session`: Pass stays valid for the active session.
   - `4. Switch mode to BOTH`: Unlocks all modifications.

7. **Persistent Classification Cache**:
   - Caches Jev judgments in `~/.omp/devmode-cache.json` for zero-latency repeat evaluations.

---

## Commands

- `/devmode` or `/devmode status` — Check current mode and Jev judge status.
- `/devmode frontend` — Switch to Frontend-only mode.
- `/devmode backend` — Switch to Backend-only mode.
- `/devmode both` — Allow all modifications.
- `/devmode verify` — Run git diff boundary check against the active mode using Jev.
- `/devmode setup` — Interactive configuration wizard.

---

## License

MIT
