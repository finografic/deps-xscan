import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import type { CacheOptions } from 'lib/cache.utils';
import { getCached, setCache } from 'lib/cache.utils';

import {
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  GITHUB_MEDIA_TYPE,
  GITHUB_TOKEN_ENV_FALLBACKS,
  GITHUB_TOKEN_FILE_ENV,
} from 'constants/source-endpoints.constants';
import { GITHUB_PAGE_SIZE } from 'constants/source-limits.constants';

export type GithubSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Unknown';

export interface GithubAdvisoryVulnerability {
  id: string;
  summary: string;
  details: string;
  severity: GithubSeverity;
  aliases: string[];
  affectedVersions: string;
  fixedIn: string | null;
  references: string[];
  published: string;
  modified: string;
  cvssScore: number | null;
  cvssVector: string | null;
  epssPercentage: number | null;
  cwes: string[];
}

export interface GithubAdvisoryQueryResult {
  packageName: string;
  packageVersion: string;
  vulnerabilities: GithubAdvisoryVulnerability[];
}

export interface GithubDependabotAlert {
  alertNumber: number;
  packageName: string;
  packageVersion: string;
  severity: GithubSeverity;
  title: string;
  description: string;
  affectedVersions: string;
  fixedIn: string | null;
  ghsaId: string | null;
  cveId: string | null;
  manifestPath: string;
  scope: 'runtime' | 'development' | 'unknown';
  alertState: string;
  htmlUrl: string;
  references: string[];
}

export interface GithubSecurityResult {
  advisoryResults: GithubAdvisoryQueryResult[];
  dependabotAlerts: GithubDependabotAlert[];
}

const ADVISORY_CACHE_PREFIX = 'github-advisory-v1';

export function resolveGithubToken(tokenEnv?: string): string | undefined {
  const envNames = tokenEnv ? parseTokenEnvNames(tokenEnv) : [...GITHUB_TOKEN_ENV_FALLBACKS];

  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return readTokenFromFile(process.env[GITHUB_TOKEN_FILE_ENV]);
}

export function githubTokenEnvLabel(tokenEnv?: string): string {
  if (tokenEnv) return parseTokenEnvNames(tokenEnv).join(' or ');
  const fileHint = process.env[GITHUB_TOKEN_FILE_ENV] ? ` or ${GITHUB_TOKEN_FILE_ENV}` : '';
  return `${GITHUB_TOKEN_ENV_FALLBACKS.join(' or ')}${fileHint}`;
}

