import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { DevModeConfig, FileCategory } from "./types.js";
import { getCachedCategory, setCachedCategory } from "./cache.js";

const JEV_CLASSIFY_SYSTEM_PROMPT =
  "You are Jev, a specialized System One code-boundary judge. " +
  "Classify the given file path into exactly one category: FRONTEND, BACKEND, or SHARED.\n" +
  "Criteria:\n" +
  "- FRONTEND: UI views, client templates, styles (CSS/SCSS), browser JS/TS, client components, DOM, client assets, images, icons, frontend routing.\n" +
  "- BACKEND: Server logic, APIs, database models/migrations, controllers, services, backend config, CLI commands, server PHP/Python/Go/Java/Node server.\n" +
  "- SHARED: Root configs (.gitignore, package.json, tsconfig, README, documentation, dev tooling config, repo licenses).\n\n" +
  "Respond strictly with ONE single word: FRONTEND, BACKEND, or SHARED.";

async function judgeViaOpenRouter(
  filePath: string,
  apiKey: string
): Promise<FileCategory | undefined> {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const body = {
    model: "~typesafe/jev-latest",
    messages: [
      { role: "system", content: JEV_CLASSIFY_SYSTEM_PROMPT },
      { role: "user", content: `File: ${filePath}` },
    ],
    max_tokens: 10,
    temperature: 0,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/mohammadraufzahed/omp-devmode-guard",
      "X-Title": "omp-devmode-guard",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return undefined;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content?.trim().toUpperCase() ?? "";
  if (text.includes("FRONTEND")) return "frontend";
  if (text.includes("BACKEND")) return "backend";
  if (text.includes("SHARED")) return "shared";
  return undefined;
}

async function judgeViaTypeSafe(
  filePath: string,
  apiKey: string
): Promise<FileCategory | undefined> {
  const url = "https://api.typesafe.ai/v1/systemone";
  const body = {
    system: JEV_CLASSIFY_SYSTEM_PROMPT,
    prompt: `File: ${filePath}`,
    max_tokens: 10,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return undefined;
  }

  const json = (await res.json()) as { answer?: string; text?: string };
  const text = (json.answer ?? json.text ?? "").trim().toUpperCase();
  if (text.includes("FRONTEND")) return "frontend";
  if (text.includes("BACKEND")) return "backend";
  if (text.includes("SHARED")) return "shared";
  return undefined;
}

export async function classifyFileWithJev(
  filePath: string,
  ctx: ExtensionContext,
  config: DevModeConfig
): Promise<FileCategory> {
  // 1. Check cache first
  const cached = getCachedCategory(filePath, config.cacheTtlMs);
  if (cached) {
    return cached;
  }

  // 2. OpenRouter with Jev (~typesafe/jev-latest)
  const orKey = config.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const decision = await judgeViaOpenRouter(filePath, orKey);
      if (decision) {
        setCachedCategory(filePath, decision);
        return decision;
      }
    } catch {
      // Fall through to other Jev channels
    }
  }

  // 3. TypeSafe direct Jev
  const tsKey = config.typesafeApiKey || process.env.TYPESAFE_API_KEY;
  if (tsKey) {
    try {
      const decision = await judgeViaTypeSafe(filePath, tsKey);
      if (decision) {
        setCachedCategory(filePath, decision);
        return decision;
      }
    } catch {
      // Fall through to in-session ephemeral turn
    }
  }

  // 4. In-session judge using runEphemeralTurn if available
  if (ctx.runEphemeralTurn) {
    try {
      const res = await ctx.runEphemeralTurn({
        promptText: `${JEV_CLASSIFY_SYSTEM_PROMPT}\n\nFile: ${filePath}`,
        tools: false,
        maxTokens: 10,
      });

      const reply = (res?.replyText ?? "").trim().toUpperCase();
      let category: FileCategory | undefined;
      if (reply.includes("FRONTEND")) category = "frontend";
      else if (reply.includes("BACKEND")) category = "backend";
      else if (reply.includes("SHARED")) category = "shared";

      if (category) {
        setCachedCategory(filePath, category);
        return category;
      }
    } catch {
      // Ephemeral turn unavailable or failed
    }
  }

  return "unknown";
}
