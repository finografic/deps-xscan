import type { CommandHandler } from '@finografic/cli-kit/commands';
import { createFlowContext } from '@finografic/cli-kit/flow';
import { withHelp } from '@finografic/cli-kit/render-help';

import type { OutputFormat } from 'lib/report.utils';

import { scanHelp } from './scan.help';
import { runScanPipeline } from './scan.logic';

const SCAN_FLAG_DEFS = {
  'project': { type: 'string' as const, description: 'Project root directory' },
  'cache-ttl': { type: 'number' as const, description: 'Cache TTL in hours' },
  'no-cache': { type: 'boolean' as const, description: 'Disable caching' },
  'format': { type: 'string' as const, description: 'Output format: terminal | json | both' },
  'node-posts': { type: 'number' as const, description: 'Number of Node.js security posts' },
  'json-out': { type: 'string' as const, description: 'JSON report output path' },
  'verbose': { alias: 'v', type: 'boolean' as const, description: 'Verbose progress output' },
  'skip-osv': { type: 'boolean' as const, description: 'Skip OSV.dev vulnerability queries' },
  'skip-node-posts': { type: 'boolean' as const, description: 'Skip Node.js runtime security post scraping' },
  'skip-github': { type: 'boolean' as const, description: 'Skip GitHub Advisory Database queries' },
  'skip-dependabot': { type: 'boolean' as const, description: 'Skip Dependabot alert fetching' },
  'remote-repo': { type: 'string' as const, description: 'Remote owner/repo for Dependabot alerts' },
  'github-alert-states': {
    type: 'string' as const,
    description: 'Dependabot alert states (comma-separated, default: open)',
  },
  'github-token-env': {
    type: 'string' as const,
    description: 'Env var(s) for GitHub token, comma-separated (default: NPM_TOKEN, GH_TOKEN, GITHUB_TOKEN)',
  },
};

export const runScanCommand: CommandHandler = async ({ argv, cwd }) => {
  await withHelp(argv, scanHelp, async () => {
    const flow = createFlowContext(argv, SCAN_FLAG_DEFS);

    const formatInput = flow.flags.format || 'both';
    const format: OutputFormat =
      formatInput === 'terminal' || formatInput === 'json' || formatInput === 'both' ? formatInput : 'both';

    const exitCode = await runScanPipeline({
      project: flow.flags.project || cwd,
      cacheTtl: flow.flags['cache-ttl'] || 24,
      noCache: flow.flags['no-cache'] ?? false,
      format,
      nodePosts: flow.flags['node-posts'] || 5,
      jsonOut: flow.flags['json-out'] || undefined,
      verbose: flow.flags.verbose ?? false,
      osvEnabled: !(flow.flags['skip-osv'] ?? false),
      nodePostsEnabled: !(flow.flags['skip-node-posts'] ?? false),
      githubEnabled: !(flow.flags['skip-github'] ?? false),
      dependabot: !(flow.flags['skip-dependabot'] ?? false),
      remoteRepo: flow.flags['remote-repo'] || undefined,
      githubAlertStates: parseAlertStates(flow.flags['github-alert-states']),
      githubTokenEnv: flow.flags['github-token-env'] || undefined,
    });

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  });
};

function parseAlertStates(raw: string | undefined): string[] {
  if (!raw) return ['open'];
  const states = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return states.length > 0 ? states : ['open'];
}
