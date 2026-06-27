import semver from 'semver';

import type { GithubAdvisoryQueryResult, GithubDependabotAlert } from 'lib/github-source.utils';
import type { ResolvedDep } from 'lib/lockfile.utils';
import type { ScrapedPost } from 'lib/node-posts.utils';
import type { OsvQueryResult } from 'lib/osv.utils';

export type FindingSource = 'node-blog' | 'osv' | 'github-advisory' | 'github-dependabot';

export interface Finding {
  id: string;
  packageName: string;
  installedVersion: string;
  isDirect: boolean;
  isPeer: boolean;
  dependencyKind: ResolvedDep['dependencyKind'];
  dependencyPaths: string[][];
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Unknown';
  type: string;
  title: string;
  description: string;
  affectedVersions: string;
  fixedIn: string | null;
  action: string;
  riskContext: string;
  sources: FindingSource[];
  references: string[];
  githubAlertUrl?: string;
  manifestPath?: string;
  alertState?: string;
  scope?: 'runtime' | 'development' | 'unknown';
  epssPercentage?: number;
  cwes?: string[];
  cvssScore?: number;
  cvssVector?: string;
}

export interface NodeVersionFinding {
  currentVersion: string;
  cve: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  type: string;
  title: string;
  patchedIn: string;
  postUrl: string;
}

export interface CorrelationResult {
  scannedAt: string;
  projectNodeVersion: string | null;
  totalDeps: number;
  nodeVersionFindings: NodeVersionFinding[];
  dependencyFindings: Finding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
    total: number;
    affectedDirect: number;
    affectedTransitive: number;
    affectedPeer: number;
  };
}

function correlateNodeVersion(nodeVersion: string | null, posts: ScrapedPost[]): NodeVersionFinding[] {
  if (!nodeVersion) return [];

  const cleanVersion = semver.clean(nodeVersion);
  if (!cleanVersion) return [];

  const findings: NodeVersionFinding[] = [];

  for (const post of posts) {
    for (const vuln of post.vulnerabilities) {
      try {
        if (vuln.affectedVersions !== 'unknown') {
          const patchedVersion = vuln.patchedIn;
          if (patchedVersion && patchedVersion !== 'unknown') {
            const cleanPatched = semver.clean(patchedVersion);
            if (
              cleanPatched &&
              semver.major(cleanVersion) === semver.major(cleanPatched) &&
              semver.lt(cleanVersion, cleanPatched)
            ) {
              findings.push({
                currentVersion: cleanVersion,
                cve: vuln.cve,
                severity: vuln.severity,
                type: vuln.type,
                title: vuln.title,
                patchedIn: cleanPatched,
                postUrl: vuln.postUrl,
              });
            }
          }
        }
      } catch {
        // semver parsing failed — skip
      }
    }
  }

  return findings;
}

function correlateDependencies(
  deps: ResolvedDep[],
  osvResults: OsvQueryResult[],
  posts: ScrapedPost[],
  githubAdvisoryResults: GithubAdvisoryQueryResult[] = [],
  dependabotAlerts: GithubDependabotAlert[] = [],
): Finding[] {
  const findingsMap = new Map<string, Finding>();
  const depLookup = new Map<string, ResolvedDep>();

  for (const dep of deps) {
    depLookup.set(`${dep.name}@${dep.version}`, dep);
  }

  for (const osvResult of osvResults) {
    ingestOsvFindings(findingsMap, osvResult, depLookup, posts);
  }

  for (const githubResult of githubAdvisoryResults) {
    ingestGithubAdvisoryFindings(findingsMap, githubResult, depLookup);
  }

  for (const alert of dependabotAlerts) {
    ingestDependabotAlert(findingsMap, alert, depLookup);
  }

  return [...findingsMap.values()];
}

