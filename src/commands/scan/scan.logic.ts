import { execSync } from 'node:child_process';

import type { CacheOptions } from 'lib/cache.utils';
import { correlate } from 'lib/correlate.utils';
import { loadProjectEnv } from 'lib/env.utils';
import {
  detectGithubRepo,
  fetchDependabotAlerts,
  githubTokenEnvLabel,
  queryGithubAdvisoryBatch,
  resolveGithubToken,
} from 'lib/github-source.utils';
import type { GithubAdvisoryQueryResult, GithubDependabotAlert } from 'lib/github-source.utils';
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
  githubEnabled: boolean;
  dependabot: boolean;
  githubRepo?: string;
  githubAlertStates: string[];
  githubTokenEnv?: string;
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

  loadProjectEnv(options.project);
  log('Loaded .env from project root (if present)', options.verbose);

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

  log(`Stage 3: Querying OSV.dev and GitHub for ${lockResult.deps.length} packages...`, options.verbose);
  const packages = lockResult.deps.map((d) => ({
    name: d.name,
    version: d.version,
  }));

  const githubToken = resolveGithubToken(options.githubTokenEnv);

  const [osvSettled, githubAdvisorySettled] = await Promise.allSettled([
    queryOsvBatch(packages, cacheOpts),
    options.githubEnabled ? queryGithubAdvisoryBatch(packages, cacheOpts, githubToken) : Promise.resolve([]),
  ]);

  let osvResults;
  if (osvSettled.status === 'fulfilled') {
    osvResults = osvSettled.value;
    const vulnCount = osvResults.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
    log(`  OSV.dev: ${vulnCount} vulnerabilities`, options.verbose);
  } else {
    const message =
      osvSettled.reason instanceof Error ? osvSettled.reason.message : String(osvSettled.reason);
    console.warn(`Warning: OSV.dev query failed: ${message}`);
    console.warn('Continuing without OSV.dev data...');
    osvResults = packages.map((p) => ({
      packageName: p.name,
      packageVersion: p.version,
      vulnerabilities: [],
    }));
  }

  let githubAdvisoryResults: GithubAdvisoryQueryResult[] = [];
  if (options.githubEnabled) {
    if (githubAdvisorySettled.status === 'fulfilled') {
      githubAdvisoryResults = githubAdvisorySettled.value;
      const ghVulnCount = githubAdvisoryResults.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
      log(`  GitHub Advisory Database: ${ghVulnCount} vulnerabilities`, options.verbose);
    } else {
      const message =
        githubAdvisorySettled.reason instanceof Error
          ? githubAdvisorySettled.reason.message
          : String(githubAdvisorySettled.reason);
      console.warn(`Warning: GitHub Advisory Database query failed: ${message}`);
      console.warn('Continuing without GitHub advisory data...');
    }
  } else {
    log('  GitHub Advisory Database: skipped (--no-github)', options.verbose);
  }

  let dependabotAlerts: GithubDependabotAlert[] = [];
  if (options.dependabot) {
    log('Stage 4: Fetching Dependabot alerts...', options.verbose);
    const repository = options.githubRepo || detectGithubRepo(options.project);
    if (!repository) {
      console.warn('Warning: Could not detect GitHub repository for Dependabot alerts.');
      console.warn('  Use --github-repo owner/repo or run from a git clone with a GitHub origin remote.');
    } else if (!githubToken) {
      console.warn(
        `Warning: ${githubTokenEnvLabel(options.githubTokenEnv)} not set — Dependabot alerts require a GitHub token.`,
      );
      console.warn(
        '  Add a token to the project .env (e.g. NPM_TOKEN), export it in your shell, or set GITHUB_TOKEN_FILE.',
      );
    } else {
      log(`  Repository: ${repository}`, options.verbose);
      dependabotAlerts = await fetchDependabotAlerts(
        repository,
        cacheOpts,
        githubToken,
        options.githubAlertStates,
      );
      log(`  Dependabot: ${dependabotAlerts.length} open alerts`, options.verbose);
    }
  }

  log('Stage 5: Correlating findings...', options.verbose);
  const result = correlate(
    lockResult.deps,
    nodeVersion,
    posts,
    osvResults,
    githubAdvisoryResults,
    dependabotAlerts,
  );

  log('Stage 6: Generating report...', options.verbose);
  generateReport(result, options.format, options.jsonOut);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Done in ${elapsed}s`, options.verbose);

  if (result.summary.critical > 0 || result.summary.high > 0) {
    return 1;
  }

  return 0;
}
