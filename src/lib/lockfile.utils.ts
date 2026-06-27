import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';

export interface ResolvedDep {
  name: string;
  version: string;
  isDirect: boolean;
  isPeer: boolean;
  dependencyKind: 'prod' | 'dev' | 'peer' | 'transitive';
  dependencyPaths: string[][];
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

  let prodDeps = new Set<string>();
  let devDeps = new Set<string>();
  let peerDeps = new Set<string>();
  let nodeVersion: string | null = null;

  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    prodDeps = new Set(Object.keys(pkgJson.dependencies || {}));
    devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));
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
      deps: parseNpmLock(npmLockPath, prodDeps, devDeps, peerDeps),
    };
  }

  if (existsSync(pnpmLockPath)) {
    return {
      format: 'pnpm',
      nodeVersion,
      deps: parsePnpmLock(pnpmLockPath, prodDeps, devDeps, peerDeps),
    };
  }

  throw new Error(
    `No supported lockfile found in ${projectRoot}. Expected package-lock.json or pnpm-lock.yaml`,
  );
}

function getDependencyKind(
  name: string,
  prodDeps: Set<string>,
  devDeps: Set<string>,
  peerDeps: Set<string>,
): ResolvedDep['dependencyKind'] {
  if (prodDeps.has(name)) return 'prod';
  if (devDeps.has(name)) return 'dev';
  if (peerDeps.has(name)) return 'peer';
  return 'transitive';
}

function parseNpmLock(
  lockPath: string,
  prodDeps: Set<string>,
  devDeps: Set<string>,
  peerDeps: Set<string>,
): ResolvedDep[] {
  const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
  const deps: ResolvedDep[] = [];
  const packages = lock.packages || {};
  const directDeps = new Set([...prodDeps, ...devDeps]);

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
      dependencyKind: getDependencyKind(name, prodDeps, devDeps, peerDeps),
      dependencyPaths: [[name]],
    });
  }

  if (deps.length === 0 && lock.dependencies) {
    parseNpmLockV1(lock.dependencies, prodDeps, devDeps, peerDeps, deps);
  }

  return deps;
}

function parseNpmLockV1(
  dependencies: Record<string, unknown>,
  prodDeps: Set<string>,
  devDeps: Set<string>,
  peerDeps: Set<string>,
  result: ResolvedDep[],
  parentPath: string[] = [],
): void {
  const directDeps = new Set([...prodDeps, ...devDeps]);
  for (const [name, meta] of Object.entries(dependencies)) {
    if (typeof meta !== 'object' || meta === null) continue;
    const dependencyMeta = meta as { version?: string; dependencies?: Record<string, unknown> };
    const dependencyPath = [...parentPath, name];

    if (dependencyMeta.version) {
      result.push({
        name,
        version: dependencyMeta.version,
        isDirect: directDeps.has(name),
        isPeer: peerDeps.has(name),
        dependencyKind: getDependencyKind(name, prodDeps, devDeps, peerDeps),
        dependencyPaths: [dependencyPath],
      });
    }
    if (dependencyMeta.dependencies) {
      parseNpmLockV1(dependencyMeta.dependencies, prodDeps, devDeps, peerDeps, result, dependencyPath);
    }
  }
}

interface PnpmLock {
  importers?: Record<
    string,
    {
      dependencies?: Record<string, PnpmImporterDependency>;
      devDependencies?: Record<string, PnpmImporterDependency>;
      peerDependencies?: Record<string, PnpmImporterDependency>;
    }
  >;
  packages?: Record<string, unknown>;
  snapshots?: Record<
    string,
    { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
  >;
}

interface PnpmImporterDependency {
  version?: string;
}

interface PnpmPackageId {
  name: string;
  version: string;
}

function parsePnpmPackageId(key: string): PnpmPackageId | null {
  const match = key.match(/^\/?(@?[^@]+)@(.+)$/);
  if (!match) return null;

  return {
    name: match[1],
    version: cleanPnpmVersion(match[2]),
  };
}

function cleanPnpmVersion(version: string): string {
  return version.replace(/\(.*\)/, '').trim();
}

function resolvePnpmSnapshotKey(
  packageName: string,
  packageRef: string,
  snapshots: Record<string, unknown>,
): string | null {
  const preferredKey = `${packageName}@${packageRef}`;
  if (preferredKey in snapshots) return preferredKey;

  const cleanRef = cleanPnpmVersion(packageRef);
  for (const key of Object.keys(snapshots)) {
    const id = parsePnpmPackageId(key);
    if (id?.name === packageName && id.version === cleanRef) return key;
  }

  return null;
}

function collectPnpmDependencyPaths(lock: PnpmLock): Map<string, string[][]> {
  const snapshots = lock.snapshots || {};
  const importer = lock.importers?.['.'];
  const paths = new Map<string, string[][]>();
  if (!importer) return paths;

  const rootDependencies = [
    ...Object.entries(importer.dependencies || {}),
    ...Object.entries(importer.devDependencies || {}),
    ...Object.entries(importer.peerDependencies || {}),
  ];

  const queue: Array<{ key: string; path: string[] }> = [];

  for (const [name, meta] of rootDependencies) {
    if (!meta.version) continue;
    const key = resolvePnpmSnapshotKey(name, meta.version, snapshots);
    if (!key) continue;
    queue.push({ key, path: [name] });
  }

  const seen = new Set<string>();

  while (queue.length > 0) {
    const item = queue.shift()!;
    const id = parsePnpmPackageId(item.key);
    if (!id) continue;

    const depKey = `${id.name}@${id.version}`;
    const existingPaths = paths.get(depKey) || [];
    if (!existingPaths.some((path) => path.join('>') === item.path.join('>'))) {
      paths.set(depKey, [...existingPaths, item.path]);
    }

    const visitKey = `${item.key}:${item.path.join('>')}`;
    if (seen.has(visitKey)) continue;
    seen.add(visitKey);

    const snapshot = snapshots[item.key];
    const childDependencies = {
      ...snapshot?.dependencies,
      ...snapshot?.optionalDependencies,
    };

    for (const [childName, childRef] of Object.entries(childDependencies)) {
      const childKey = resolvePnpmSnapshotKey(childName, childRef, snapshots);
      if (!childKey) continue;
      queue.push({ key: childKey, path: [...item.path, childName] });
    }
  }

  return paths;
}

function parsePnpmLock(
  lockPath: string,
  prodDeps: Set<string>,
  devDeps: Set<string>,
  peerDeps: Set<string>,
): ResolvedDep[] {
  const raw = readFileSync(lockPath, 'utf-8');
  const lock = loadYaml(raw) as PnpmLock;
  const deps: ResolvedDep[] = [];
  const packages = lock.packages || {};
  const dependencyPaths = collectPnpmDependencyPaths(lock);
  const directDeps = new Set([...prodDeps, ...devDeps]);

  for (const [key] of Object.entries(packages)) {
    const id = parsePnpmPackageId(key);
    if (!id) continue;

    deps.push({
      name: id.name,
      version: id.version,
      isDirect: directDeps.has(id.name),
      isPeer: peerDeps.has(id.name),
      dependencyKind: getDependencyKind(id.name, prodDeps, devDeps, peerDeps),
      dependencyPaths: dependencyPaths.get(`${id.name}@${id.version}`) || [[id.name]],
    });
  }

  return deps;
}
