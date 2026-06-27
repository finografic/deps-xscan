import type { CacheOptions } from 'lib/cache';
import { getCached, setCache } from 'lib/cache';

export interface OsvVulnerability {
  id: string;
  summary: string;
  details: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Unknown';
  aliases: string[];
  affectedVersions: string;
  fixedIn: string | null;
  references: string[];
  published: string;
  modified: string;
}

export interface OsvQueryResult {
  packageName: string;
  packageVersion: string;
  vulnerabilities: OsvVulnerability[];
}

const OSV_API_BASE = 'https://api.osv.dev/v1';
const CACHE_KEY_PREFIX = 'osv-query-v2';

export async function queryOsvSingle(
  name: string,
  version: string,
  cacheOpts: Partial<CacheOptions> = {},
): Promise<OsvQueryResult> {
  const cacheKey = `${CACHE_KEY_PREFIX}-${name}@${version}`;
  const cached = getCached<OsvQueryResult>(cacheKey, cacheOpts);
  if (cached) return cached;

  const fetch = (await import('node-fetch')).default;

  const res = await fetch(`${OSV_API_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version,
      package: {
        name,
        ecosystem: 'npm',
      },
    }),
  });

  if (!res.ok) {
    console.warn(`[osv] Warning: query failed for ${name}@${version} (${res.status})`);
    return { packageName: name, packageVersion: version, vulnerabilities: [] };
  }

  const data = (await res.json()) as OsvQueryResponse;
  const rawVulns = await Promise.all((data.vulns || []).map((v) => fetchOsvVulnDetail(v, cacheOpts)));
  const vulns = rawVulns.map((v) => parseOsvVuln(v, name));

  const result: OsvQueryResult = {
    packageName: name,
    packageVersion: version,
    vulnerabilities: vulns,
  };

  setCache(cacheKey, result, cacheOpts);
  return result;
}

export async function queryOsvBatch(
  packages: Array<{ name: string; version: string }>,
  cacheOpts: Partial<CacheOptions> = {},
): Promise<OsvQueryResult[]> {
  const fetch = (await import('node-fetch')).default;

  const results: OsvQueryResult[] = [];
  const uncached: Array<{ name: string; version: string; index: number }> = [];

  for (let i = 0; i < packages.length; i++) {
    const { name, version } = packages[i];
    const cacheKey = `${CACHE_KEY_PREFIX}-${name}@${version}`;
    const cached = getCached<OsvQueryResult>(cacheKey, cacheOpts);
    if (cached) {
      results[i] = cached;
    } else {
      uncached.push({ name, version, index: i });
    }
  }

  if (uncached.length === 0) {
    console.log(`[osv] All ${packages.length} packages served from cache`);
    return results;
  }

  console.log(`[osv] Querying ${uncached.length} packages (${packages.length - uncached.length} cached)`);

  const BATCH_SIZE = 100;
  for (let offset = 0; offset < uncached.length; offset += BATCH_SIZE) {
    const chunk = uncached.slice(offset, offset + BATCH_SIZE);

    const queries = chunk.map(({ name, version }) => ({
      version,
      package: { name, ecosystem: 'npm' },
    }));

    try {
      const res = await fetch(`${OSV_API_BASE}/querybatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });

      if (!res.ok) {
        console.warn(`[osv] Batch query failed (${res.status}), falling back to individual queries`);
        for (const item of chunk) {
          results[item.index] = await queryOsvSingle(item.name, item.version, cacheOpts);
        }
        continue;
      }

      const data = (await res.json()) as OsvBatchResponse;
      const batchResults = data.results || [];

      for (let j = 0; j < chunk.length; j++) {
        const { name, version, index } = chunk[j];
        const rawVulns = await Promise.all(
          (batchResults[j]?.vulns || []).map((v) => fetchOsvVulnDetail(v, cacheOpts)),
        );
        const vulns = rawVulns.map((v) => parseOsvVuln(v, name));
        const result: OsvQueryResult = {
          packageName: name,
          packageVersion: version,
          vulnerabilities: vulns,
        };

        results[index] = result;

        const cacheKey = `${CACHE_KEY_PREFIX}-${name}@${version}`;
        setCache(cacheKey, result, cacheOpts);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[osv] Batch error: ${message}`);
      for (const item of chunk) {
        results[item.index] = {
          packageName: item.name,
          packageVersion: item.version,
          vulnerabilities: [],
        };
      }
    }
  }

  return results;
}

interface OsvQueryResponse {
  vulns?: RawOsvVulnerability[];
}

interface OsvBatchResponse {
  results?: Array<{ vulns?: RawOsvVulnerability[] }>;
}

interface RawOsvVulnerability {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  affected?: RawOsvAffected[];
  references?: Array<{ url?: string }>;
  published?: string;
  modified?: string;
  database_specific?: {
    severity?: string;
  };
  severity?: Array<{
    type?: string;
    score?: string | number;
  }>;
}

interface RawOsvAffected {
  package?: {
    name?: string;
  };
  ranges?: Array<{
    events?: Array<{
      introduced?: string;
      fixed?: string;
      last_affected?: string;
    }>;
  }>;
  database_specific?: {
    last_known_affected_version_range?: string;
  };
}

async function fetchOsvVulnDetail(
  raw: RawOsvVulnerability,
  cacheOpts: Partial<CacheOptions>,
): Promise<RawOsvVulnerability> {
  if (!raw.id || raw.summary || raw.affected) return raw;

  const cacheKey = `osv-vuln-detail-v1-${raw.id}`;
  const cached = getCached<RawOsvVulnerability>(cacheKey, cacheOpts);
  if (cached) return cached;

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${OSV_API_BASE}/vulns/${raw.id}`);
  if (!res.ok) return raw;

  const detail = (await res.json()) as RawOsvVulnerability;
  return setCache(cacheKey, detail, cacheOpts);
}

