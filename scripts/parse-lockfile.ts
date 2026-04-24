import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface ResolvedDep {
  name: string;
  version: string;
  isDirect: boolean;
  isPeer: boolean;
}

export interface LockfileResult {
  format: "npm" | "pnpm";
  nodeVersion: string | null;
  deps: ResolvedDep[];
}

/**
 * Auto-detect and parse the lockfile in the given project root.
 * Supports package-lock.json (v2/v3) and pnpm-lock.yaml.
 */
export function parseLockfile(projectRoot: string): LockfileResult {
  const npmLockPath = join(projectRoot, "package-lock.json");
  const pnpmLockPath = join(projectRoot, "pnpm-lock.yaml");
  const pkgJsonPath = join(projectRoot, "package.json");

  // Read package.json for direct dep detection + engine version
  let directDeps = new Set<string>();
  let peerDeps = new Set<string>();
  let nodeVersion: string | null = null;

  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    directDeps = new Set([
      ...Object.keys(pkgJson.dependencies || {}),
      ...Object.keys(pkgJson.devDependencies || {}),
    ]);
    peerDeps = new Set(Object.keys(pkgJson.peerDependencies || {}));
    nodeVersion = pkgJson.engines?.node || null;
  }

  // Also check .nvmrc / .node-version
  if (!nodeVersion) {
    for (const f of [".nvmrc", ".node-version"]) {
      const p = join(projectRoot, f);
      if (existsSync(p)) {
        nodeVersion = readFileSync(p, "utf-8").trim().replace(/^v/, "");
        break;
      }
    }
  }

  if (existsSync(npmLockPath)) {
    return {
      format: "npm",
      nodeVersion,
      deps: parseNpmLock(npmLockPath, directDeps, peerDeps),
    };
  }

  if (existsSync(pnpmLockPath)) {
    return {
      format: "pnpm",
      nodeVersion,
      deps: parsePnpmLock(pnpmLockPath, directDeps, peerDeps),
    };
  }

  throw new Error(
    `No supported lockfile found in ${projectRoot}. ` +
      `Expected package-lock.json or pnpm-lock.yaml`
  );
}

/**
 * Parse npm package-lock.json (v2/v3 format with "packages" field).
 */
function parseNpmLock(
  lockPath: string,
  directDeps: Set<string>,
  peerDeps: Set<string>
): ResolvedDep[] {
  const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
  const deps: ResolvedDep[] = [];

  // v2/v3 format uses "packages" keyed by node_modules path
  const packages = lock.packages || {};

  for (const [pkgPath, meta] of Object.entries(packages) as [string, any][]) {
    // Skip the root entry (empty string key)
    if (!pkgPath) continue;

    // Extract package name from path like "node_modules/@scope/pkg"
    const segments = pkgPath.replace(/^node_modules\//, "").split("node_modules/");
    const name = segments[segments.length - 1];
    const version = meta.version;

    if (!name || !version) continue;

    deps.push({
      name,
      version,
      isDirect: directDeps.has(name),
      isPeer: peerDeps.has(name),
    });
  }

  // Fallback for v1 format using "dependencies"
  if (deps.length === 0 && lock.dependencies) {
    parseNpmLockV1(lock.dependencies, directDeps, peerDeps, deps);
  }

  return deps;
}

function parseNpmLockV1(
  dependencies: Record<string, any>,
  directDeps: Set<string>,
  peerDeps: Set<string>,
  result: ResolvedDep[]
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
    // Recurse into nested dependencies
    if (meta.dependencies) {
      parseNpmLockV1(meta.dependencies, directDeps, peerDeps, result);
    }
  }
}

/**
 * Parse pnpm-lock.yaml.
 */
function parsePnpmLock(
  lockPath: string,
  directDeps: Set<string>,
  peerDeps: Set<string>
): ResolvedDep[] {
  // Dynamic import for js-yaml
  const yaml = require("js-yaml");
  const raw = readFileSync(lockPath, "utf-8");
  const lock = yaml.load(raw) as any;
  const deps: ResolvedDep[] = [];

  // pnpm v9+ uses "snapshots" + "packages", older uses "packages" directly
  const packages = lock.packages || {};

  for (const [key, meta] of Object.entries(packages) as [string, any][]) {
    // Keys look like "/@scope/name@1.2.3" or "/name@1.2.3" or "name@1.2.3"
    const match = key.match(/\/?(@?[^@]+)@(.+)/);
    if (!match) continue;

    const name = match[1];
    // Version might include peer dep suffixes like "1.2.3(react@18.0.0)"
    const version = match[2].replace(/\(.*\)/, "").trim();

    deps.push({
      name,
      version,
      isDirect: directDeps.has(name),
      isPeer: peerDeps.has(name),
    });
  }

  return deps;
}

// CLI entry point
if (require.main === module) {
  const projectRoot = process.argv[2] || process.cwd();
  try {
    const result = parseLockfile(projectRoot);
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
