import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { FileCategory } from "./types.js";

interface CacheEntry {
  category: FileCategory;
  timestamp: number;
}

const CACHE_FILE = path.join(os.homedir(), ".omp", "devmode-cache.json");
const memoryCache = new Map<string, CacheEntry>();

export function getCachedCategory(filePath: string, ttlMs: number = 86400000): FileCategory | undefined {
  const norm = path.normalize(filePath).toLowerCase();
  
  // 1. Check in-memory
  const mem = memoryCache.get(norm);
  if (mem) {
    if (Date.now() - mem.timestamp < ttlMs) {
      return mem.category;
    }
    memoryCache.delete(norm);
  }

  // 2. Check persistent disk cache
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      const diskEntry = data[norm];
      if (diskEntry && Date.now() - diskEntry.timestamp < ttlMs) {
        memoryCache.set(norm, diskEntry);
        return diskEntry.category;
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}

export function setCachedCategory(filePath: string, category: FileCategory): void {
  const norm = path.normalize(filePath).toLowerCase();
  const entry: CacheEntry = {
    category,
    timestamp: Date.now(),
  };

  memoryCache.set(norm, entry);

  try {
    let diskData: Record<string, CacheEntry> = {};
    if (fs.existsSync(CACHE_FILE)) {
      diskData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
    diskData[norm] = entry;

    // Prune entries older than 7 days
    const now = Date.now();
    for (const k of Object.keys(diskData)) {
      if (now - diskData[k].timestamp > 7 * 86400000) {
        delete diskData[k];
      }
    }

    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(diskData, null, 2), "utf-8");
  } catch {
    // ignore
  }
}
