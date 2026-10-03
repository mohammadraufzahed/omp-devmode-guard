import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { state } from "./state.js";
import { loadConfig, saveGlobalConfig, saveProjectConfig } from "./config.js";
import type { DevMode } from "./types.js";

export function registerDevModeCommands(pi: ExtensionAPI): void {
  pi.registerCommand("devmode", {
    description: "Manage development mode guard (frontend, backend, both) with Jev boundary detection (/devmode [status|frontend|backend|both|setup])",
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
        ctx.ui.notify(`Development mode set to: [${mode.toUpperCase()}]`, "info");
        return;
      }

      if (sub === "setup") {
        await runSetupWizard(ctx);
        return;
      }

      ctx.ui.notify("Usage: /devmode [status | frontend | backend | both | setup]", "warning");
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

  ctx.ui.notify(
    `DevMode Guard configured successfully!\nActive Mode: [${selectedMode.toUpperCase()}]. Jev judge is active.`,
    "info"
  );
}
