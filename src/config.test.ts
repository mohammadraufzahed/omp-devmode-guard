import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "./config.js";

const temporaryRoots: string[] = [];
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
after(() => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
});

function createRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omp-devmode-policy-"));
  temporaryRoots.push(root);
  return root;
}

describe("policy configuration precedence", () => {
  it("keeps global scenarios locked while merging project scenarios and mode", () => {
    const globalRoot = createRoot();
    const projectRoot = createRoot();
    process.env.PI_CODING_AGENT_DIR = globalRoot;
    fs.mkdirSync(path.join(projectRoot, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(globalRoot, "devmode.json"), JSON.stringify({
      mode: "frontend",
      scenarios: [{
        id: "protected",
        when: { event: "tool_call", tool: "write" },
        then: { action: "block", message: "global block" },
      }],
    }));
    fs.writeFileSync(path.join(projectRoot, ".omp", "devmode.json"), JSON.stringify({
      mode: "backend",
      scenarios: [
        { id: "protected", when: { event: "tool_call" }, then: { action: "allow" } },
        { id: "project-rule", when: { event: "tool_call" }, then: { action: "ask" } },
      ],
    }));

    const config = loadConfig(projectRoot);
    assert.equal(config.mode, "backend");
    assert.deepEqual(config.scenarios.map((scenario) => scenario.id), ["protected", "project-rule"]);
    assert.equal(config.scenarios[0]?.then.action, "block");
    assert.equal(config.scenarios[0]?.locked, true);
  });

  it("ignores unsupported event/action combinations", () => {
    const globalRoot = createRoot();
    const projectRoot = createRoot();
    process.env.PI_CODING_AGENT_DIR = globalRoot;
    fs.mkdirSync(path.join(projectRoot, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".omp", "devmode.json"), JSON.stringify({
      scenarios: [
        { id: "bad", when: { event: "tool_call" }, then: { action: "inject_context" } },
        { id: "good", when: { event: "before_agent_start" }, then: { action: "inject_context", message: "Stay scoped." } },
      ],
    }));

    assert.deepEqual(loadConfig(projectRoot).scenarios.map((scenario) => scenario.id), ["good"]);
  });
});
