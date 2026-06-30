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
import { FETCHING_SOURCES_BANNER, printTitleBanner, skippedSourceLabel } from 'lib/tui.utils';

export interface ScanOptions {
  project: string;
  cacheTtl: number;
  noCache: boolean;
  format: OutputFormat;
  nodePosts: number;
  jsonOut?: string;
  verbose: boolean;
  osvEnabled: boolean;
  nodePostsEnabled: boolean;
  githubEnabled: boolean;
  dependabot: boolean;
  remoteRepo?: string;
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
  const forceProgress = process.env.DEMO_XSCAN_FORCE_PROGRESS === '1';
  return ((process.stdout.isTTY ?? false) || forceProgress) && !verbose;
}

function usesTerminalOutput(format: OutputFormat): boolean {
  return format === 'terminal' || format === 'both';
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
  const packages = lockResult.deps.map((d) => ({
    name: d.name,
    version: d.version,
  }));
  const githubToken = resolveGithubToken(options.githubTokenEnv);

  let posts: ScrapedPost[] = [];
  let osvResults: OsvQueryResult[] = packages.map((p) => ({
    packageName: p.name,
    packageVersion: p.version,
    vulnerabilities: [],
  }));
  let githubAdvisoryResults: GithubAdvisoryQueryResult[] = [];
  let dependabotAlerts: GithubDependabotAlert[] = [];
  let osvError: unknown;
  let githubAdvisoryError: unknown;

  if (useSpinners && usesTerminalOutput(options.format)) {
    printTitleBanner(FETCHING_SOURCES_BANNER);
    await tasks(
      buildSourceTasks(options, cacheOpts, packages, githubToken, {
        posts: (value) => {
          posts = value;
        },
        osvResults: (value) => {
          osvResults = value;
        },
        githubAdvisoryResults: (value) => {
          githubAdvisoryResults = value;
        },
        dependabotAlerts: (value) => {
          dependabotAlerts = value;
        },
        osvError: (value) => {
          osvError = value;
        },
        githubAdvisoryError: (value) => {
          githubAdvisoryError = value;
        },
      }),
    );
  } else {
    await runSourcesWithoutSpinners(options, cacheOpts, packages, githubToken, {
      posts: (value) => {
        posts = value;
      },
      osvResults: (value) => {
        osvResults = value;
      },
      githubAdvisoryResults: (value) => {
        githubAdvisoryResults = value;
      },
      dependabotAlerts: (value) => {
        dependabotAlerts = value;
      },
      osvError: (value) => {
        osvError = value;
      },
      githubAdvisoryError: (value) => {
        githubAdvisoryError = value;
      },
    });
  }

  if (!options.osvEnabled) {
    log('  OSV.dev: skipped (--skip-osv)', options.verbose);
  } else if (osvError) {
    console.warn(`Warning: OSV.dev query failed: ${sourceErrorMessage(osvError)}`);
    console.warn('Continuing without OSV.dev data...');
  } else {
    log(`  OSV.dev: ${countOsvVulnerabilities(osvResults)} vulnerabilities`, options.verbose);
  }

  if (!options.githubEnabled) {
    log('  GitHub Advisory Database: skipped (--skip-github)', options.verbose);
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

  if (!options.dependabot) {
    log('  Dependabot alerts: skipped (--skip-dependabot)', options.verbose);
  } else {
    log(`  Dependabot: ${dependabotAlerts.length} open alerts`, options.verbose);
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

interface SourceRunSink {
  posts: (value: ScrapedPost[]) => void;
  osvResults: (value: OsvQueryResult[]) => void;
  githubAdvisoryResults: (value: GithubAdvisoryQueryResult[]) => void;
  dependabotAlerts: (value: GithubDependabotAlert[]) => void;
  osvError: (value: unknown) => void;
  githubAdvisoryError: (value: unknown) => void;
}

function buildSourceTasks(
  options: ScanOptions,
  cacheOpts: Partial<CacheOptions>,
  packages: Array<{ name: string; version: string }>,
  githubToken: string | undefined,
  sink: SourceRunSink,
) {
  const repository = options.remoteRepo || detectGithubRepo(options.project);

  return [
    {
      title: `Node.js security posts (${options.nodePosts} posts)`,
      task: async () => {
        if (!options.nodePostsEnabled) {
          return skippedSourceLabel('Node.js security posts');
        }
        try {
          const posts = await scrapeNodeSecurityPosts(options.nodePosts, cacheOpts);
          sink.posts(posts);
          const totalCves = posts.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
          return `Node.js security posts: ${posts.length} posts, ${totalCves} CVEs`;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`Warning: Could not fetch Node.js security posts: ${message}`);
          console.warn('Continuing without Node.js security post data...');
          sink.posts([]);
          return 'Node.js security posts unavailable; continuing without Node.js post data';
        }
      },
    },
    {
      title: `OSV.dev (${packages.length} package versions)`,
      task: async (message: (value: string) => void) => {
        if (!options.osvEnabled) {
          return skippedSourceLabel('OSV.dev');
        }
        try {
          const osvResults = await queryOsvBatch(packages, cacheOpts, {
            onProgress: (completed, total) => {
              message(`OSV.dev (${completed} / ${total} package versions)`);
            },
          });
          sink.osvResults(osvResults);
          return `OSV.dev: ${countOsvVulnerabilities(osvResults)} vulnerabilities`;
        } catch (err: unknown) {
          sink.osvError(err);
          return 'OSV.dev unavailable; continuing without OSV data';
        }
      },
    },
    {
      title: `GitHub Advisory Database (${packages.length} package versions)`,
      task: async (message: (value: string) => void) => {
        if (!options.githubEnabled) {
          return skippedSourceLabel('GitHub Advisory Database');
        }
        try {
          const githubAdvisoryResults = await queryGithubAdvisoryBatch(packages, cacheOpts, githubToken, {
            onProgress: (completed, total) => {
              message(`GitHub Advisory Database (${completed} / ${total} package versions)`);
            },
          });
          sink.githubAdvisoryResults(githubAdvisoryResults);
          return `GitHub Advisory Database: ${countGithubVulnerabilities(githubAdvisoryResults)} vulnerabilities`;
        } catch (err: unknown) {
          sink.githubAdvisoryError(err);
          return 'GitHub Advisory Database unavailable; continuing without GitHub advisory data';
        }
      },
    },
    {
      title: repository ? `Dependabot alerts (${repository})` : 'Dependabot alerts',
      task: async () => {
        if (!options.dependabot) {
          return skippedSourceLabel('Dependabot alerts');
        }
        if (!repository) {
          console.warn('Warning: Could not detect GitHub repository for Dependabot alerts.');
          console.warn('  Use --remote-repo owner/repo or run from a git clone with a GitHub origin remote.');
          return skippedSourceLabel('Dependabot alerts');
        }
        if (!githubToken) {
          console.warn(
            `Warning: ${githubTokenEnvLabel(options.githubTokenEnv)} not set — Dependabot alerts require a GitHub token.`,
          );
          console.warn(
            '  Add a token to the project .env (e.g. NPM_TOKEN), export it in your shell, or set GITHUB_TOKEN_FILE.',
          );
          return skippedSourceLabel('Dependabot alerts');
        }
        const dependabotAlerts = await fetchDependabotAlerts(
          repository,
          cacheOpts,
          githubToken,
          options.githubAlertStates,
        );
        sink.dependabotAlerts(dependabotAlerts);
        return `Dependabot alerts: ${dependabotAlerts.length} alerts`;
      },
    },
  ];
}

async function runSourcesWithoutSpinners(
  options: ScanOptions,
  cacheOpts: Partial<CacheOptions>,
  packages: Array<{ name: string; version: string }>,
  githubToken: string | undefined,
  sink: SourceRunSink,
): Promise<void> {
  if (!options.nodePostsEnabled) {
    log('Stage 2: Node.js security posts skipped (--skip-node-posts)', options.verbose);
  } else {
    log(`Stage 2: Scraping last ${options.nodePosts} Node.js security posts...`, options.verbose);
    try {
      const posts = await scrapeNodeSecurityPosts(options.nodePosts, cacheOpts, { verbose: options.verbose });
      sink.posts(posts);
      const totalCves = posts.reduce((sum, p) => sum + p.vulnerabilities.length, 0);
      log(`  Extracted ${totalCves} CVEs from ${posts.length} posts`, options.verbose);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Warning: Could not fetch Node.js security posts: ${message}`);
      console.warn('Continuing without Node.js security post data...');
      sink.posts([]);
    }
  }

  log(`Stage 3: Querying OSV.dev and GitHub for ${packages.length} packages...`, options.verbose);

  const [osvSettled, githubAdvisorySettled] = await Promise.allSettled([
    options.osvEnabled
      ? queryOsvBatch(packages, cacheOpts, { verbose: options.verbose })
      : Promise.resolve(null),
    options.githubEnabled
      ? queryGithubAdvisoryBatch(packages, cacheOpts, githubToken, { verbose: options.verbose })
      : Promise.resolve(null),
  ]);

  if (options.osvEnabled) {
    if (osvSettled.status === 'fulfilled' && osvSettled.value) {
      sink.osvResults(osvSettled.value);
    } else if (osvSettled.status === 'rejected') {
      sink.osvError(osvSettled.reason);
    }
  }

  if (options.githubEnabled) {
    if (githubAdvisorySettled.status === 'fulfilled' && githubAdvisorySettled.value) {
      sink.githubAdvisoryResults(githubAdvisorySettled.value);
    } else if (githubAdvisorySettled.status === 'rejected') {
      sink.githubAdvisoryError(githubAdvisorySettled.reason);
    }
  }

  if (!options.dependabot) {
    log('Stage 4: Dependabot alerts skipped (--skip-dependabot)', options.verbose);
    return;
  }

  log('Stage 4: Fetching Dependabot alerts...', options.verbose);
  const repository = options.remoteRepo || detectGithubRepo(options.project);
  if (!repository) {
    console.warn('Warning: Could not detect GitHub repository for Dependabot alerts.');
    console.warn('  Use --remote-repo owner/repo or run from a git clone with a GitHub origin remote.');
    return;
  }
  if (!githubToken) {
    console.warn(
      `Warning: ${githubTokenEnvLabel(options.githubTokenEnv)} not set — Dependabot alerts require a GitHub token.`,
    );
    console.warn(
      '  Add a token to the project .env (e.g. NPM_TOKEN), export it in your shell, or set GITHUB_TOKEN_FILE.',
    );
    return;
  }

  log(`  Repository: ${repository}`, options.verbose);
  const dependabotAlerts = await fetchDependabotAlerts(
    repository,
    cacheOpts,
    githubToken,
    options.githubAlertStates,
    { verbose: options.verbose },
  );
  sink.dependabotAlerts(dependabotAlerts);
}
