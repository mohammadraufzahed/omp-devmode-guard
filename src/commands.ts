import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import { state } from "./state.js";
import { loadConfig, saveGlobalConfig, saveProjectConfig } from "./config.js";
import { checkGitDiffBoundaries } from "./diff-checker.js";
import { classifyFileWithJev } from "./classifier.js";
import { matchingScenarios } from "./policy.js";
import type { DevMode } from "./types.js";

export function registerDevModeCommands(pi: ExtensionAPI): void {
  pi.registerCommand("devmode", {
    description: "Configure modes and inspect scenario policies (/devmode status|explain|test|verify)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase();

      if (!sub || sub === "status") {
        const cfg = loadConfig(ctx.cwd);
        const keyStatus = cfg.openrouterApiKey ? "configured" : "not configured (run /devmode setup)";
        ctx.ui.notify(
          `DevMode Guard Status:\n- Active Mode: [${state.getMode().toUpperCase()}]\n- Jev Classifier (OpenRouter): ${keyStatus}\n- Scenarios: ${cfg.scenarios.length}`,
          "info",
        );
        return;
      }

      if (sub === "explain" || sub === "policy") {
        const scenarios = loadConfig(ctx.cwd).scenarios;
        const listing = scenarios.length
          ? scenarios.map((scenario) =>
            `• ${scenario.id}${scenario.locked ? " [global/locked]" : " [project]"}\n  when: ${JSON.stringify(scenario.when)}\n  then: ${scenario.then.action}${scenario.then.message ? ` — ${scenario.then.message}` : ""}`,
          ).join("\n")
          : "No scenarios configured.";
        ctx.ui.notify(`Policy scenarios (${scenarios.length}):\n${listing}\n\nGlobal: ~/.omp/agent/devmode.json\nProject: .omp/devmode.json`, "info");
        return;
      }

      if (sub === "test") {
        const filePath = args.trim().slice(sub.length).trim();
        if (!filePath) {
          ctx.ui.notify("Usage: /devmode test <file-path>", "warning");
          return;
        }
        const cfg = loadConfig(ctx.cwd);
        const category = await classifyFileWithJev(filePath, ctx, cfg);
        const mode = state.getMode();
        const matched = matchingScenarios(cfg.scenarios, {
          event: "tool_call", mode, tool: "edit", agent: ctx.agent?.name, category, path: filePath,
        });
        const explicitDecision = matched.find((item) => item.action === "block") ??
          matched.find((item) => item.action === "ask") ??
          matched.find((item) => item.action === "allow");
        const boundaryViolation = (category === "unknown" && mode !== "both") ||
          (mode === "frontend" && category === "backend") ||
          (mode === "backend" && category === "frontend");
        const result = explicitDecision?.action === "block" ? "BLOCK" :
          explicitDecision?.action === "ask" ? "ASK" :
          explicitDecision?.action === "allow" ? "ALLOW (scenario override)" :
          boundaryViolation ? "ASK/BLOCK (mode boundary)" : "ALLOW";
        const detail = matched.map(({ scenario, action }) => `${scenario.id}: ${action}`).join("\n");
        ctx.ui.notify(
          `Policy test: ${filePath}\nJev category: ${category}\nMode: ${mode}\nEffective result: ${result}\nMatching edit scenarios:\n${detail || "none"}`,
          result.startsWith("BLOCK") || result.startsWith("ASK") ? "warning" : "info",
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

  // Keep credentials global; only write the default mode to project config.
  saveGlobalConfig({ openrouterApiKey });
  saveProjectConfig(ctx.cwd, { mode: selectedMode });
  state.setMode(selectedMode);
  ctx.ui.setStatus("devmode", `[DEV: ${selectedMode.toUpperCase()}]`);

  ctx.ui.notify(
    `DevMode Guard configured successfully!\nActive Mode: [${selectedMode.toUpperCase()}]. Jev judge is active.`,
    "info"
  );
}
