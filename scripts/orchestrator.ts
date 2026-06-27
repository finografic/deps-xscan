#!/usr/bin/env tsx
/* oxfmt-ignore */
/**
 * deps-xscan orchestrator
 *
 * Coordinates the full scan pipeline:
 *   1. Parse lockfile → resolved deps
 *   2. Detect Node.js version
 *   3. Scrape Node.js security posts (cached)
 *   4. Query OSV.dev for each dep (batched, cached)
 *   5. Correlate findings
 *   6. Generate report (terminal + JSON)
 *
 * Usage:
 *   npx tsx scripts/orchestrator.ts [options]
 *
 * Options:
 *   --project <path>      Project root (default: cwd)
 *   --cache-ttl <hours>   Cache TTL in hours (default: 24)
 *   --no-cache            Disable caching
 *   --format <type>       Output: terminal | json | both (default: both)
 *   --node-posts <n>      Number of Node.js security posts (default: 5)
 *   --json-out <path>     JSON output file path
 *   --verbose             Show detailed progress
 */

import { execSync } from 'node:child_process';
import type { CacheOptions } from './cache';
import type { OutputFormat } from './report';
import type { ScrapedPost } from './scrape-node-posts';

import { correlate } from './correlate';
import { parseLockfile } from './parse-lockfile';
import { queryOsvBatch } from './query-osv';
import { generateReport } from './report';
import { scrapeNodeSecurityPosts } from './scrape-node-posts';

interface CliArgs {
  project: string;
  cacheTtl: number;
  noCache: boolean;
  format: OutputFormat;
  nodePosts: number;
  jsonOut?: string;
  verbose: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    project: process.cwd(),
    cacheTtl: 24,
    noCache: false,
    format: 'both',
    nodePosts: 5,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--project':
        parsed.project = args[++i];
        break;
      case '--cache-ttl':
        parsed.cacheTtl = parseInt(args[++i], 10);
        break;
      case '--no-cache':
        parsed.noCache = true;
        break;
      case '--format':
        parsed.format = args[++i] as OutputFormat;
        break;
      case '--node-posts':
        parsed.nodePosts = parseInt(args[++i], 10);
        break;
      case '--json-out':
        parsed.jsonOut = args[++i];
        break;
      case '--verbose':
      case '-v':
        parsed.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
deps-xscan — Deep dependency security analysis

Usage:
  npx tsx scripts/orchestrator.ts [options]

Options:
  --project <path>      Project root directory (default: current directory)
  --cache-ttl <hours>   Cache TTL in hours (default: 24)
  --no-cache            Disable caching entirely
  --format <type>       Output format: terminal | json | both (default: both)
  --node-posts <n>      Number of Node.js security posts to scan (default: 5)
  --json-out <path>     Path for JSON report output
  --verbose, -v         Show detailed progress
  --help, -h            Show this help

Examples:
  npx tsx scripts/orchestrator.ts
  npx tsx scripts/orchestrator.ts --project ./my-app --format terminal
  npx tsx scripts/orchestrator.ts --no-cache --node-posts 10 --verbose
  `);
}

function log(msg: string, verbose: boolean): void {
  if (verbose) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] ${msg}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  const cacheOpts: Partial<CacheOptions> = {
    ttlHours: args.cacheTtl,
    disabled: args.noCache,
  };

  const startTime = Date.now();

  // Stage 1: Parse lockfile
  log('Stage 1: Parsing lockfile...', args.verbose);
  const lockResult = parseLockfile(args.project);
  log(`  Found ${lockResult.deps.length} deps (${lockResult.format} format)`, args.verbose);
  log(`  Node.js version: ${lockResult.nodeVersion || 'not detected'}`, args.verbose);

  // Also try to detect Node version from runtime if not in project config
  let { nodeVersion } = lockResult;
  if (!nodeVersion) {
    try {
      const runtimeVersion = execSync('node --version', { encoding: 'utf-8' }).trim().replace(/^v/, '');
      nodeVersion = runtimeVersion;
      log(`  Node.js version (runtime): ${nodeVersion}`, args.verbose);
    } catch {
      log('  Could not detect Node.js version', args.verbose);
    }
  }

  // Stage 2: Scrape Node.js security posts
  log(`Stage 2: Scraping last ${args.nodePosts} Node.js security posts...`, args.verbose);
  let posts: ScrapedPost[];
  try {
    posts = await scrapeNodeSecurityPosts(args.nodePosts, cacheOpts);
    const totalCves = posts.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
    log(`  Extracted ${totalCves} CVEs from ${posts.length} posts`, args.verbose);
  } catch (err: any) {
    console.warn(`Warning: Could not fetch Node.js security posts: ${err.message}`);
    console.warn('Continuing with OSV.dev data only...');
    posts = [];
  }

  // Stage 3: Query OSV.dev
  log(`Stage 3: Querying OSV.dev for ${lockResult.deps.length} packages...`, args.verbose);
  const packages = lockResult.deps.map((d) => ({
    name: d.name,
    version: d.version,
  }));

  let osvResults;
  try {
    osvResults = await queryOsvBatch(packages, cacheOpts);
    const vulnCount = osvResults.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
    log(`  Found ${vulnCount} vulnerabilities across all packages`, args.verbose);
  } catch (err: any) {
    console.warn(`Warning: OSV.dev query failed: ${err.message}`);
    console.warn('Continuing with Node.js blog data only...');
    osvResults = packages.map((p) => ({
      packageName: p.name,
      packageVersion: p.version,
      vulnerabilities: [],
    }));
  }

  // Stage 4: Correlate
  log('Stage 4: Correlating findings...', args.verbose);
  const result = correlate(lockResult.deps, nodeVersion, posts, osvResults);

  // Stage 5: Report
  log('Stage 5: Generating report...', args.verbose);
  generateReport(result, args.format, args.jsonOut);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Done in ${elapsed}s`, args.verbose);

  // Exit with non-zero if critical or high vulns found (useful for CI)
  if (result.summary.critical > 0 || result.summary.high > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(2);
});
