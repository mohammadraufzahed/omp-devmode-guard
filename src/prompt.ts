import type { DevMode } from "./types.js";

export function getDevModeSystemPrompt(mode: DevMode): string | undefined {
  if (mode === "frontend") {
    return (
      "CRITICAL DEVELOPMENT MODE RESTRICTION: You are operating strictly in FRONTEND mode.\n" +
      "- You MUST NOT modify server-side logic, backend models, database migrations, controllers, services, or server configuration files.\n" +
      "- You are authorized to modify UI templates, HTML, client-side JS/TS, CSS/SCSS, client components, and frontend static assets.\n" +
      "- If backend API changes or data contracts are required, do NOT touch backend files. Instead, create mock data/stubs on the frontend or explain the required API contract to the user."
    );
  }

  if (mode === "backend") {
    return (
      "CRITICAL DEVELOPMENT MODE RESTRICTION: You are operating strictly in BACKEND mode.\n" +
      "- You MUST NOT modify frontend UI views, CSS, stylesheets, client JavaScript/TypeScript, or web assets.\n" +
      "- You are authorized to modify backend controllers, database models, migrations, server APIs, and backend business logic.\n" +
      "- If frontend rendering or UI consumption is needed, document the endpoint contracts instead of editing UI files."
    );
  }

  return undefined;
}
