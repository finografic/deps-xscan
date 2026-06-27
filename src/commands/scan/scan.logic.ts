import { execSync } from 'node:child_process';
import { tasks } from '@clack/prompts';

import type { CacheOptions } from 'lib/cache.utils';
import { getCacheDirectory } from 'lib/cache.utils';
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
import type { OsvQueryResult } from 'lib/osv.utils';
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

function shouldUseSpinners(verbose: boolean): boolean {
  return (process.stdout.isTTY ?? false) && !verbose;
}

function sourceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function countOsvVulnerabilities(results: OsvQueryResult[]): number {
  return results.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
}

function countGithubVulnerabilities(results: GithubAdvisoryQueryResult[]): number {
  return results.reduce((sum, r) => sum + r.vulnerabilities.length, 0);
}

export async function runScanPipeline(options: ScanOptions): Promise<number> {
  const cacheOpts: Partial<CacheOptions> = {
    ttlHours: options.cacheTtl,
    disabled: options.noCache,
  };

  const startTime = Date.now();

  loadProjectEnv(options.project);
  log('Loaded .env from project root (if present)', options.verbose);
  if (!options.noCache) {
    log(`  API cache directory: ${getCacheDirectory()}`, options.verbose);
  }

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

  const useSpinners = shouldUseSpinners(options.verbose);

  log(`Stage 2: Scraping last ${options.nodePosts} Node.js security posts...`, options.verbose);
  let posts: ScrapedPost[] = [];
  try {
    if (useSpinners) {
      await tasks([
        {
          title: `Node.js security posts (${options.nodePosts} posts)`,
          task: async () => {
            posts = await scrapeNodeSecurityPosts(options.nodePosts, cacheOpts);
            const totalCves = posts.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
            return `Node.js security posts: ${posts.length} posts, ${totalCves} CVEs`;
          },
        },
      ]);
    } else {
      posts = await scrapeNodeSecurityPosts(options.nodePosts, cacheOpts, { verbose: options.verbose });
    }
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

  let osvResults: OsvQueryResult[] = packages.map((p) => ({
    packageName: p.name,
    packageVersion: p.version,
    vulnerabilities: [],
  }));
  let githubAdvisoryResults: GithubAdvisoryQueryResult[] = [];
  let osvError: unknown;
  let githubAdvisoryError: unknown;

  if (useSpinners) {
    await tasks([
      {
        title: `OSV.dev (${packages.length} package versions)`,
        task: async () => {
          try {
            osvResults = await queryOsvBatch(packages, cacheOpts);
            return `OSV.dev: ${countOsvVulnerabilities(osvResults)} vulnerabilities`;
          } catch (err: unknown) {
            osvError = err;
            return 'OSV.dev unavailable; continuing without OSV data';
          }
        },
      },
      {
        title: `GitHub Advisory Database (${packages.length} package versions)`,
        enabled: options.githubEnabled,
        task: async () => {
          try {
            githubAdvisoryResults = await queryGithubAdvisoryBatch(packages, cacheOpts, githubToken);
            return `GitHub Advisory Database: ${countGithubVulnerabilities(githubAdvisoryResults)} vulnerabilities`;
          } catch (err: unknown) {
            githubAdvisoryError = err;
            return 'GitHub Advisory Database unavailable; continuing without GitHub advisory data';
          }
        },
      },
    ]);
  } else {
    const [osvSettled, githubAdvisorySettled] = await Promise.allSettled([
      queryOsvBatch(packages, cacheOpts, { verbose: options.verbose }),
      options.githubEnabled
        ? queryGithubAdvisoryBatch(packages, cacheOpts, githubToken, { verbose: options.verbose })
        : Promise.resolve([]),
    ]);

    if (osvSettled.status === 'fulfilled') {
      osvResults = osvSettled.value;
    } else {
      osvError = osvSettled.reason;
    }

    if (options.githubEnabled) {
      if (githubAdvisorySettled.status === 'fulfilled') {
        githubAdvisoryResults = githubAdvisorySettled.value;
      } else {
        githubAdvisoryError = githubAdvisorySettled.reason;
      }
    }
  }

  if (osvError) {
    console.warn(`Warning: OSV.dev query failed: ${sourceErrorMessage(osvError)}`);
    console.warn('Continuing without OSV.dev data...');
  } else {
    log(`  OSV.dev: ${countOsvVulnerabilities(osvResults)} vulnerabilities`, options.verbose);
  }

  if (!options.githubEnabled) {
    log('  GitHub Advisory Database: skipped (--no-github)', options.verbose);
  } else if (githubAdvisoryError) {
    console.warn(
      `Warning: GitHub Advisory Database query failed: ${sourceErrorMessage(githubAdvisoryError)}`,
    );
    console.warn('Continuing without GitHub advisory data...');
  } else {
    log(
      `  GitHub Advisory Database: ${countGithubVulnerabilities(githubAdvisoryResults)} vulnerabilities`,
      options.verbose,
    );
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
      if (useSpinners) {
        await tasks([
          {
            title: `Dependabot alerts (${repository})`,
            task: async () => {
              dependabotAlerts = await fetchDependabotAlerts(
                repository,
                cacheOpts,
                githubToken,
                options.githubAlertStates,
              );
              return `Dependabot alerts: ${dependabotAlerts.length} alerts`;
            },
          },
        ]);
      } else {
        dependabotAlerts = await fetchDependabotAlerts(
          repository,
          cacheOpts,
          githubToken,
          options.githubAlertStates,
          { verbose: options.verbose },
        );
      }
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
