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
    });

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  });
};
