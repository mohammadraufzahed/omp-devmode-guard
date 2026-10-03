import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { state } from "./state.js";
import { loadConfig, saveGlobalConfig, saveProjectConfig } from "./config.js";
import { checkGitDiffBoundaries } from "./diff-checker.js";
import type { DevMode } from "./types.js";

export function registerDevModeCommands(pi: ExtensionAPI): void {
  pi.registerCommand("devmode", {
    description: "Manage development mode guard (frontend, backend, both) with Jev boundary detection (/devmode [status|frontend|backend|both|verify|setup])",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase();

      if (!sub || sub === "status") {
        const currentMode = state.getMode();
        const cfg = loadConfig(ctx.cwd);
        const keyStatus = cfg.openrouterApiKey
          ? `configured (${cfg.openrouterApiKey.slice(0, 10)}...)`
          : "not configured (run /devmode setup)";

        ctx.ui.notify(
          `DevMode Guard Status:\n- Active Mode: [${currentMode.toUpperCase()}]\n- Jev Classifier (OpenRouter): ${keyStatus}`,
          "info"
        );
        return;
      }

      if (sub === "frontend" || sub === "backend" || sub === "both") {
        const mode = sub as DevMode;
        state.setMode(mode);
        saveProjectConfig(ctx.cwd, { mode });
        ctx.ui.setStatus("devmode", `[DEV: ${mode.toUpperCase()}]`);
        ctx.ui.notify(`Development mode set to: [${mode.toUpperCase()}]`, "info");
        return;
      }

      if (sub === "verify" || sub === "diff") {
        const mode = state.getMode();
        if (mode === "both") {
          ctx.ui.notify("Active mode is BOTH. All modified files are permitted.", "info");
          return;
        }

        ctx.ui.notify(`Checking git diff against ${mode.toUpperCase()} boundary with Jev judge...`, "info");
        const cfg = loadConfig(ctx.cwd);
        const result = await checkGitDiffBoundaries(ctx.cwd, mode, ctx, cfg);

        if (result.passed) {
          ctx.ui.notify(`Boundary check PASSED: All ${result.totalModified} modified files respect ${mode.toUpperCase()} mode.`, "info");
        } else {
          const list = result.violations.map((v) => `• ${v.file} (${v.category.toUpperCase()})`).join("\n");
          ctx.ui.notify(`Boundary check FAILED! Found violations:\n${list}`, "error");
        }
        return;
      }

      if (sub === "setup") {
        await runSetupWizard(ctx);
        return;
      }

      ctx.ui.notify("Usage: /devmode [status | frontend | backend | both | verify | setup]", "warning");
    },
  });
}

async function runSetupWizard(ctx: ExtensionCommandContext): Promise<void> {
  const current = loadConfig(ctx.cwd);

  ctx.ui.notify("Starting DevMode Guard Setup...", "info");

  // 1. OpenRouter API Token
  const orPrompt = current.openrouterApiKey
    ? `Enter OpenRouter API Key [Press Enter to keep existing ${current.openrouterApiKey.slice(0, 8)}...]:`
    : "Enter OpenRouter API Key for Jev Judge (sk-or-...):";

  const enteredOrKey = await ctx.ui.input(orPrompt);
  const openrouterApiKey = enteredOrKey && enteredOrKey.trim().length > 0
    ? enteredOrKey.trim()
    : current.openrouterApiKey;

  // 2. Select initial dev mode
  const modeChoice = await ctx.ui.select(
    "Select default development mode:",
    ["both (allow all modifications)", "frontend (block backend edits)", "backend (block frontend edits)"]
  );

  let selectedMode: DevMode = "both";
  if (modeChoice?.includes("frontend")) {
    selectedMode = "frontend";
  } else if (modeChoice?.includes("backend")) {
    selectedMode = "backend";
  }

  // Save globally and in project
  saveGlobalConfig({ openrouterApiKey });
  saveProjectConfig(ctx.cwd, { mode: selectedMode, openrouterApiKey });
  state.setMode(selectedMode);
  ctx.ui.setStatus("devmode", `[DEV: ${selectedMode.toUpperCase()}]`);

  ctx.ui.notify(
    `DevMode Guard configured successfully!\nActive Mode: [${selectedMode.toUpperCase()}]. Jev judge is active.`,
    "info"
  );
}
