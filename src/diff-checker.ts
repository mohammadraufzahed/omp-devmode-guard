import * as child_process from "node:child_process";
import * as util from "node:util";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { DevMode, DevModeConfig } from "./types.js";
import { classifyFileWithJev } from "./classifier.js";

const exec = util.promisify(child_process.exec);

export interface DiffCheckResult {
  passed: boolean;
  violations: Array<{
    file: string;
    category: string;
  }>;
  totalModified: number;
}

export async function checkGitDiffBoundaries(
  cwd: string,
  mode: DevMode,
  ctx: ExtensionContext,
  config: DevModeConfig
): Promise<DiffCheckResult> {
  if (mode === "both") {
    return { passed: true, violations: [], totalModified: 0 };
  }

  try {
    // Get modified, staged and untracked files from git
    const { stdout: diffFiles } = await exec("git diff --name-only HEAD", { cwd });
    const { stdout: untrackedFiles } = await exec("git ls-files --others --exclude-standard", { cwd });

    const allFiles = [
      ...diffFiles.split("\n"),
      ...untrackedFiles.split("\n"),
    ]
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const uniqueFiles = Array.from(new Set(allFiles));
    const violations: Array<{ file: string; category: string }> = [];

    for (const file of uniqueFiles) {
      const category = await classifyFileWithJev(file, ctx, config);
      if (category === "shared") {
        continue;
      }

      if (mode === "frontend" && category === "backend") {
        violations.push({ file, category });
      } else if (mode === "backend" && category === "frontend") {
        violations.push({ file, category });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      totalModified: uniqueFiles.length,
    };
  } catch (err) {
    return {
      passed: false,
      violations: [{ file: `git command failed: ${String(err)}`, category: "error" }],
      totalModified: 0,
    };
  }
}
