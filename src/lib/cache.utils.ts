import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createXdgPaths } from '@finografic/cli-kit/xdg';

/** Subfolder under `~/.config/finografic/` for hashed per-request cache JSON files. */
const CACHE_PACKAGE_DIR = 'deps-xscan/cache';

/** Pre-XDG cache location (migrated on first write). */
const LEGACY_CACHE_DIR = join(homedir(), '.deps-xscan-cache');

let legacyMigrationDone = false;

export interface CacheOptions {
  ttlHours: number;
  disabled: boolean;
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttlHours: 24,
  disabled: false,
};

/** Resolved cache directory (e.g. `~/.config/finografic/deps-xscan/cache`). */
export function getCacheDirectory(): string {
  return join(createXdgPaths().configDir(), CACHE_PACKAGE_DIR);
}

function ensureCacheDir(): void {
  const dir = getCacheDirectory();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  migrateLegacyCacheIfNeeded();
}

function migrateLegacyCacheIfNeeded(): void {
  if (legacyMigrationDone || !existsSync(LEGACY_CACHE_DIR)) return;
  legacyMigrationDone = true;

  const targetDir = getCacheDirectory();
  for (const file of readdirSync(LEGACY_CACHE_DIR)) {
    if (!file.endsWith('.json')) continue;
    const sourcePath = join(LEGACY_CACHE_DIR, file);
    const targetPath = join(targetDir, file);
    if (existsSync(targetPath)) continue;
    try {
      renameSync(sourcePath, targetPath);
    } catch {
      // Best-effort migration; fresh fetches still work if a file cannot move.
    }
  }

  try {
    const remaining = readdirSync(LEGACY_CACHE_DIR);
    if (remaining.length === 0) {
      rmdirSync(LEGACY_CACHE_DIR);
    }
  } catch {
    // Leave legacy dir in place if removal fails.
  }
}

function cacheKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function cachePath(key: string): string {
  return join(getCacheDirectory(), `${cacheKey(key)}.json`);
}

// Generic T lets callers specify the cached shape at the call site (e.g. getCached<OsvQueryResult>).
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- return-type-only generic for JSON cache reads
export function getCached<T = unknown>(key: string, opts: Partial<CacheOptions> = {}): T | null {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  if (options.disabled) return null;

  const path = cachePath(key);
  if (!existsSync(path)) return null;

  const stat = statSync(path);
  const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);

  if (ageHours > options.ttlHours) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setCache<T>(key: string, data: T, opts: Partial<CacheOptions> = {}): T {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  if (options.disabled) return data;

  ensureCacheDir();
  const path = cachePath(key);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

export function clearCache(): void {
  const dir = getCacheDirectory();
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      unlinkSync(join(dir, file));
    }
  }
}
