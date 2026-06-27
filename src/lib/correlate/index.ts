import semver from 'semver';

import type { ResolvedDep } from 'lib/lockfile';
import type { ScrapedPost } from 'lib/node-posts';
import type { OsvQueryResult } from 'lib/osv';

export interface Finding {
  id: string;
  packageName: string;
  installedVersion: string;
  isDirect: boolean;
  isPeer: boolean;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Unknown';
  type: string;
  title: string;
  description: string;
  fixedIn: string | null;
  sources: Array<'node-blog' | 'osv'>;
  references: string[];
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
): Finding[] {
  const findingsMap = new Map<string, Finding>();
  const depLookup = new Map<string, ResolvedDep>();

  for (const dep of deps) {
    depLookup.set(`${dep.name}@${dep.version}`, dep);
  }

  for (const osvResult of osvResults) {
    const depKey = `${osvResult.packageName}@${osvResult.packageVersion}`;
    const dep = depLookup.get(depKey);

    for (const vuln of osvResult.vulnerabilities) {
      const findingId = `${vuln.id}-${depKey}`;

      if (findingsMap.has(findingId)) {
        findingsMap.get(findingId)!.sources.push('osv');
        continue;
      }

      findingsMap.set(findingId, {
        id: vuln.id,
        packageName: osvResult.packageName,
        installedVersion: osvResult.packageVersion,
        isDirect: dep?.isDirect ?? false,
        isPeer: dep?.isPeer ?? false,
        severity: vuln.severity === 'Unknown' ? 'Medium' : vuln.severity,
        type: classifyFromDescription(vuln.summary + ' ' + vuln.details),
        title: vuln.summary || vuln.id,
        description: vuln.details.slice(0, 300),
        fixedIn: vuln.fixedIn,
        sources: ['osv'],
        references: vuln.references,
      });

      for (const alias of vuln.aliases) {
        for (const post of posts) {
          for (const nodeVuln of post.vulnerabilities) {
            if (nodeVuln.cve === alias || nodeVuln.cve === vuln.id) {
              const existing = findingsMap.get(findingId)!;
              if (!existing.sources.includes('node-blog')) {
                existing.sources.push('node-blog');
              }
              existing.severity = higherSeverity(existing.severity, nodeVuln.severity);
            }
          }
        }
      }
    }
  }

  return [...findingsMap.values()];
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
): CorrelationResult {
  const nodeVersionFindings = correlateNodeVersion(nodeVersion, posts);
  const dependencyFindings = correlateDependencies(deps, osvResults, posts);

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
