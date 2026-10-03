import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import type { DevMode, DevModeConfig } from "./types.js";

const GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".omp", "devmode-guard.json");
const SUBAGENT_CONFIG_PATH = path.join(os.homedir(), ".omp", "subagent-router.json");
const PROJECT_CONFIG_FILE = ".omp-devmode.json";

export function loadConfig(cwd?: string): DevModeConfig {
  const result: DevModeConfig = {
    mode: "both",
    cacheTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  };

  // 1. Try reading subagent router config for openrouter key if present
  try {
    if (fs.existsSync(SUBAGENT_CONFIG_PATH)) {
      const data = fs.readFileSync(SUBAGENT_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed.openrouterApiKey) {
        result.openrouterApiKey = parsed.openrouterApiKey;
      }
      if (parsed.typesafeApiKey) {
        result.typesafeApiKey = parsed.typesafeApiKey;
      }
    }
  } catch {
    // ignore
  }

  // 2. Read global config
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const data = fs.readFileSync(GLOBAL_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(data);
      Object.assign(result, parsed);
    }
  } catch {
    // ignore
  }

  // 3. Read project-level config if cwd provided
  if (cwd) {
    try {
      const projPath = path.join(cwd, PROJECT_CONFIG_FILE);
      if (fs.existsSync(projPath)) {
        const data = fs.readFileSync(projPath, "utf-8");
        const parsed = JSON.parse(data);
        Object.assign(result, parsed);
      }
    } catch {
      // ignore
    }
  }

  // 4. Environment overrides
  if (process.env.OPENROUTER_API_KEY && !result.openrouterApiKey) {
    result.openrouterApiKey = process.env.OPENROUTER_API_KEY;
  }
  if (process.env.TYPESAFE_API_KEY && !result.typesafeApiKey) {
    result.typesafeApiKey = process.env.TYPESAFE_API_KEY;
  }

  return result;
}

export function saveGlobalConfig(cfg: Partial<DevModeConfig>): void {
  const dir = path.dirname(GLOBAL_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const current = loadConfig();
  const merged = { ...current, ...cfg };
  fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
}

export function saveProjectConfig(cwd: string, cfg: Partial<DevModeConfig>): void {
  const projPath = path.join(cwd, PROJECT_CONFIG_FILE);
  let current: Record<string, unknown> = {};
  if (fs.existsSync(projPath)) {
    try {
      current = JSON.parse(fs.readFileSync(projPath, "utf-8"));
    } catch {
      // ignore
    }
  }
  const merged = { ...current, ...cfg };
  fs.writeFileSync(projPath, JSON.stringify(merged, null, 2), "utf-8");
}
