import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import type { DevMode, DevModeConfig, PolicyScenario } from "./types.js";

const LEGACY_GLOBAL_CONFIG = path.join(os.homedir(), ".omp", "devmode-guard.json");
const LEGACY_SUBAGENT_CONFIG = path.join(os.homedir(), ".omp", "subagent-router.json");
const PROJECT_CONFIG = path.join(".omp", "devmode.json");
const DEFAULT_CONFIG: DevModeConfig = { mode: "both", cacheTtlMs: 86_400_000, scenarios: [] };

function agentConfigDir(): string {
  return process.env.PI_CODING_AGENT_DIR ??
    path.join(process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".omp"), "agent");
}

function readJson(filePath: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function validMode(value: unknown): value is DevMode {
  return value === "frontend" || value === "backend" || value === "both";
}

function isStringSelector(value: unknown): boolean {
  return value === undefined || typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function scenariosFrom(value: unknown, locked: boolean): PolicyScenario[] {
  if (!Array.isArray(value)) return [];
  const validActions: Record<string, Set<string>> = {
    tool_call: new Set(["allow", "block", "ask", "set_status", "log"]),
    before_agent_start: new Set(["inject_context", "set_status", "log"]),
    before_subagent_spawn: new Set(["block", "ask", "log"]),
    turn_end: new Set(["set_status", "log"]),
  };
  const validChoices = new Set(["block", "allow_prompt", "allow_session", "both"]);
  return value.flatMap((item): PolicyScenario[] => {
    if (!item || typeof item !== "object") return [];
    const scenario = item as Partial<PolicyScenario>;
    const when = scenario.when;
    const event = when?.event;
    const action = scenario.then?.action;
    const selectors = when &&
      isStringSelector(when.mode) && isStringSelector(when.tool) &&
      isStringSelector(when.agent) && isStringSelector(when.category) &&
      isStringSelector(when.path) && isStringSelector(when.commandContains) &&
      isStringSelector(when.promptContains);
    if (typeof scenario.id !== "string" || !scenario.id ||
        typeof event !== "string" || !validActions[event]?.has(action ?? "") ||
        !selectors || (scenario.then?.message !== undefined && typeof scenario.then.message !== "string")) {
      return [];
    }
    const choices = scenario.then?.choices;
    if (choices && (!Array.isArray(choices) || !choices.every((choice) => validChoices.has(choice)))) return [];
    if (when.mode && ![...(Array.isArray(when.mode) ? when.mode : [when.mode])].every((mode) =>
      mode === "frontend" || mode === "backend" || mode === "both")) return [];
    if (when.category && ![...(Array.isArray(when.category) ? when.category : [when.category])].every((category) =>
      category === "frontend" || category === "backend" || category === "shared" || category === "unknown")) return [];
    return [{ ...scenario as PolicyScenario, locked: locked || scenario.locked === true }];
  });
}

export function loadConfig(cwd?: string): DevModeConfig {
  const globalData = readJson(path.join(agentConfigDir(), "devmode.json")) ??
    readJson(LEGACY_GLOBAL_CONFIG) ?? {};
  const subagentData = readJson(LEGACY_SUBAGENT_CONFIG);
  const projectData = cwd ? readJson(path.join(cwd, PROJECT_CONFIG)) : undefined;
  const globalScenarios = scenariosFrom(globalData.scenarios, true);
  const projectScenarios = scenariosFrom(projectData?.scenarios, false);
  const scenariosById = new Map<string, PolicyScenario>();
  for (const scenario of [...globalScenarios, ...projectScenarios]) {
    const existing = scenariosById.get(scenario.id);
    if (!existing || !existing.locked) scenariosById.set(scenario.id, scenario);
  }

  const result: DevModeConfig = {
    ...DEFAULT_CONFIG,
    ...(typeof globalData.mode === "string" && validMode(globalData.mode) ? { mode: globalData.mode } : {}),
    ...(typeof globalData.cacheTtlMs === "number" ? { cacheTtlMs: globalData.cacheTtlMs } : {}),
    ...(typeof globalData.openrouterApiKey === "string" ? { openrouterApiKey: globalData.openrouterApiKey } : {}),
    ...(typeof subagentData?.openrouterApiKey === "string" ? { openrouterApiKey: subagentData.openrouterApiKey } : {}),
    ...(typeof subagentData?.typesafeApiKey === "string" ? { typesafeApiKey: subagentData.typesafeApiKey } : {}),
    ...(projectData && validMode(projectData.mode) ? { mode: projectData.mode } : {}),
    ...(projectData && typeof projectData.openrouterApiKey === "string"
      ? { openrouterApiKey: projectData.openrouterApiKey }
      : {}),
    ...(process.env.OPENROUTER_API_KEY ? { openrouterApiKey: process.env.OPENROUTER_API_KEY } : {}),
    ...(process.env.TYPESAFE_API_KEY ? { typesafeApiKey: process.env.TYPESAFE_API_KEY } : {}),
    scenarios: [...scenariosById.values()],
  };
  return result;
}

export function saveGlobalConfig(cfg: Partial<DevModeConfig>): void {
  const filePath = path.join(agentConfigDir(), "devmode.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const current = readJson(filePath) ?? {};
  fs.writeFileSync(filePath, JSON.stringify({ ...current, ...cfg }, null, 2), "utf8");
}

export function saveProjectConfig(cwd: string, cfg: Partial<DevModeConfig>): void {
  const filePath = path.join(cwd, PROJECT_CONFIG);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const current = readJson(filePath) ?? {};
  fs.writeFileSync(filePath, JSON.stringify({ ...current, ...cfg }, null, 2), "utf8");
}
