import type { CorrelationResult, Finding } from 'lib/correlate.utils';

type FindingSeverity = Finding['severity'];
type FindingScope = 'runtime' | 'development';

export interface ReportFoundLine {
  label: string;
  count: number;
  severity: FindingSeverity;
  scope: FindingScope;
}

export interface ReportActionSummary {
  foundLines: ReportFoundLine[];
  actionSteps: string[];
  recommendation: string;
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
    actionSteps: buildActionSteps(result),
    recommendation: buildRecommendation(result),
  };
}

function buildFoundLines(result: CorrelationResult): ReportFoundLine[] {
  const counts = new Map<string, number>();

  for (const finding of result.dependencyFindings) {
    const scope = finding.dependencyKind === 'prod' ? 'runtime' : 'development';
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

function buildActionSteps(result: CorrelationResult): string[] {
  const steps: string[] = [];
  let step = 1;

  const directProd = uniqueByPackage(
    result.dependencyFindings.filter((f) => f.dependencyKind === 'prod'),
  ).toSorted(bySeverityDesc);

  for (const finding of directProd) {
    const cmd = updateCommand(finding);
    steps.push(`${step}. Update ${finding.packageName} first — ${prodPriorityReason(finding)}.\n   ${cmd}`);
    step++;
  }

  const parentRoots = collectParentUpdateTargets(result.dependencyFindings);
  if (parentRoots.length > 0) {
    const label = parentRoots.join(' ');
    steps.push(
      `${step}. Update the dev toolchain that pulls in transitive findings — High items usually arrive through commitlint, Vitest/Vite, or tsx.\n   pnpm update ${label}`,
    );
    step++;
  }

  if (result.nodeVersionFindings.length > 0) {
    const patched = [...new Set(result.nodeVersionFindings.map((f) => f.patchedIn))].toSorted();
    steps.push(
      `${step}. Upgrade Node.js to a patched release (${patched.join(' or ')}).\n   Use your version manager (.nvmrc / pnpm devEngines) and reinstall dependencies.`,
    );
    step++;
  }

  steps.push(`${step}. Rerun the scan to confirm the tree is clean.\n   xscan --no-cache`);
  step++;

  steps.push(
    `${step}. If anything remains, check the Via: line in each finding — the package immediately before the vulnerable package is usually the parent that needs to move.`,
  );

  return steps;
}

function buildRecommendation(result: CorrelationResult): string {
  const directProd = result.dependencyFindings.some((f) => f.dependencyKind === 'prod');
  const highTransitive = result.dependencyFindings.some(
    (f) => f.severity === 'High' && f.dependencyKind !== 'prod',
  );
  const nodeIssues = result.nodeVersionFindings.length > 0;

  if (directProd && highTransitive) {
    return 'Update direct runtime dependencies first, then refresh dev tooling that pulls in vulnerable transitive packages. Most findings are dev-toolchain exposure rather than runtime exposure, but High transitive findings should still be resolved before release.';
  }

  if (directProd) {
    return 'Prioritize direct runtime dependency updates — these affect consumers of your package. Rerun xscan after upgrading to confirm the lockfile resolved the advisories.';
  }

  if (highTransitive) {
    return 'These findings are mostly in development tooling. Update the parent dependencies listed above, then rerun xscan to verify the lockfile picked up patched transitive versions.';
  }

  if (nodeIssues) {
    return 'Upgrade your Node.js runtime to a patched version, then rerun xscan. Engine advisories affect every dependency scan until the runtime itself is updated.';
  }

  return 'Review the findings above, apply the suggested updates, and rerun xscan --no-cache to confirm the dependency tree is clean.';
}

function prodPriorityReason(finding: Finding): string {
  if (finding.dependencyKind === 'prod') {
    return 'this is a direct production dependency and affects runtime consumers';
  }
  if (finding.dependencyKind === 'dev') {
    return 'this is a direct dev dependency used in local tooling';
  }
  return 'this dependency is declared directly in your manifest';
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