function ingestOsvFindings(
  findingsMap: Map<string, Finding>,
  osvResult: OsvQueryResult,
  depLookup: Map<string, ResolvedDep>,
  posts: ScrapedPost[],
): void {
  const depKey = `${osvResult.packageName}@${osvResult.packageVersion}`;
  const dep = depLookup.get(depKey);

  for (const vuln of osvResult.vulnerabilities) {
    const findingId = `${vuln.id}-${depKey}`;

    if (findingsMap.has(findingId)) {
      addSource(findingsMap.get(findingId)!, 'osv');
      continue;
    }

    findingsMap.set(findingId, {
      id: vuln.id,
      packageName: osvResult.packageName,
      installedVersion: osvResult.packageVersion,
      isDirect: dep?.isDirect ?? false,
      isPeer: dep?.isPeer ?? false,
      dependencyKind: dep?.dependencyKind ?? 'transitive',
      dependencyPaths: dep?.dependencyPaths ?? [[osvResult.packageName]],
      severity: vuln.severity === 'Unknown' ? 'Medium' : vuln.severity,
      type: classifyFromDescription(vuln.summary + ' ' + vuln.details),
      title: vuln.summary || vuln.id,
      description: vuln.details.slice(0, 300),
      affectedVersions: vuln.affectedVersions,
      fixedIn: vuln.fixedIn,
      action: suggestedAction(osvResult.packageName, dep, vuln.fixedIn),
      riskContext: riskContext(dep),
      sources: ['osv'],
      references: vuln.references,
    });

    for (const alias of vuln.aliases) {
      for (const post of posts) {
        for (const nodeVuln of post.vulnerabilities) {
          if (nodeVuln.cve === alias || nodeVuln.cve === vuln.id) {
            const existing = findingsMap.get(findingId)!;
            addSource(existing, 'node-blog');
            existing.severity = higherSeverity(existing.severity, nodeVuln.severity);
          }
        }
      }
    }
  }
}

function findExistingFinding(
  findingsMap: Map<string, Finding>,
  depKey: string,
  candidateIds: Array<string | null | undefined>,
): Finding | undefined {
  const ids = candidateIds.filter(Boolean) as string[];

  for (const id of ids) {
    const direct = findingsMap.get(`${id}-${depKey}`);
    if (direct) return direct;
  }

  for (const finding of findingsMap.values()) {
    if (`${finding.packageName}@${finding.installedVersion}` !== depKey) continue;
    if (ids.includes(finding.id)) return finding;
  }

  return undefined;
}

function ingestGithubAdvisoryFindings(
  findingsMap: Map<string, Finding>,
  githubResult: GithubAdvisoryQueryResult,
  depLookup: Map<string, ResolvedDep>,
): void {
  const depKey = `${githubResult.packageName}@${githubResult.packageVersion}`;
  const dep = depLookup.get(depKey);

  for (const vuln of githubResult.vulnerabilities) {
    const findingId = `${vuln.id}-${depKey}`;
    const existing = findExistingFinding(findingsMap, depKey, [vuln.id, ...vuln.aliases]);

    if (existing) {
      addSource(existing, 'github-advisory');
      mergeGithubMetadata(existing, {
        references: vuln.references,
        fixedIn: vuln.fixedIn,
        cvssScore: vuln.cvssScore,
        cvssVector: vuln.cvssVector,
        epssPercentage: vuln.epssPercentage,
        cwes: vuln.cwes,
      });
      existing.severity = higherSeverity(existing.severity, vuln.severity);
      continue;
    }

    findingsMap.set(findingId, {
      id: vuln.id,
      packageName: githubResult.packageName,
      installedVersion: githubResult.packageVersion,
      isDirect: dep?.isDirect ?? false,
      isPeer: dep?.isPeer ?? false,
      dependencyKind: dep?.dependencyKind ?? 'transitive',
      dependencyPaths: dep?.dependencyPaths ?? [[githubResult.packageName]],
      severity: vuln.severity === 'Unknown' ? 'Medium' : vuln.severity,
      type: classifyFromDescription(vuln.summary + ' ' + vuln.details),
      title: vuln.summary || vuln.id,
      description: vuln.details.slice(0, 300),
      affectedVersions: vuln.affectedVersions,
      fixedIn: vuln.fixedIn,
      action: suggestedAction(githubResult.packageName, dep, vuln.fixedIn),
      riskContext: riskContext(dep),
      sources: ['github-advisory'],
      references: vuln.references,
      cvssScore: vuln.cvssScore ?? undefined,
      cvssVector: vuln.cvssVector ?? undefined,
      epssPercentage: vuln.epssPercentage ?? undefined,
      cwes: vuln.cwes.length > 0 ? vuln.cwes : undefined,
    });
  }
}

