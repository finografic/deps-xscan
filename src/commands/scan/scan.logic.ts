import { execSync } from 'node:child_process';

import type { CacheOptions } from 'lib/cache.utils';
import { correlate } from 'lib/correlate.utils';
import { parseLockfile } from 'lib/lockfile.utils';
import { scrapeNodeSecurityPosts } from 'lib/node-posts.utils';
import type { ScrapedPost } from 'lib/node-posts.utils';
import { queryOsvBatch } from 'lib/osv.utils';
import { generateReport } from 'lib/report.utils';
import type { OutputFormat } from 'lib/report.utils';

export interface ScanOptions {
  project: string;
  cacheTtl: number;
  noCache: boolean;
  format: OutputFormat;
  nodePosts: number;
  jsonOut?: string;
  verbose: boolean;
}

function log(msg: string, verbose: boolean): void {
  if (verbose) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] ${msg}`);
  }
}

export async function runScanPipeline(options: ScanOptions): Promise<number> {
  const cacheOpts: Partial<CacheOptions> = {
    ttlHours: options.cacheTtl,
    disabled: options.noCache,
  };

  const startTime = Date.now();

  log('Stage 1: Parsing lockfile...', options.verbose);
  const lockResult = parseLockfile(options.project);
  log(`  Found ${lockResult.deps.length} deps (${lockResult.format} format)`, options.verbose);
  log(`  Node.js version: ${lockResult.nodeVersion || 'not detected'}`, options.verbose);

  let { nodeVersion } = lockResult;
  if (!nodeVersion) {
    try {
      const runtimeVersion = execSync('node --version', { encoding: 'utf-8' }).trim().replace(/^v/, '');
      nodeVersion = runtimeVersion;
      log(`  Node.js version (runtime): ${nodeVersion}`, options.verbose);
    } catch {
      log('  Could not detect Node.js version', options.verbose);
    }
  }

  log(`Stage 2: Scraping last ${options.nodePosts} Node.js security posts...`, options.verbose);
  let posts: ScrapedPost[];
  try {
    posts = await scrapeNodeSecurityPosts(options.nodePosts, cacheOpts);
    const totalCves = posts.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
    log(`  Extracted ${totalCves} CVEs from ${posts.length} posts`, options.verbose);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: Could not fetch Node.js security posts: ${message}`);
    console.warn('Continuing with OSV.dev data only...');
    posts = [];
  }

  log(`Stage 3: Querying OSV.dev for ${lockResult.deps.length} packages...`, options.verbose);
  const packages = lockResult.deps.map((d) => ({
    name: d.name,
    version: d.version,
  }));

  let osvResults;
  try {
    osvResults = await queryOsvBatch(packages, cacheOpts);
    const vulnCount = osvResults.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
    log(`  Found ${vulnCount} vulnerabilities across all packages`, options.verbose);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Warning: OSV.dev query failed: ${message}`);
    console.warn('Continuing with Node.js blog data only...');
    osvResults = packages.map((p) => ({
      packageName: p.name,
      packageVersion: p.version,
      vulnerabilities: [],
    }));
  }

  log('Stage 4: Correlating findings...', options.verbose);
  const result = correlate(lockResult.deps, nodeVersion, posts, osvResults);

  log('Stage 5: Generating report...', options.verbose);
  generateReport(result, options.format, options.jsonOut);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Done in ${elapsed}s`, options.verbose);

  if (result.summary.critical > 0 || result.summary.high > 0) {
    return 1;
  }

  return 0;
}
