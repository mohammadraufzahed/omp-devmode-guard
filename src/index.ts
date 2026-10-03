import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { state } from "./state.js";
import { loadConfig } from "./config.js";
import { classifyFileWithJev } from "./classifier.js";
import { extractTargetPaths } from "./parser.js";
import { registerDevModeCommands } from "./commands.js";
import { getDevModeSystemPrompt } from "./prompt.js";

export default function (pi: ExtensionAPI): void {
  pi.setLabel("DevMode Guard");

  // Register /devmode commands
  registerDevModeCommands(pi);

  // Initialize mode from project/global config on session start
  pi.on("session_start", async (_event, ctx) => {
    const cfg = loadConfig(ctx.cwd);
    state.setMode(cfg.mode);
    state.resetSession();

    if (ctx.hasUI) {
      ctx.ui.setStatus("devmode", `[DEV: ${cfg.mode.toUpperCase()}]`);
    }

    if (ctx.agent?.kind === "main") {
      ctx.ui.notify(`DevMode Guard active: [${cfg.mode.toUpperCase()}] mode`, "info");
    }
  });

  // Inject system prompt boundaries before prompt execution
  pi.on("before_agent_start", async (event) => {
    const currentMode = state.getMode();
    const restriction = getDevModeSystemPrompt(currentMode);
    if (restriction) {
      return {
        systemPrompt: [...event.systemPrompt, restriction],
      };
    }
  });

  // Propagate dev mode boundary into spawned subagents
  pi.on("before_subagent_spawn", async (event) => {
    const currentMode = state.getMode();
    if (currentMode !== "both") {
      return {
        note: `Enforcing [${currentMode.toUpperCase()}] mode constraints on subagent`,
      };
    }
  });

  // Reset prompt-scoped overrides at the end of each turn
  pi.on("turn_end", async () => {
    state.resetPromptOverrides();
  });

  // Clean up on session shutdown
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("devmode", "");
    }
    state.resetSession();
  });

  // Intercept tool calls (edit, write, and mutating bash commands)
  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    if (toolName !== "edit" && toolName !== "write" && toolName !== "bash") {
      return;
    }

    const currentMode = state.getMode();
    if (currentMode === "both") {
      return;
    }

    const input = (event.input ?? {}) as Record<string, unknown>;
    const targetPaths = extractTargetPaths(toolName, input);
    if (targetPaths.length === 0) {
      return;
    }

    const cfg = loadConfig(ctx.cwd);

    for (const filePath of targetPaths) {
      // Check if this path was already explicitly permitted
      if (state.isAllowed(filePath)) {
        continue;
      }

      // Classify file using Jev
      const category = await classifyFileWithJev(filePath, ctx, cfg);

      // SHARED files (configs, readme, etc.) are always safe to touch
      if (category === "shared") {
        continue;
      }

      const isViolation =
        (currentMode === "frontend" && category === "backend") ||
        (currentMode === "backend" && category === "frontend");

      if (!isViolation) {
        continue;
      }

      // If interactive UI is available, ask the user for permission
      if (ctx.hasUI) {
        const violationType = category.toUpperCase();
        const modeType = currentMode.toUpperCase();

        const choice = await ctx.ui.select(
          `DevMode Guard: Agent is attempting to modify a ${violationType} file/target in ${modeType} mode.\nTarget: ${filePath} (via ${toolName})\nWhat would you like to do?`,
          [
            "1. Block (Stop modification)",
            "2. Allow for this prompt only",
            "3. Allow for this session",
            "4. Switch mode to BOTH",
          ]
        );

        if (choice?.startsWith("2")) {
          state.allowPrompt(filePath);
          ctx.ui.notify(`Allowed ${filePath} for this prompt only.`, "info");
          continue;
        }

        if (choice?.startsWith("3")) {
          state.allowSession(filePath);
          ctx.ui.notify(`Allowed ${filePath} for this entire session.`, "info");
          continue;
        }

        if (choice?.startsWith("4")) {
          state.setMode("both");
          ctx.ui.setStatus("devmode", "[DEV: BOTH]");
          ctx.ui.notify("Switched development mode to BOTH.", "info");
          return;
        }

        // Default or choice 1 -> Block
        return {
          block: true,
          reason: `Blocked by DevMode Guard: Modifying ${category} file/target (${filePath}) is forbidden in ${currentMode} mode. Please create mock fixtures or adapt within the active mode.`,
        };
      }

      // Non-interactive fallback: strictly block
      return {
        block: true,
        reason: `Blocked by DevMode Guard: Modifying ${category} file/target (${filePath}) is forbidden in ${currentMode} mode. Please create mock fixtures or adapt within the active mode.`,
      };
    }
  });
}
