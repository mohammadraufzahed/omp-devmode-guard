import { describe, it } from "node:test";
import assert from "node:assert";
import { extractTargetPaths } from "./parser.js";
import { state } from "./state.js";

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
