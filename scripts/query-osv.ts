import type { CacheOptions } from './cache';

import { getCached, setCache } from './cache';
import { isCliMain } from './is-cli-main';

export interface OsvVulnerability {
  id: string; // e.g. "GHSA-xxxx-xxxx-xxxx" or "CVE-2024-xxxxx"
  summary: string;
  details: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Unknown';
  aliases: string[]; // cross-references (CVE ↔ GHSA)
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

/**
 * Query OSV.dev for vulnerabilities affecting a single package version.
 */
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

/**
 * Batch query OSV.dev for multiple packages. OSV supports batch via /v1/querybatch — more efficient than
 * individual calls.
 */
export async function queryOsvBatch(
  packages: Array<{ name: string; version: string }>,
  cacheOpts: Partial<CacheOptions> = {},
): Promise<OsvQueryResult[]> {
  const fetch = (await import('node-fetch')).default;

  // Check cache first, split into cached vs uncached
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

  // Batch in chunks of 100 (OSV batch limit)
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
        // Fallback to individual queries
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

        // Cache individual results
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

/**
 * Parse a raw OSV vulnerability object into our normalized format.
 */
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

/**
 * Extract severity from OSV CVSS data or database-specific severity.
 */
function extractSeverity(raw: any): OsvVulnerability['severity'] {
  // Check database_specific severity
  const dbSeverity = raw.database_specific?.severity;
  if (dbSeverity) {
    const upper = dbSeverity.toUpperCase();
    if (upper === 'CRITICAL') return 'Critical';
    if (upper === 'HIGH') return 'High';
    if (upper === 'MODERATE' || upper === 'MEDIUM') return 'Medium';
    if (upper === 'LOW') return 'Low';
  }

  // Check CVSS score from severity array
  const severityEntries = raw.severity || [];
  for (const entry of severityEntries) {
    if (entry.score !== undefined) {
      if (entry.score >= 9.0) return 'Critical';
      if (entry.score >= 7.0) return 'High';
      if (entry.score >= 4.0) return 'Medium';
      return 'Low';
    }
    // Try parsing from CVSS vector string
    if (entry.type === 'CVSS_V3' && entry.score === undefined) {
      // Rough extraction from vector — look for base score
      const scoreMatch = entry.vector?.match(/CVSS:3\.\d\/.*?/);
      if (scoreMatch) continue; // Can't easily extract numeric score from vector alone
    }
  }

  return 'Unknown';
}

// CLI entry point
if (isCliMain(import.meta.url)) {
  const name = process.argv[2];
  const version = process.argv[3];

  if (!name || !version) {
    console.error('Usage: query-osv.ts <package-name> <version>');
    process.exit(1);
  }

  queryOsvSingle(name, version)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      return result;
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
