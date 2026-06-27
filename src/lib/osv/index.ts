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
const CACHE_KEY_PREFIX = 'osv-query';

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

  const data = (await res.json()) as any;
  const vulns = (data.vulns || []).map((v: any) => parseOsvVuln(v));

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

      const data = (await res.json()) as any;
      const batchResults = data.results || [];

      for (let j = 0; j < chunk.length; j++) {
        const { name, version, index } = chunk[j];
        const vulns = (batchResults[j]?.vulns || []).map((v: any) => parseOsvVuln(v));
        const result: OsvQueryResult = {
          packageName: name,
          packageVersion: version,
          vulnerabilities: vulns,
        };

        results[index] = result;

        const cacheKey = `${CACHE_KEY_PREFIX}-${name}@${version}`;
        setCache(cacheKey, result, cacheOpts);
      }
    } catch (err: any) {
      console.warn(`[osv] Batch error: ${err.message}`);
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

function parseOsvVuln(raw: any): OsvVulnerability {
  const severity = extractSeverity(raw);
  const affected = raw.affected?.[0] || {};
  const ranges = affected.ranges || [];
  const fixedVersions: string[] = [];
  let affectedRange = '';

  for (const range of ranges) {
    for (const event of range.events || []) {
      if (event.fixed) fixedVersions.push(event.fixed);
      if (event.introduced) {
        affectedRange += (affectedRange ? ', ' : '') + `>= ${event.introduced}`;
      }
    }
  }

  if (fixedVersions.length > 0) {
    affectedRange += ` < ${fixedVersions[fixedVersions.length - 1]}`;
  }

  return {
    id: raw.id || 'unknown',
    summary: raw.summary || '',
    details: (raw.details || '').slice(0, 500),
    severity,
    aliases: raw.aliases || [],
    affectedVersions: affectedRange || 'unknown',
    fixedIn: fixedVersions.length > 0 ? fixedVersions[fixedVersions.length - 1] : null,
    references: (raw.references || []).map((r: any) => r.url).slice(0, 5),
    published: raw.published || '',
    modified: raw.modified || '',
  };
}

function extractSeverity(raw: any): OsvVulnerability['severity'] {
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
    if (entry.score !== undefined) {
      if (entry.score >= 9.0) return 'Critical';
      if (entry.score >= 7.0) return 'High';
      if (entry.score >= 4.0) return 'Medium';
      return 'Low';
    }
  }

  return 'Unknown';
}
