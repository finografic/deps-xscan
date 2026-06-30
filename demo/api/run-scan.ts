import { existsSync, rmSync } from 'node:fs';
import type { ScanSourceToggles } from '../shared/scan-sources.js';

import { REPO_ROOT, XSCAN_CLI, demoSkipsCache } from './constants.js';
import { materializeGithubProject } from './materialize-github.js';
import { spawnScanProcess } from './spawn-scan.js';

export interface ScanStreamOptions {
  owner: string;
  repo: string;
  sources: ScanSourceToggles;
  onChunk: (chunk: string) => void;
  onDone: (exitCode: number) => void;
  onError: (message: string) => void;
}

function cleanupProjectDir(directory: string | undefined): void {
  if (!directory) return;
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

export async function streamGithubScan(options: ScanStreamOptions): Promise<void> {
  if (!existsSync(XSCAN_CLI)) {
    options.onError(
      `xscan build not found at ${XSCAN_CLI}. Run: pnpm build (from repo root) or pnpm predev in demo/.`,
    );
    options.onDone(2);
    return;
  }

  let projectDir: string | undefined;

  const finish = (exitCode: number) => {
    cleanupProjectDir(projectDir);
    options.onDone(exitCode);
  };

  try {
    const materialized = await materializeGithubProject(options.owner, options.repo);
    projectDir = materialized.directory;

    for (const warning of materialized.warnings) {
      options.onChunk(`\x1b[33m[demo]\x1b[0m ${warning}\n`);
    }
    options.onChunk(
      `\x1b[2m[demo] Materialized ${materialized.filesWritten.join(', ')} @ ${materialized.ref}\x1b[0m\n\n`,
    );

    const slug = `${options.owner}/${options.repo}`;
    const args = [
      'scan',
      '--project',
      materialized.directory,
      '--format',
      'terminal',
      ...(demoSkipsCache() ? ['--no-cache'] : []),
      ...(options.sources.osv ? [] : ['--skip-osv']),
      ...(options.sources.nodePosts ? [] : ['--skip-node-posts']),
      ...(options.sources.githubAdvisory ? [] : ['--skip-github']),
      ...(options.sources.dependabot ? ['--remote-repo', slug] : ['--skip-dependabot']),
    ];

    options.onChunk(`\x1b[2m$ node ${XSCAN_CLI} ${args.join(' ')}\x1b[0m\n\n`);

    spawnScanProcess(XSCAN_CLI, args, REPO_ROOT, {
      onChunk: options.onChunk,
      onError: options.onError,
      onExit: finish,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    options.onError(message);
    finish(2);
  }
}
