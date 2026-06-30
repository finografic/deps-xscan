import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const demoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
export const REPO_ROOT = resolve(demoRoot, '..');

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_MEDIA_TYPE = 'application/vnd.github+json';

export const SCAN_INPUT_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.nvmrc',
  '.node-version',
] as const;

export const SUPPORTED_LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json'] as const;

export const TOKEN_ENV_NAMES = ['NPM_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;

/** Local xscan build from the parent repo (run `pnpm build` at repo root). */
export const XSCAN_CLI = resolve(REPO_ROOT, 'dist/index.mjs');

/** Demo scans skip disk cache by default (safe for read-only hosted environments). */
export function demoSkipsCache(): boolean {
  const useCache = process.env.DEMO_XSCAN_USE_CACHE?.trim().toLowerCase();
  if (useCache === '1' || useCache === 'true' || useCache === 'yes') {
    return false;
  }
  return true;
}
