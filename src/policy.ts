import type { PolicyMatchContext, PolicyScenario, ScenarioAction } from "./types.js";

function values(value: string | string[] | undefined): string[] | undefined {
  return value === undefined ? undefined : Array.isArray(value) ? value : [value];
}

function matchesValue(expected: string | string[] | undefined, actual: string | undefined): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  return (values(expected) ?? []).some((item) => item.toLowerCase() === actual.toLowerCase());
}

function matchesGlob(pattern: string, value: string): boolean {
  const normalizedPattern = pattern.replaceAll("\\", "/").toLowerCase();
  const normalizedValue = value.replaceAll("\\", "/").toLowerCase();
  let p = 0;
  let v = 0;
  let star = -1;
  let retry = -1;
  while (v < normalizedValue.length) {
    if (p < normalizedPattern.length && (normalizedPattern[p] === "?" || normalizedPattern[p] === normalizedValue[v])) {
      p++;
      v++;
    } else if (p < normalizedPattern.length && normalizedPattern[p] === "*") {
      star = p++;
      retry = v;
    } else if (star >= 0) {
      p = star + 1;
      v = ++retry;
    } else {
      return false;
    }
  }
  while (normalizedPattern[p] === "*") p++;
  return p === normalizedPattern.length;
}

function matchesPatterns(expected: string | string[] | undefined, actual: string | undefined): boolean {
  if (expected === undefined) return true;
  if (actual === undefined) return false;
  return (values(expected) ?? []).some((pattern) => matchesGlob(pattern, actual));
}

function includesText(expected: string | undefined, actual: string | undefined): boolean {
  if (expected === undefined) return true;
  return actual !== undefined && actual.toLowerCase().includes(expected.toLowerCase());
}

export function scenarioMatches(scenario: PolicyScenario, context: PolicyMatchContext): boolean {
  const when = scenario.when;
  return when.event === context.event &&
    matchesValue(when.mode, context.mode) &&
    matchesValue(when.tool, context.tool) &&
    matchesValue(when.agent, context.agent) &&
    matchesValue(when.category, context.category) &&
    matchesPatterns(when.path, context.path) &&
    includesText(when.commandContains, context.command) &&
    includesText(when.promptContains, context.prompt);
}

export interface EvaluatedScenario {
  scenario: PolicyScenario;
  action: ScenarioAction;
}

export function matchingScenarios(
  scenarios: PolicyScenario[],
  context: PolicyMatchContext,
): EvaluatedScenario[] {
  return scenarios.filter((scenario) => scenarioMatches(scenario, context))
    .map((scenario) => ({ scenario, action: scenario.then.action }));
}

/** Block dominates ask; otherwise preserve declaration order. */
export function decisiveScenario(matches: EvaluatedScenario[]): EvaluatedScenario | undefined {
  return matches.find((match) => match.action === "block") ??
    matches.find((match) => match.action === "ask") ??
    matches[0];
}