function parseOsvVuln(raw: RawOsvVulnerability, packageName: string): OsvVulnerability {
  const severity = extractSeverity(raw);
  const affected = findAffectedPackage(raw, packageName);
  const ranges = affected.ranges || [];
  const fixedVersions: string[] = [];
  const affectedRanges: string[] = [];

  for (const range of ranges) {
    let introduced: string | null = null;
    for (const event of range.events || []) {
      if (event.fixed) fixedVersions.push(event.fixed);
      if (event.introduced) introduced = event.introduced;
      if (event.last_affected && introduced) {
        affectedRanges.push(`>= ${introduced} <= ${event.last_affected}`);
      }
    }

    const fixed = fixedVersions[fixedVersions.length - 1];
    if (introduced && fixed) affectedRanges.push(`>= ${introduced} < ${fixed}`);
  }

  const databaseAffectedRange = affected.database_specific?.last_known_affected_version_range;
  if (databaseAffectedRange && affectedRanges.length === 0) {
    affectedRanges.push(databaseAffectedRange);
  }

  return {
    id: raw.id || 'unknown',
    summary: raw.summary || '',
    details: (raw.details || '').slice(0, 500),
    severity,
    aliases: raw.aliases || [],
    affectedVersions: affectedRanges.join(', ') || 'unknown',
    fixedIn: fixedVersions.length > 0 ? fixedVersions[fixedVersions.length - 1] : null,
    references: (raw.references || []).flatMap((r) => (r.url ? [r.url] : [])).slice(0, 5),
    published: raw.published || '',
    modified: raw.modified || '',
  };
}

function findAffectedPackage(raw: RawOsvVulnerability, packageName: string): RawOsvAffected {
  return raw.affected?.find((affected) => affected.package?.name === packageName) || raw.affected?.[0] || {};
}

function extractSeverity(raw: RawOsvVulnerability): OsvVulnerability['severity'] {
  const dbSeverity = raw.database_specific?.severity;
  if (dbSeverity) {
    const upper = dbSeverity.toUpperCase();
    if (upper === 'CRITICAL') return 'Critical';
    if (upper === 'HIGH') return 'High';
    if (upper === 'MODERATE' || upper === 'MEDIUM') return 'Medium';
    if (upper === 'LOW') return 'Low';
  }

  const severityEntries = raw.severity || [];
  for (const entry of severityEntries) {
    const numericScore = typeof entry.score === 'number' ? entry.score : Number(entry.score);
    if (Number.isFinite(numericScore)) {
      if (numericScore >= 9.0) return 'Critical';
      if (numericScore >= 7.0) return 'High';
      if (numericScore >= 4.0) return 'Medium';
      return 'Low';
    }

    if (typeof entry.score === 'string' && entry.score.startsWith('CVSS:3.')) {
      return severityFromCvss3Vector(entry.score);
    }
  }

  return 'Unknown';
}

function severityFromCvss3Vector(vector: string): OsvVulnerability['severity'] {
  const metrics = Object.fromEntries(
    vector
      .split('/')
      .slice(1)
      .map((part) => {
        const [key, value] = part.split(':');
        return [key, value];
      }),
  );

  const attackVector = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[metrics.AV || ''] ?? 0;
  const attackComplexity = { L: 0.77, H: 0.44 }[metrics.AC || ''] ?? 0;
  const scopeChanged = metrics.S === 'C';
  const privilegesRequired = scopeChanged
    ? ({ N: 0.85, L: 0.68, H: 0.5 }[metrics.PR || ''] ?? 0)
    : ({ N: 0.85, L: 0.62, H: 0.27 }[metrics.PR || ''] ?? 0);
  const userInteraction = { N: 0.85, R: 0.62 }[metrics.UI || ''] ?? 0;
  const confidentiality = { H: 0.56, L: 0.22, N: 0 }[metrics.C || ''] ?? 0;
  const integrity = { H: 0.56, L: 0.22, N: 0 }[metrics.I || ''] ?? 0;
  const availability = { H: 0.56, L: 0.22, N: 0 }[metrics.A || ''] ?? 0;

  const impactSubScore = 1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);
  const impact = scopeChanged
    ? 7.52 * (impactSubScore - 0.029) - 3.25 * (impactSubScore - 0.02) ** 15
    : 6.42 * impactSubScore;
  const exploitability = 8.22 * attackVector * attackComplexity * privilegesRequired * userInteraction;

  if (impact <= 0) return 'Low';

  const score = scopeChanged
    ? roundUp(Math.min(1.08 * (impact + exploitability), 10))
    : roundUp(Math.min(impact + exploitability, 10));

  if (score >= 9.0) return 'Critical';
  if (score >= 7.0) return 'High';
  if (score >= 4.0) return 'Medium';
  return 'Low';
}

function roundUp(input: number): number {
  return Math.ceil(input * 10) / 10;
}