function ingestDependabotAlert(
  findingsMap: Map<string, Finding>,
  alert: GithubDependabotAlert,
  depLookup: Map<string, ResolvedDep>,
): void {
  const depKey = `${alert.packageName}@${alert.packageVersion}`;
  const dep = depLookup.get(depKey);
  const findingId = `${alert.ghsaId || alert.cveId || `dependabot-${alert.alertNumber}`}-${depKey}`;
  const existing = findExistingFinding(findingsMap, depKey, [alert.ghsaId, alert.cveId]);

  if (existing) {
    addSource(existing, 'github-dependabot');
    existing.githubAlertUrl = alert.htmlUrl || existing.githubAlertUrl;
    existing.manifestPath = alert.manifestPath || existing.manifestPath;
    existing.alertState = alert.alertState || existing.alertState;
    existing.scope = alert.scope !== 'unknown' ? alert.scope : existing.scope;
    existing.severity = higherSeverity(existing.severity, alert.severity);
    if (alert.fixedIn) existing.fixedIn = alert.fixedIn;
    return;
  }

  findingsMap.set(findingId, {
    id: alert.ghsaId || alert.cveId || `dependabot-${alert.alertNumber}`,
    packageName: alert.packageName,
    installedVersion: alert.packageVersion,
    isDirect: dep?.isDirect ?? false,
    isPeer: dep?.isPeer ?? false,
    dependencyKind: dep?.dependencyKind ?? 'transitive',
    dependencyPaths: dep?.dependencyPaths ?? [[alert.packageName]],
    severity: alert.severity === 'Unknown' ? 'Medium' : alert.severity,
    type: classifyFromDescription(alert.title + ' ' + alert.description),
    title: alert.title,
    description: alert.description.slice(0, 300),
    affectedVersions: alert.affectedVersions,
    fixedIn: alert.fixedIn,
    action: suggestedAction(alert.packageName, dep, alert.fixedIn),
    riskContext: dependabotRiskContext(alert, dep),
    sources: ['github-dependabot'],
    references: alert.references,
    githubAlertUrl: alert.htmlUrl,
    manifestPath: alert.manifestPath,
    alertState: alert.alertState,
    scope: alert.scope,
  });
}

function addSource(finding: Finding, source: FindingSource): void {
  if (!finding.sources.includes(source)) {
    finding.sources.push(source);
  }
}

function mergeGithubMetadata(
  finding: Finding,
  metadata: {
    references: string[];
    fixedIn: string | null;
    cvssScore: number | null;
    cvssVector: string | null;
    epssPercentage: number | null;
    cwes: string[];
  },
): void {
  finding.references = [...new Set([...finding.references, ...metadata.references])];
  if (metadata.fixedIn && !finding.fixedIn) finding.fixedIn = metadata.fixedIn;
  if (metadata.cvssScore != null) finding.cvssScore = metadata.cvssScore;
  if (metadata.cvssVector) finding.cvssVector = metadata.cvssVector;
  if (metadata.epssPercentage != null) finding.epssPercentage = metadata.epssPercentage;
  if (metadata.cwes.length > 0) finding.cwes = metadata.cwes;
}

function dependabotRiskContext(alert: GithubDependabotAlert, dep: ResolvedDep | undefined): string {
  const scopeLabel =
    alert.scope === 'runtime' ? 'runtime' : alert.scope === 'development' ? 'development' : 'unknown';
  const base = `Dependabot confirmed this ${scopeLabel} alert in ${alert.manifestPath}.`;
  if (dep?.dependencyKind === 'prod') return `${base} Direct production dependency.`;
  if (dep?.dependencyKind === 'dev') return `${base} Direct dev dependency.`;
  return `${base} Transitive dependency.`;
}

function suggestedAction(packageName: string, dep: ResolvedDep | undefined, fixedIn: string | null): string {
  const target = fixedIn ? `${packageName}@${fixedIn}` : packageName;

  if (!dep || dep.dependencyKind === 'transitive') {
    const parent = dep?.dependencyPaths[0]?.at(-2);
    return parent
      ? `Update the parent dependency that brings this in, starting with ${parent}.`
      : `Update the parent dependency that brings in ${packageName}.`;
  }

  if (dep.dependencyKind === 'prod') {
    return `Update runtime dependency to ${target}.`;
  }

  if (dep.dependencyKind === 'dev') {
    return `Update dev dependency to ${target}.`;
  }

  return `Update peer dependency range to allow ${target}.`;
}

