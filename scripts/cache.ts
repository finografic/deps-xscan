import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = join(process.env.HOME || '/tmp', '.dep-tree-scanner-cache');

export interface CacheOptions {
  ttlHours: number;
  disabled: boolean;
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttlHours: 24,
  disabled: false,
};

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cacheKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${cacheKey(key)}.json`);
}

export function getCached<T>(key: string, opts: Partial<CacheOptions> = {}): T | null {
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

export function setCache<T>(key: string, data: T, opts: Partial<CacheOptions> = {}): void {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  if (options.disabled) return;

  ensureCacheDir();
  const path = cachePath(key);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

export function clearCache(): void {
  if (existsSync(CACHE_DIR)) {
    for (const file of readdirSync(CACHE_DIR)) {
      unlinkSync(join(CACHE_DIR, file));
    }
  }
}
