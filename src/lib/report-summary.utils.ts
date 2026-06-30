import type { CorrelationResult, Finding } from 'lib/correlate.utils';

type FindingSeverity = Finding['severity'];
type FindingScope = 'runtime' | 'development';

export interface ReportFoundLine {
  label: string;
  count: number;
  severity: FindingSeverity;
  scope: FindingScope;
}

export interface ReportActionGroup {
  /** Highest severity in the group — drives the colored badge after the step number. */
  badgeSeverity: FindingSeverity | null;
  title: string;
  subtitle?: string;
  /** Full command lines, e.g. `pnpm update foo@1.2.3`. */
  commands: string[];
  /** Plain follow-up lines (Node upgrade hints, etc.) when there are no pnpm commands. */
  notes?: string[];
}

export interface ReportActionSummary {
  foundLines: ReportFoundLine[];
  actionGroups: ReportActionGroup[];
  recommendation: string;
  /** Shown under SUMMARY & ACTIONS when findings are dev/toolchain-only. */
  exposureNote?: string;
}

const SEVERITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Unknown: 0,
};

export function buildActionSummary(result: CorrelationResult): ReportActionSummary | null {
  const hasDeps = result.dependencyFindings.length > 0;
  const hasNode = result.nodeVersionFindings.length > 0;

  if (!hasDeps && !hasNode) {
    return null;
  }

  return {
    foundLines: buildFoundLines(result),
    actionGroups: buildActionGroups(result),
    recommendation: buildRecommendation(result),
    exposureNote: buildExposureNote(result),
  };
}

function buildFoundLines(result: CorrelationResult): ReportFoundLine[] {
  const counts = new Map<string, number>();

  for (const finding of result.dependencyFindings) {
    const scope = resolveFindingScope(finding);
    incrementCount(counts, finding.severity, scope);
  }

  for (const finding of result.nodeVersionFindings) {
    incrementCount(counts, finding.severity, 'runtime');
  }

  const rows: ReportFoundLine[] = [];
  const severities: FindingSeverity[] = ['Critical', 'High', 'Medium', 'Low', 'Unknown'];
  const scopes: FindingScope[] = ['runtime', 'development'];

  for (const severity of severities) {
    for (const scope of scopes) {
      const count = counts.get(foundKey(severity, scope)) || 0;
      const isRequiredBaseline = severity === 'Critical' && scope === 'runtime';
      if (!isRequiredBaseline && count === 0) continue;

      rows.push({
        label: `${severity} (${scope})`,
        count,
        severity,
        scope,
      });
    }
  }

  return rows;
}

function incrementCount(counts: Map<string, number>, severity: FindingSeverity, scope: FindingScope): void {
  const key = foundKey(severity, scope);
  counts.set(key, (counts.get(key) || 0) + 1);
}

function foundKey(severity: FindingSeverity, scope: FindingScope): string {
  return `${severity}:${scope}`;
}

function resolveFindingScope(finding: Finding): FindingScope {
  if (finding.sources.includes('github-dependabot')) {
    if (finding.scope === 'runtime') return 'runtime';
    if (finding.scope === 'development') return 'development';
  }
  return finding.dependencyKind === 'prod' ? 'runtime' : 'development';
}

function hasRuntimeExposure(result: CorrelationResult): boolean {
  if (result.nodeVersionFindings.length > 0) return true;
  return result.dependencyFindings.some((f) => resolveFindingScope(f) === 'runtime');
}

function isDevToolchainOnly(result: CorrelationResult): boolean {
  if (result.dependencyFindings.length === 0) return false;
  return result.dependencyFindings.every((f) => resolveFindingScope(f) === 'development');
}

function buildExposureNote(result: CorrelationResult): string | undefined {
  if (!isDevToolchainOnly(result) || hasRuntimeExposure(result)) {
    return undefined;
  }
  return 'No production runtime exposure — development / transitive toolchain only.';
}

function buildActionGroups(result: CorrelationResult): ReportActionGroup[] {
  const groups: ReportActionGroup[] = [];

  const directProd = uniqueByPackage(
    result.dependencyFindings.filter((f) => f.dependencyKind === 'prod'),
  ).toSorted(bySeverityDesc);

  if (directProd.length > 0) {
    groups.push({
      badgeSeverity: directProd[0].severity,
      title: 'Update first',
      subtitle: 'direct production dependencies, affecting runtime consumers',
      commands: directProd.map((finding) => updateCommand(finding)),
    });
  }

  const parentRoots = collectParentUpdateTargets(result.dependencyFindings);
  if (parentRoots.length > 0) {
    const parentSeverity = maxSeverity(
      result.dependencyFindings.filter((f) => {
        const root = f.dependencyPaths[0]?.[0];
        return root !== undefined && root !== f.packageName && parentRoots.includes(root);
      }),
    );
    groups.push({
      badgeSeverity: parentSeverity,
      title: 'Update dev toolchain',
      subtitle: 'pulls in transitive findings — often commitlint, Vitest/Vite, or tsx',
      commands: [`pnpm update ${parentRoots.join(' ')}`],
    });
  }

  const transitiveFixes = collectTransitivePackageUpdates(result.dependencyFindings, parentRoots);
  for (const severity of ['Critical', 'High', 'Medium', 'Low'] as FindingSeverity[]) {
    const bucket = transitiveFixes.filter((f) => f.severity === severity);
    if (bucket.length === 0) continue;

    groups.push({
      badgeSeverity: severity,
      title: `(${severity.toLowerCase()} transitive, development)`,
      subtitle: 'does not affect production runtime consumers',
      commands: bucket.map((finding) => updateCommand(finding)),
    });
  }

  if (result.nodeVersionFindings.length > 0) {
    const patched = [...new Set(result.nodeVersionFindings.map((f) => f.patchedIn))].toSorted();
    groups.push({
      badgeSeverity: maxSeverity(result.nodeVersionFindings),
      title: 'Upgrade Node.js',
      subtitle: `to a patched release (${patched.join(' or ')})`,
      commands: [],
      notes: ['Use your version manager (.nvmrc / pnpm devEngines) and reinstall dependencies.'],
    });
  }

  groups.push({
    badgeSeverity: null,
    title: 'Rerun the scan to confirm the tree is clean',
    commands: ['xscan --no-cache'],
  });

  groups.push({
    badgeSeverity: null,
    title: 'If anything remains, check the Via: line in each finding',
    subtitle:
      'the package immediately before the vulnerable package is usually the parent that needs to move',
    commands: [],
  });

  return groups;
}