function parseTokenEnvNames(tokenEnv: string): string[] {
  return tokenEnv
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function readTokenFromFile(filePath: string | undefined): string | undefined {
  if (!filePath?.trim()) return undefined;
  try {
    if (!existsSync(filePath)) return undefined;
    const value = readFileSync(filePath, 'utf-8').trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function parseGithubRepoFromRemote(remoteUrl: string): string | null {
  const sshMatch = remoteUrl.match(/git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  return null;
}

export function detectGithubRepo(projectRoot: string): string | null {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return parseGithubRepoFromRemote(remote);
  } catch {
    return null;
  }
}

export async function queryGithubAdvisoryBatch(
  packages: Array<{ name: string; version: string }>,
  cacheOpts: Partial<CacheOptions> = {},
  token?: string,
  options: { verbose?: boolean } = {},
): Promise<GithubAdvisoryQueryResult[]> {
  const unique = dedupePackages(packages);
  const results: GithubAdvisoryQueryResult[] = [];

  if (options.verbose) {
    console.log(`[github-advisory] Querying ${unique.length} package versions`);
  }

  for (const { name, version } of unique) {
    results.push(await queryGithubAdvisorySingle(name, version, cacheOpts, token, options));
  }

  return results;
}

export async function queryGithubAdvisorySingle(
  name: string,
  version: string,
  cacheOpts: Partial<CacheOptions> = {},
  token?: string,
  options: { verbose?: boolean } = {},
): Promise<GithubAdvisoryQueryResult> {
  const cacheKey = `${ADVISORY_CACHE_PREFIX}-${name}@${version}`;
  const cached = getCached<GithubAdvisoryQueryResult>(cacheKey, cacheOpts);
  if (cached) return cached;

  const fetch = (await import('node-fetch')).default;
  const params = new URLSearchParams({
    ecosystem: 'npm',
    affects: `${name}@${version}`,
    type: 'reviewed',
  });

  const headers = githubHeaders(token);
  const res = await fetch(`${GITHUB_API_BASE}/advisories?${params.toString()}`, { headers });

  if (!res.ok) {
    if (options.verbose) {
      console.warn(`[github-advisory] Warning: query failed for ${name}@${version} (${String(res.status)})`);
    }
    return { packageName: name, packageVersion: version, vulnerabilities: [] };
  }

  const advisories = (await res.json()) as RawGithubAdvisory[];
  const vulnerabilities = advisories
    .filter((advisory) => !advisory.withdrawn_at)
    .map((advisory) => parseGithubAdvisory(advisory, name, version));

  const result: GithubAdvisoryQueryResult = {
    packageName: name,
    packageVersion: version,
    vulnerabilities,
  };

  return setCache(cacheKey, result, cacheOpts);
}

export async function fetchDependabotAlerts(
  repository: string,
  cacheOpts: Partial<CacheOptions> = {},
  token?: string,
  alertStates: string[] = ['open'],
  options: { verbose?: boolean } = {},
): Promise<GithubDependabotAlert[]> {
  if (!token) {
    if (options.verbose) {
      console.warn(`[github-dependabot] Warning: ${githubTokenEnvLabel()} required for Dependabot alerts`);
    }
    return [];
  }

  const cacheKey = `${ADVISORY_CACHE_PREFIX}-dependabot-${repository}-${alertStates.join(',')}`;
  const cached = getCached<GithubDependabotAlert[]>(cacheKey, cacheOpts);
  if (cached) return cached;

  const fetch = (await import('node-fetch')).default;
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    if (options.verbose) {
      console.warn(`[github-dependabot] Warning: invalid repository "${repository}"`);
    }
    return [];
  }

  const alerts: GithubDependabotAlert[] = [];
  let after: string | undefined;

  do {
    const params = new URLSearchParams({
      ecosystem: 'npm',
      per_page: String(GITHUB_PAGE_SIZE),
    });

    for (const state of alertStates) {
      params.append('state', state);
    }
    if (after) params.set('after', after);

    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/dependabot/alerts?${params.toString()}`,
      {
        headers: githubHeaders(token),
      },
    );

    if (!res.ok) {
      if (options.verbose) {
        console.warn(`[github-dependabot] Warning: fetch failed for ${repository} (${String(res.status)})`);
      }
      break;
    }

    const page = (await res.json()) as RawDependabotAlert[];
    alerts.push(...page.map(parseDependabotAlert));

    after = parseLinkAfter(res.headers.get('link'));
  } while (after);

  return setCache(cacheKey, alerts, cacheOpts);
}

function githubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': GITHUB_MEDIA_TYPE,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseGithubAdvisory(
  advisory: RawGithubAdvisory,
  packageName: string,
  _packageVersion: string,
): GithubAdvisoryVulnerability {
  const vulnEntry =
    advisory.vulnerabilities?.find((entry) => entry.package?.name === packageName) ||
    advisory.vulnerabilities?.[0];

  const fixedIn = vulnEntry?.first_patched_version?.identifier || null;
  const aliases = [advisory.ghsa_id, advisory.cve_id].filter(Boolean) as string[];

  return {
    id: advisory.ghsa_id || advisory.cve_id || 'unknown',
    summary: advisory.summary || '',
    details: (advisory.description || '').slice(0, 500),
    severity: mapGithubSeverity(advisory.severity),
    aliases,
    affectedVersions: vulnEntry?.vulnerable_version_range || 'unknown',
    fixedIn,
    references: (advisory.references || []).flatMap((ref) => (ref.url ? [ref.url] : [])),
    published: advisory.published_at || '',
    modified: advisory.updated_at || '',
    cvssScore: advisory.cvss?.score ?? null,
    cvssVector: advisory.cvss?.vector_string ?? null,
    epssPercentage: advisory.epss?.percentage ?? null,
    cwes: (advisory.cwes || []).map((cwe) => cwe.cwe_id).filter(Boolean) as string[],
  };
}

function parseDependabotAlert(alert: RawDependabotAlert): GithubDependabotAlert {
  const advisory = alert.security_advisory;
  const vuln = alert.security_vulnerability;
  const packageName = vuln?.package?.name || alert.dependency?.package?.name || 'unknown';
  const packageVersion = alert.dependency?.version || 'unknown';

  return {
    alertNumber: alert.number,
    packageName,
    packageVersion,
    severity: mapGithubSeverity(advisory?.severity),
    title: advisory?.summary || packageName,
    description: (advisory?.description || '').slice(0, 500),
    affectedVersions: vuln?.vulnerable_version_range || 'unknown',
    fixedIn: vuln?.first_patched_version?.identifier || null,
    ghsaId: advisory?.ghsa_id || null,
    cveId: advisory?.cve_id || null,
    manifestPath: alert.dependency?.manifest_path || 'unknown',
    scope: mapDependabotScope(alert.dependency?.scope),
    alertState: alert.state || 'unknown',
    htmlUrl: alert.html_url || '',
    references: advisory?.references?.flatMap((ref) => (ref.url ? [ref.url] : [])) || [],
  };
}

function mapGithubSeverity(severity: string | undefined): GithubSeverity {
  switch ((severity || '').toLowerCase()) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High';
    case 'medium':
    case 'moderate':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'Unknown';
  }
}

function mapDependabotScope(scope: string | undefined): GithubDependabotAlert['scope'] {
  if (scope === 'runtime') return 'runtime';
  if (scope === 'development') return 'development';
  return 'unknown';
}

function dedupePackages(
  packages: Array<{ name: string; version: string }>,
): Array<{ name: string; version: string }> {
  const seen = new Set<string>();
  const unique: Array<{ name: string; version: string }> = [];

  for (const pkg of packages) {
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(pkg);
  }

  return unique;
}

function parseLinkAfter(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;

  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) continue;
    const url = new URL(match[1]);
    return url.searchParams.get('after') || undefined;
  }

  return undefined;
}

interface RawGithubAdvisory {
  ghsa_id?: string;
  cve_id?: string;
  summary?: string;
  description?: string;
  severity?: string;
  withdrawn_at?: string | null;
  published_at?: string;
  updated_at?: string;
  references?: Array<{ url?: string }>;
  cvss?: { score?: number; vector_string?: string };
  epss?: { percentage?: number };
  cwes?: Array<{ cwe_id?: string }>;
  vulnerabilities?: Array<{
    package?: { name?: string; ecosystem?: string };
    vulnerable_version_range?: string;
    first_patched_version?: { identifier?: string };
  }>;
}

interface RawDependabotAlert {
  number: number;
  state?: string;
  html_url?: string;
  dependency?: {
    package?: { name?: string; ecosystem?: string };
    manifest_path?: string;
    scope?: string;
    version?: string;
  };
  security_advisory?: {
    ghsa_id?: string;
    cve_id?: string;
    summary?: string;
    description?: string;
    severity?: string;
    references?: Array<{ url?: string }>;
  };
  security_vulnerability?: {
    package?: { name?: string; ecosystem?: string };
    vulnerable_version_range?: string;
    first_patched_version?: { identifier?: string };
  };
}
