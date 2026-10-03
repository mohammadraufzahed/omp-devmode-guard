export type DevMode = "frontend" | "backend" | "both";
export type FileCategory = "frontend" | "backend" | "shared" | "unknown";
export type PolicyEvent = "tool_call" | "before_agent_start" | "before_subagent_spawn" | "turn_end";
export type ScenarioAction = "allow" | "block" | "ask" | "inject_context" | "set_status" | "log";

export interface ScenarioWhen {
  event: PolicyEvent;
  mode?: DevMode | DevMode[];
  tool?: string | string[];
  agent?: string | string[];
  category?: FileCategory | FileCategory[];
  path?: string | string[];
  commandContains?: string;
  promptContains?: string;
}

export interface PolicyScenario {
  id: string;
  when: ScenarioWhen;
  then: {
    action: ScenarioAction;
    message?: string;
    choices?: Array<"block" | "allow_prompt" | "allow_session" | "both">;
  };
  /** Global policies default to locked and cannot be weakened by project config. */
  locked?: boolean;
}

export interface DevModeConfig {
  mode: DevMode;
  openrouterApiKey?: string;
  typesafeApiKey?: string;
  cacheTtlMs?: number;
  scenarios: PolicyScenario[];
}

export interface PolicyMatchContext {
  event: PolicyEvent;
  mode: DevMode;
  tool?: string;
  agent?: string;
  category?: FileCategory;
  path?: string;
  command?: string;
  prompt?: string;
}
