const SECTION_HEADER_REGEX = /^\[([^#\r\n\]]+)#/gm;

// Extract candidate paths affected by a shell command
export function extractPathsFromBash(command: string): string[] {
  const paths: string[] = [];
  
  // 1. Redirection operators (> >> 2> | tee)
  const redirectMatches = command.matchAll(/(?:>|>>|tee\s+(?:-a\s+)?)\s*([^\s;&|]+)/g);
  for (const m of redirectMatches) {
    if (m[1] && !m[1].startsWith("-") && m[1] !== "/dev/null") {
      paths.push(m[1].replace(/['"]/g, ""));
    }
  }

  // 2. Common mutating commands: sed, rm, mv, cp, touch, git checkout/restore
  const cmdMatches = command.matchAll(
    /\b(?:rm|mv|cp|touch|truncate|sed\s+-i[^\s]*|git\s+(?:checkout|restore))\s+([^\s;&|]+(?:\s+[^\s;&|]+)*)/g
  );
  for (const m of cmdMatches) {
    if (m[1]) {
      const args = m[1].split(/\s+/);
      for (const arg of args) {
        if (!arg.startsWith("-") && arg !== "/dev/null" && arg !== "HEAD") {
          paths.push(arg.replace(/['"]/g, ""));
        }
      }
    }
  }

  return paths;
}

export function extractTargetPaths(toolName: string, input: Record<string, unknown>): string[] {
  const paths: string[] = [];

  if (toolName === "write") {
    if (typeof input.path === "string" && input.path.trim()) {
      paths.push(input.path.trim());
    }
  } else if (toolName === "edit") {
    // 1. Direct path property (if sloppy/replace/patch modes or normalized)
    if (typeof input.path === "string" && input.path.trim()) {
      paths.push(input.path.trim());
    }

    // 2. paths array if present
    if (Array.isArray(input.paths)) {
      for (const p of input.paths) {
        if (typeof p === "string" && p.trim()) {
          paths.push(p.trim());
        }
      }
    }

    // 3. hashline [PATH#TAG] parser
    if (typeof input.input === "string") {
      let match: RegExpExecArray | null;
      while ((match = SECTION_HEADER_REGEX.exec(input.input)) !== null) {
        const p = match[1]?.trim();
        if (p) {
          paths.push(p);
        }
      }
    }
  } else if (toolName === "bash") {
    if (typeof input.command === "string") {
      paths.push(...extractPathsFromBash(input.command));
    }
  }

  // Deduplicate preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of paths) {
    if (!seen.has(p)) {
      seen.add(p);
      result.push(p);
    }
  }

  return result;
}
