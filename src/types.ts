export type DevMode = "frontend" | "backend" | "both";
export type FileCategory = "frontend" | "backend" | "shared" | "unknown";

export interface DevModeConfig {
  mode: DevMode;
  openrouterApiKey?: string;
  typesafeApiKey?: string;
  cacheTtlMs?: number;
}
