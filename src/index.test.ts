import { describe, it } from "node:test";
import assert from "node:assert";
import { extractTargetPaths, extractPathsFromBash } from "./parser.js";
import { state } from "./state.js";
import { getDevModeSystemPrompt } from "./prompt.js";
import { decisiveScenario, matchingScenarios } from "./policy.js";
import type { PolicyScenario } from "./types.js";

describe("scenario policies", () => {
  const scenarios: PolicyScenario[] = [
    {
      id: "block-migrations",
      when: { event: "tool_call", tool: "bash", path: "**/migrations/*", mode: "frontend" },
      then: { action: "block", message: "Migration work is out of scope." },
      locked: true,
    },
    {
      id: "inject-frontend-guidance",
      when: { event: "before_agent_start", mode: "frontend", promptContains: "form" },
      then: { action: "inject_context", message: "Prefer existing form components." },
    },
  ];

  it("matches scoped event, mode, tool and glob path conditions", () => {
    const result = matchingScenarios(scenarios, {
      event: "tool_call",
      mode: "frontend",
      tool: "bash",
      path: "app/db/migrations/001.sql",
    });
    assert.deepStrictEqual(result.map(({ scenario }) => scenario.id), ["block-migrations"]);
  });

  it("matches prompt substring conditions and leaves nonmatching scenarios out", () => {
    const result = matchingScenarios(scenarios, {
      event: "before_agent_start",
      mode: "frontend",
      prompt: "Update the patient form",
    });
    assert.deepStrictEqual(result.map(({ scenario }) => scenario.id), ["inject-frontend-guidance"]);
  });

  it("gives a block precedence over ask and allow", () => {
    const matches = matchingScenarios([
      { id: "allow", when: { event: "tool_call" }, then: { action: "allow" } },
      { id: "ask", when: { event: "tool_call" }, then: { action: "ask" } },
      { id: "block", when: { event: "tool_call" }, then: { action: "block" } },
    ], { event: "tool_call", mode: "both" });
    assert.strictEqual(decisiveScenario(matches)?.scenario.id, "block");
  });
});


describe("extractTargetPaths", () => {
  it("extracts path from write tool", () => {
    const paths = extractTargetPaths("write", { path: "src/app.vue" });
    assert.deepStrictEqual(paths, ["src/app.vue"]);
  });

  it("extracts path from hashline edit tool", () => {
    const input = `
[src/controllers/UserController.php#A1B2]
PUT 10.=12:
+return true;
[views/user/index.php#3C4D]
PUT 5.=5:
+<h1>User</h1>
`;
    const paths = extractTargetPaths("edit", { input });
    assert.deepStrictEqual(paths, [
      "src/controllers/UserController.php",
      "views/user/index.php",
    ]);
  });

  it("extracts paths from shell bash commands", () => {
    const bash1 = "sed -i 's/foo/bar/g' code/core/controllers/TestController.php";
    const paths1 = extractPathsFromBash(bash1);
    assert.ok(paths1.includes("code/core/controllers/TestController.php"));

    const bash2 = "echo 'data' > src/output.json && rm -f old_server.py";
    const paths2 = extractPathsFromBash(bash2);
    assert.ok(paths2.includes("src/output.json"));
    assert.ok(paths2.includes("old_server.py"));
  });
});

describe("DevMode prompt guidance", () => {
  it("generates correct system prompts per mode", () => {
    const fePrompt = getDevModeSystemPrompt("frontend");
    assert.ok(fePrompt?.includes("FRONTEND mode"));
    assert.ok(fePrompt?.includes("MUST NOT modify server-side logic"));

    const bePrompt = getDevModeSystemPrompt("backend");
    assert.ok(bePrompt?.includes("BACKEND mode"));
    assert.ok(bePrompt?.includes("MUST NOT modify frontend UI views"));

    const bothPrompt = getDevModeSystemPrompt("both");
    assert.strictEqual(bothPrompt, undefined);
  });
});

describe("DevModeState overrides", () => {
  it("handles prompt and session scoped overrides", () => {
    state.setMode("frontend");
    state.resetSession();

    assert.strictEqual(state.isAllowed("src/server.go"), false);

    // Allow for prompt only
    state.allowPrompt("src/server.go");
    assert.strictEqual(state.isAllowed("src/server.go"), true);

    // End turn -> prompt reset
    state.resetPromptOverrides();
    assert.strictEqual(state.isAllowed("src/server.go"), false);

    // Allow for entire session
    state.allowSession("src/server.go");
    assert.strictEqual(state.isAllowed("src/server.go"), true);

    // End turn -> session override persists
    state.resetPromptOverrides();
    assert.strictEqual(state.isAllowed("src/server.go"), true);

    // Session reset
    state.resetSession();
    assert.strictEqual(state.isAllowed("src/server.go"), false);
  });
});
