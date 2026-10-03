const SECTION_HEADER_REGEX = /^\[([^#\r\n\]]+)#/gm;

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
