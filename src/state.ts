import type { DevMode } from "./types.js";

class DevModeState {
  private activeMode: DevMode = "both";
  
  // Set of allowed paths for the current prompt turn only
  private promptAllowedPaths = new Set<string>();
  
  // Set of allowed paths for the entire session
  private sessionAllowedPaths = new Set<string>();

  // Full bypass flags
  private promptAllowedAll = false;
  private sessionAllowedAll = false;

  getMode(): DevMode {
    return this.activeMode;
  }

  setMode(mode: DevMode): void {
    this.activeMode = mode;
  }

  allowPrompt(filePath?: string): void {
    if (filePath) {
      this.promptAllowedPaths.add(this.normalize(filePath));
    } else {
      this.promptAllowedAll = true;
    }
  }

  allowSession(filePath?: string): void {
    if (filePath) {
      this.sessionAllowedPaths.add(this.normalize(filePath));
    } else {
      this.sessionAllowedAll = true;
    }
  }

  isAllowed(filePath: string): boolean {
    if (this.sessionAllowedAll || this.promptAllowedAll) {
      return true;
    }
    const norm = this.normalize(filePath);
    return this.sessionAllowedPaths.has(norm) || this.promptAllowedPaths.has(norm);
  }

  resetPromptOverrides(): void {
    this.promptAllowedPaths.clear();
    this.promptAllowedAll = false;
  }

  resetSession(): void {
    this.resetPromptOverrides();
    this.sessionAllowedPaths.clear();
    this.sessionAllowedAll = false;
  }

  private normalize(filePath: string): string {
    return filePath.replaceAll("\\", "/").toLowerCase();
  }
}

export const state = new DevModeState();