function riskContext(dep: ResolvedDep | undefined): string {
  if (!dep) return 'Dependency relationship could not be resolved from the lockfile.';

  if (dep.dependencyKind === 'prod') {
    return 'Direct runtime dependency; prioritize because it can affect package consumers.';
  }

  if (dep.dependencyKind === 'dev') {
    return 'Direct dev dependency; usually affects local tooling, tests, builds, or publishing.';
  }

  if (dep.dependencyKind === 'peer') {
    return 'Peer dependency; review the supported version range and consuming projects.';
  }

  const root = dep.dependencyPaths[0]?.[0];
  return root
    ? `Transitive dependency via ${root}; update the nearest parent dependency when possible.`
    : 'Transitive dependency; update the parent dependency when possible.';
}

function classifyFromDescription(text: string): string {
  const lower = text.toLowerCase();
  const patterns: Array<[string, string]> = [
    ['prototype pollution', 'Prototype Pollution'],
    ['denial of service', 'Denial of Service'],
    ['redos', 'ReDoS'],
    ['regular expression', 'ReDoS'],
    ['xss', 'Cross-Site Scripting'],
    ['cross-site scripting', 'Cross-Site Scripting'],
    ['code injection', 'Code Injection'],
    ['command injection', 'Command Injection'],
    ['sql injection', 'SQL Injection'],
    ['path traversal', 'Path Traversal'],
    ['directory traversal', 'Path Traversal'],
    ['buffer overflow', 'Buffer Overflow'],
    ['remote code', 'Remote Code Execution'],
    ['arbitrary code', 'Remote Code Execution'],
    ['privilege escalation', 'Privilege Escalation'],
    ['authentication bypass', 'Authentication Bypass'],
    ['information disclosure', 'Information Disclosure'],
    ['information exposure', 'Information Disclosure'],
    ['open redirect', 'Open Redirect'],
    ['ssrf', 'Server-Side Request Forgery'],
    ['csrf', 'Cross-Site Request Forgery'],
  ];

  for (const [pattern, label] of patterns) {
    if (lower.includes(pattern)) return label;
  }
  return 'Other';
}

function higherSeverity(a: Finding['severity'], b: Finding['severity']): Finding['severity'] {
  const rank: Record<string, number> = {
    Critical: 4,
    High: 3,
    Medium: 2,
    Low: 1,
    Unknown: 0,
  };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

export function correlate(
  deps: ResolvedDep[],
  nodeVersion: string | null,
  posts: ScrapedPost[],
  osvResults: OsvQueryResult[],
  githubAdvisoryResults: GithubAdvisoryQueryResult[] = [],
  dependabotAlerts: GithubDependabotAlert[] = [],
): CorrelationResult {
  const nodeVersionFindings = correlateNodeVersion(nodeVersion, posts);
  const dependencyFindings = correlateDependencies(
    deps,
    osvResults,
    posts,
    githubAdvisoryResults,
    dependabotAlerts,
  );

  dependencyFindings.sort((a, b) => {
    const severityRank: Record<string, number> = {
      Critical: 4,
      High: 3,
      Medium: 2,
      Low: 1,
      Unknown: 0,
    };
    const sDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (sDiff !== 0) return sDiff;
    if (a.isDirect && !b.isDirect) return -1;
    if (!a.isDirect && b.isDirect) return 1;
    return 0;
  });

  const summary = {
    critical: dependencyFindings.filter((f) => f.severity === 'Critical').length,
    high: dependencyFindings.filter((f) => f.severity === 'High').length,
    medium: dependencyFindings.filter((f) => f.severity === 'Medium').length,
    low: dependencyFindings.filter((f) => f.severity === 'Low').length,
    unknown: dependencyFindings.filter((f) => f.severity === 'Unknown').length,
    total: dependencyFindings.length,
    affectedDirect: dependencyFindings.filter((f) => f.isDirect).length,
    affectedTransitive: dependencyFindings.filter((f) => !f.isDirect && !f.isPeer).length,
    affectedPeer: dependencyFindings.filter((f) => f.isPeer).length,
  };

  return {
    scannedAt: new Date().toISOString(),
    projectNodeVersion: nodeVersion,
    totalDeps: deps.length,
    nodeVersionFindings,
    dependencyFindings,
    summary,
  };
}
