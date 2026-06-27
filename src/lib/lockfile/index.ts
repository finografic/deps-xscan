import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

export interface ResolvedDep {
  name: string;
  version: string;
  isDirect: boolean;
  isPeer: boolean;
}

export interface LockfileResult {
  format: 'npm' | 'pnpm';
  nodeVersion: string | null;
  deps: ResolvedDep[];
}

/**
 * Auto-detect and parse the lockfile in the given project root. Supports package-lock.json (v2/v3) and
 * pnpm-lock.yaml.
 */
export function parseLockfile(projectRoot: string): LockfileResult {
  const npmLockPath = join(projectRoot, 'package-lock.json');
  const pnpmLockPath = join(projectRoot, 'pnpm-lock.yaml');
  const pkgJsonPath = join(projectRoot, 'package.json');

  let directDeps = new Set<string>();
  let peerDeps = new Set<string>();
  let nodeVersion: string | null = null;

  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    directDeps = new Set([
      ...Object.keys(pkgJson.dependencies || {}),
      ...Object.keys(pkgJson.devDependencies || {}),
    ]);
    peerDeps = new Set(Object.keys(pkgJson.peerDependencies || {}));
    nodeVersion = pkgJson.engines?.node || null;
  }

  if (!nodeVersion) {
    for (const f of ['.nvmrc', '.node-version']) {
      const p = join(projectRoot, f);
      if (existsSync(p)) {
        nodeVersion = readFileSync(p, 'utf-8').trim().replace(/^v/, '');
        break;
      }
    }
  }

  if (existsSync(npmLockPath)) {
    return {
      format: 'npm',
      nodeVersion,
      deps: parseNpmLock(npmLockPath, directDeps, peerDeps),
    };
  }

  if (existsSync(pnpmLockPath)) {
    return {
      format: 'pnpm',
      nodeVersion,
      deps: parsePnpmLock(pnpmLockPath, directDeps, peerDeps),
    };
  }

  throw new Error(
    `No supported lockfile found in ${projectRoot}. Expected package-lock.json or pnpm-lock.yaml`,
  );
}

function parseNpmLock(lockPath: string, directDeps: Set<string>, peerDeps: Set<string>): ResolvedDep[] {
  const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
  const deps: ResolvedDep[] = [];
  const packages = lock.packages || {};

  for (const [pkgPath, meta] of Object.entries(packages)) {
    if (!pkgPath || typeof meta !== 'object' || meta === null) continue;

    const version = 'version' in meta && typeof meta.version === 'string' ? meta.version : undefined;

    const segments = pkgPath.replace(/^node_modules\//, '').split('node_modules/');
    const name = segments[segments.length - 1];

    if (!name || !version) continue;

    deps.push({
      name,
      version,
      isDirect: directDeps.has(name),
      isPeer: peerDeps.has(name),
    });
  }

  if (deps.length === 0 && lock.dependencies) {
    parseNpmLockV1(lock.dependencies, directDeps, peerDeps, deps);
  }

  return deps;
}

function parseNpmLockV1(
  dependencies: Record<string, any>,
  directDeps: Set<string>,
  peerDeps: Set<string>,
  result: ResolvedDep[],
): void {
  for (const [name, meta] of Object.entries(dependencies)) {
    if (meta.version) {
      result.push({
        name,
        version: meta.version,
        isDirect: directDeps.has(name),
        isPeer: peerDeps.has(name),
      });
    }
    if (meta.dependencies) {
      parseNpmLockV1(meta.dependencies, directDeps, peerDeps, result);
    }
  }
}

function parsePnpmLock(lockPath: string, directDeps: Set<string>, peerDeps: Set<string>): ResolvedDep[] {
  const raw = readFileSync(lockPath, 'utf-8');
  const lock = loadYaml(raw) as Record<string, Record<string, unknown>>;
  const deps: ResolvedDep[] = [];
  const packages = lock.packages || {};

  for (const [key] of Object.entries(packages)) {
    const match = key.match(/\/?(@?[^@]+)@(.+)/);
    if (!match) continue;

    const name = match[1];
    const version = match[2].replace(/\(.*\)/, '').trim();

    deps.push({
      name,
      version,
      isDirect: directDeps.has(name),
      isPeer: peerDeps.has(name),
    });
  }

  return deps;
}
