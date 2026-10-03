import { describe, it } from "node:test";
import assert from "node:assert";
import { extractTargetPaths, extractPathsFromBash } from "./parser.js";
import { state } from "./state.js";
import { getDevModeSystemPrompt } from "./prompt.js";

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
