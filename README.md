# omp-devmode-guard

An omp-only extension for development scopes and declarative scenario policies. Jev classifies files as frontend, backend, shared, or unknown; omp extension events enforce policies before tool execution where the event API permits it.

## Modes and commands

- `/devmode frontend` — allow frontend work, prompt/block backend and unclassified file edits.
- `/devmode backend` — allow backend work, prompt/block frontend and unclassified file edits.
- `/devmode both` — disable the built-in layer boundary restriction.
- `/devmode status` — show mode and loaded scenario count.
- `/devmode explain` — list effective scenarios and their conditions/actions.
- `/devmode test <path>` — classify a path and show matching edit scenarios.
- `/devmode verify` — inspect changed and untracked files against the current mode and scenario rules.
- `/devmode setup` — configure Jev/OpenRouter and initial mode.

When Jev returns `unknown` in a restricted mode, edits are treated as violations rather than silently allowed. Interactive omp sessions can approve an override for one prompt or the session; non-interactive sessions block.

## Policy files

Global policy: `~/.omp/agent/devmode.json` (respects `PI_CODING_AGENT_DIR` and `PI_CONFIG_DIR`). Project policy: `<repo>/.omp/devmode.json`. Both are JSON to avoid additional parser dependencies. The project file is suitable for version control; do not commit secrets.

Global scenarios load before project scenarios. A global scenario is locked: a project scenario with the same id cannot replace it. Project scenarios can add rules; a matching block dominates ask and allow. Project mode takes precedence over the global default mode. Only known events/actions are loaded; invalid rules are ignored.

Example project policy:

```json
{
  "mode": "frontend",
  "scenarios": [
    {
      "id": "protect-migrations",
      "when": {
        "event": "tool_call",
        "mode": "frontend",
        "tool": ["edit", "write", "bash"],
        "path": "**/migrations/*"
      },
      "then": {
        "action": "block",
        "message": "Database migration changes are outside this task."
      }
    },
    {
      "id": "review-schema-commands",
      "when": {
        "event": "tool_call",
        "tool": "bash",
        "commandContains": "schema"
      },
      "then": {
        "action": "ask",
        "choices": ["block", "allow_prompt"],
        "message": "This command may change a database schema."
      }
    },
    {
      "id": "form-guidance",
      "when": {
        "event": "before_agent_start",
        "mode": "frontend",
        "promptContains": "form"
      },
      "then": {
        "action": "inject_context",
        "message": "Prefer existing form components and do not change backend files."
      }
    },
    {
      "id": "review-coder-spawn",
      "when": {
        "event": "before_subagent_spawn",
        "agent": "coder"
      },
      "then": {
        "action": "ask",
        "message": "Allow this coder subagent?"
      }
    }
  ]
}
```

### Conditions

- `event`: `tool_call`, `before_agent_start`, `before_subagent_spawn`, `turn_end`.
- `mode`: one mode or an array.
- `tool`, `agent`, `category`: exact value or array of exact values.
- `path`: glob-like `*`/`?` pattern or array; matching is case-insensitive and `*` can match path separators.
- `commandContains`, `promptContains`: case-insensitive literal substring (not executable regex).

All supplied conditions must match. Omitted conditions do not constrain the match. A path/category condition does not match when that event has no path/classification.

### Actions

| Event | Supported actions |
|---|---|
| `tool_call` | `allow`, `block`, `ask`, `set_status`, `log` |
| `before_agent_start` | `inject_context`, `set_status`, `log` |
| `before_subagent_spawn` | `block`, `ask`, `log` |
| `turn_end` | `set_status`, `log` |

`ask` on tool calls can use `choices`: `block`, `allow_prompt`, `allow_session`, `both`. Without `choices`, all are offered. For subagent spawn asks, omp asks whether to block or allow that spawn. `inject_context`, agent notes, and status indicators guide the agent; only pre-execution `tool_call` checks block tool actions.

## Classification and credentials

Jev uses OpenRouter `~typesafe/jev-latest`, then the configured TypeSafe endpoint or omp's ephemeral in-session judge. Existing `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY`, and the legacy subagent-router key are recognized. Classification results are cached locally under `~/.omp/devmode-cache.json`.

## Enforcement limits

The extension checks omp `tool_call` events for `edit`, `write`, and `bash`; this is not an OS sandbox. Bash path extraction recognizes common mutation forms, but shell constructs, scripts, generated code, external programs, or alternate write tools can evade target extraction. Use scenario `commandContains` rules to guard known commands, and treat `/devmode verify` as a review aid, not a security boundary. `before_subagent_spawn` notes are advisory; tool-call guards remain the enforcement point.

## Install

The package manifest declares `omp.extensions`. Build with `npm install && npm run build`, then configure the package directory or entry module in omp. The extension is written for omp APIs only.
