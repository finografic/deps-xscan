import type { CommandHelpConfig } from '@finografic/cli-kit/render-help';

export const scanHelp: CommandHelpConfig = {
  command: 'xscan scan',
  description: 'Deep dependency security analysis across OSV.dev and Node.js advisories',
  usage: 'xscan scan [options]',
  options: [
    { flag: '--project <path>', description: 'Project root directory (default: current directory)' },
    { flag: '--cache-ttl <hours>', description: 'Cache TTL in hours (default: 24)' },
    { flag: '--no-cache', description: 'Disable caching entirely' },
    { flag: '--format <type>', description: 'Output format: terminal | json | both (default: both)' },
    { flag: '--node-posts <n>', description: 'Number of Node.js security posts to scan (default: 5)' },
    { flag: '--json-out <path>', description: 'Path for JSON report output' },
    { flag: '-v, --verbose', description: 'Show detailed progress' },
    { flag: '-h, --help', description: 'Show this help' },
  ],
  examples: [
    { command: 'xscan scan', description: 'Scan the current project with default settings' },
    { command: 'xscan scan --project ./my-app --format terminal', description: 'Terminal-only report' },
    {
      command: 'xscan scan --no-cache --node-posts 10 --verbose',
      description: 'Fresh scan with verbose output',
    },
  ],
  howItWorks: [
    'Parse the lockfile and resolve the full dependency tree',
    'Scrape recent Node.js security blog posts for runtime CVEs',
    'Query OSV.dev for each resolved package version',
    'Correlate and deduplicate findings, then emit a report',
  ],
};