export function combinedUpdateCommand(commands: string[]): string {
  const packages = commands.map((command) => command.replace(/^pnpm update /, ''));
  return `pnpm update ${packages.join(' ')}`;
}

function buildRecommendation(result: CorrelationResult): string {
  const directProd = result.dependencyFindings.some((f) => f.dependencyKind === 'prod');
  const highTransitive = result.dependencyFindings.some(
    (f) => f.severity === 'High' && f.dependencyKind !== 'prod',
  );
  const nodeIssues = result.nodeVersionFindings.length > 0;
  const devOnly = isDevToolchainOnly(result);

  if (devOnly && !directProd && !nodeIssues) {
    return 'No production runtime exposure from these findings. They are limited to development or transitive toolchain dependencies. Apply the updates above when you next refresh dev dependencies—recommended before release, not a production deploy blocker.';
  }

  if (directProd && highTransitive) {
    return 'Update direct runtime dependencies first, then refresh dev tooling that pulls in vulnerable transitive packages. Most findings are dev-toolchain exposure rather than runtime exposure, but High transitive findings should still be resolved before release.';
  }

  if (directProd) {
    return 'Prioritize direct runtime dependency updates — these affect consumers of your package. Rerun xscan after upgrading to confirm the lockfile resolved the advisories.';
  }

  if (highTransitive) {
    return 'These findings are in development tooling or transitive dependencies. Follow the update steps above, then rerun xscan to verify the lockfile picked up patched versions.';
  }

  if (nodeIssues) {
    return 'Upgrade your Node.js runtime to a patched version, then rerun xscan. Engine advisories affect every dependency scan until the runtime itself is updated.';
  }

  return 'Review the findings above, apply the suggested updates, and rerun xscan --no-cache to confirm the dependency tree is clean.';
}

function maxSeverity(findings: Array<{ severity: FindingSeverity }>): FindingSeverity | null {
  let best: FindingSeverity | null = null;
  let bestRank = -1;
  for (const finding of findings) {
    const rank = SEVERITY_RANK[finding.severity] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = finding.severity;
    }
  }
  return best;
}

function updateCommand(finding: Finding): string {
  if (finding.fixedIn) {
    return `pnpm update ${finding.packageName}@${finding.fixedIn}`;
  }
  return `pnpm update ${finding.packageName}`;
}

function collectParentUpdateTargets(findings: Finding[]): string[] {
  const roots = new Set<string>();

  for (const finding of findings) {
    if (finding.dependencyKind === 'prod') continue;
    if ((SEVERITY_RANK[finding.severity] ?? 0) < SEVERITY_RANK.Medium) continue;

    const root = finding.dependencyPaths[0]?.[0];
    if (root && root !== finding.packageName) {
      roots.add(root);
    }
  }

  return [...roots].toSorted();
}

/** Direct package bumps when no parent root is available (e.g. path is only the vulnerable package). */
function collectTransitivePackageUpdates(findings: Finding[], parentRoots: string[]): Finding[] {
  const parentSet = new Set(parentRoots);
  const candidates = findings.filter(
    (f) => f.dependencyKind !== 'prod' && (SEVERITY_RANK[f.severity] ?? 0) >= SEVERITY_RANK.High,
  );

  return uniqueByPackage(
    candidates.filter((f) => {
      const root = f.dependencyPaths[0]?.[0];
      if (root && root !== f.packageName && parentSet.has(root)) return false;
      return true;
    }),
  ).toSorted(bySeverityDesc);
}

function uniqueByPackage(findings: Finding[]): Finding[] {
  const byPackage = new Map<string, Finding>();

  for (const finding of findings) {
    const existing = byPackage.get(finding.packageName);
    if (!existing || (SEVERITY_RANK[finding.severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0)) {
      byPackage.set(finding.packageName, finding);
    }
  }

  return [...byPackage.values()];
}

function bySeverityDesc(a: Finding, b: Finding): number {
  return (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
}
