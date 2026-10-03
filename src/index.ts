import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { state } from "./state.js";
import { loadConfig } from "./config.js";
import { classifyFileWithJev } from "./classifier.js";
import { extractTargetPaths } from "./parser.js";
import { registerDevModeCommands } from "./commands.js";
import { getDevModeSystemPrompt } from "./prompt.js";
import { decisiveScenario, matchingScenarios } from "./policy.js";

export default function (pi: ExtensionAPI): void {
  pi.setLabel("DevMode Guard");
  registerDevModeCommands(pi);

  pi.on("session_start", async (_event, ctx) => {
    const cfg = loadConfig(ctx.cwd);
    state.setMode(cfg.mode);
    state.resetSession();
    if (ctx.hasUI) ctx.ui.setStatus("devmode", `[DEV: ${cfg.mode.toUpperCase()}]`);
    if (ctx.agent?.kind === "main") {
      ctx.ui.notify(`DevMode Guard active: [${cfg.mode.toUpperCase()}] mode; ${cfg.scenarios.length} scenarios loaded`, "info");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const mode = state.getMode();
    const cfg = loadConfig(ctx.cwd);
    const injected: string[] = [];
    for (const match of matchingScenarios(cfg.scenarios, {
      event: "before_agent_start",
      mode,
      agent: ctx.agent?.name,
      prompt: event.prompt,
    })) {
      const { scenario, action } = match;
      if (action === "inject_context" && scenario.then.message) injected.push(scenario.then.message);
      if (action === "set_status") ctx.ui.setStatus("devmode", scenario.then.message ?? `[DEV: ${mode.toUpperCase()}]`);
      if (action === "log") pi.logger.info(`[devmode:${scenario.id}] ${scenario.then.message ?? "scenario matched"}`);
    }
    const restriction = getDevModeSystemPrompt(mode);
    const additions = [...(restriction ? [restriction] : []), ...injected];
    if (additions.length > 0) return { systemPrompt: [...event.systemPrompt, ...additions] };
  });

  pi.on("before_subagent_spawn", async (event, ctx) => {
    const mode = state.getMode();
    const cfg = loadConfig(ctx.cwd);
    const match = decisiveScenario(matchingScenarios(cfg.scenarios, {
      event: "before_subagent_spawn",
      mode,
      agent: event.agent,
    }));
    if (match?.action === "block") {
      return { block: true, reason: match.scenario.then.message ?? `Blocked by scenario "${match.scenario.id}".` };
    }
    if (match?.action === "ask") {
      if (!ctx.hasUI) {
        return { block: true, reason: match.scenario.then.message ?? `Scenario "${match.scenario.id}" requires approval, but no UI is available.` };
      }
      const decision = await ctx.ui.select(
        match.scenario.then.message ?? `Scenario "${match.scenario.id}" matched subagent ${event.agent}.`,
        ["Block subagent", "Allow this subagent"],
      );
      if (decision !== "Allow this subagent") {
        return { block: true, reason: `Subagent blocked by scenario "${match.scenario.id}".` };
      }
    }
    if (mode !== "both" || match) {
      return { note: `DevMode ${mode.toUpperCase()} guard active${match ? `; scenario ${match.scenario.id}` : ""}. Tool-call policies remain enforced.` };
    }
  });

  pi.on("turn_end", async (_event, ctx) => {
    for (const match of matchingScenarios(loadConfig(ctx.cwd).scenarios, {
      event: "turn_end",
      mode: state.getMode(),
      agent: ctx.agent?.name,
    })) {
      if (match.action === "log") pi.logger.info(`[devmode:${match.scenario.id}] ${match.scenario.then.message ?? "scenario matched"}`);
      if (match.action === "set_status") ctx.ui.setStatus("devmode", match.scenario.then.message ?? `[DEV: ${state.getMode().toUpperCase()}]`);
    }
    state.resetPromptOverrides();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus("devmode", "");
    state.resetSession();
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write" && event.toolName !== "bash") return;
    const mode = state.getMode();
    const cfg = loadConfig(ctx.cwd);
    const input = (event.input ?? {}) as Record<string, unknown>;
    const command = typeof input.command === "string" ? input.command : undefined;
    const targetPaths = extractTargetPaths(event.toolName, input);
    const targets = targetPaths.length > 0 ? targetPaths : [undefined];

    for (const filePath of targets) {
      if (filePath && state.isAllowed(filePath)) continue;
      const category = filePath ? await classifyFileWithJev(filePath, ctx, cfg) : undefined;
      const match = decisiveScenario(matchingScenarios(cfg.scenarios, {
        event: "tool_call",
        mode,
        tool: event.toolName,
        agent: ctx.agent?.name,
        category,
        path: filePath,
        command,
      }));
      if (match?.action === "block") {
        return { block: true, reason: match.scenario.then.message ?? `Blocked by scenario "${match.scenario.id}"${filePath ? ` for ${filePath}` : ""}.` };
      }
      if (match?.action === "ask") {
        if (!ctx.hasUI) {
          return { block: true, reason: match.scenario.then.message ?? `Scenario "${match.scenario.id}" requires approval, but no interactive UI is available.` };
        }
        const choices = match.scenario.then.choices ?? ["block", "allow_prompt", "allow_session", "both"];
        const labels = choices.map((choice) => ({
          block: "Block",
          allow_prompt: "Allow for this prompt",
          allow_session: "Allow for this session",
          both: "Switch mode to BOTH",
        })[choice]);
        const selected = await ctx.ui.select(
          match.scenario.then.message ?? `Scenario "${match.scenario.id}" matched${filePath ? `: ${filePath}` : ""}.`,
          labels,
        );
        const selectionIndex = typeof selected === "string" ? labels.indexOf(selected) : -1;
        const choice = choices[selectionIndex];
        if (choice === "allow_prompt" && filePath) state.allowPrompt(filePath);
        else if (choice === "allow_session" && filePath) state.allowSession(filePath);
        else if (choice === "both") {
          state.setMode("both");
          ctx.ui.setStatus("devmode", "[DEV: BOTH]");
          return;
        } else {
          return { block: true, reason: `Blocked by scenario "${match.scenario.id}".` };
        }
        continue;
      }
      if (match?.action === "allow") continue;
      if (match?.action === "log") pi.logger.info(`[devmode:${match.scenario.id}] ${match.scenario.then.message ?? "scenario matched"}`);
      if (match?.action === "set_status") ctx.ui.setStatus("devmode", match.scenario.then.message ?? `[DEV: ${mode.toUpperCase()}]`);

      const violation = (category === "unknown" && mode !== "both") ||
        (mode === "frontend" && category === "backend") ||
        (mode === "backend" && category === "frontend");
      if (!violation) continue;
      if (!ctx.hasUI) {
        return { block: true, reason: `Blocked by DevMode Guard: ${category} target ${filePath} is forbidden in ${mode} mode.` };
      }
      const choice = await ctx.ui.select(
        `DevMode Guard: ${category} target in ${mode} mode.\n${filePath}\nChoose an override:`,
        ["Block", "Allow for this prompt", "Allow for this session", "Switch mode to BOTH"],
      );
      if (choice === "Allow for this prompt") state.allowPrompt(filePath);
      else if (choice === "Allow for this session") state.allowSession(filePath);
      else if (choice === "Switch mode to BOTH") {
        state.setMode("both");
        ctx.ui.setStatus("devmode", "[DEV: BOTH]");
        return;
      } else {
        return { block: true, reason: `Blocked by DevMode Guard: ${category} target ${filePath} is forbidden in ${mode} mode.` };
      }
    }
  });
}
