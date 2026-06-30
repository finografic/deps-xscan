import type { CommandHelpConfig } from '@finografic/cli-kit/render-help';

export const scanHelp: CommandHelpConfig = {
  command: 'xscan scan',
  description: 'Deep dependency security analysis across OSV.dev, Node.js advisories, and GitHub',
  usage: 'xscan scan [options]',
  options: [
    { flag: '--project <path>', description: 'Project root directory (default: current directory)' },
    { flag: '--cache-ttl <hours>', description: 'Cache TTL in hours (default: 24)' },
    { flag: '--no-cache', description: 'Disable caching entirely' },
    { flag: '--format <type>', description: 'Output format: terminal | json | both (default: both)' },
    { flag: '--node-posts <n>', description: 'Number of Node.js security posts to scan (default: 5)' },
    { flag: '--json-out <path>', description: 'Path for JSON report output' },
    { flag: '-v, --verbose', description: 'Show detailed progress' },
    { flag: '--skip-osv', description: 'Skip OSV.dev vulnerability queries (enabled by default)' },
    {
      flag: '--skip-node-posts',
      description: 'Skip Node.js runtime security post scraping (enabled by default)',
    },
    { flag: '--skip-github', description: 'Skip GitHub Advisory Database queries (enabled by default)' },
    { flag: '--skip-dependabot', description: 'Skip Dependabot alert fetching (enabled by default)' },
    {
      flag: '--remote-repo <owner/repo>',
      description: 'Remote repository for Dependabot alerts (auto-detected from git origin)',
    },
    {
      flag: '--github-alert-states <states>',
      description: 'Dependabot alert states, comma-separated (default: open)',
    },
    { flag: '--github-token-env <names>', description: 'Env var(s) for GitHub token, comma-separated' },
    { flag: '-h, --help', description: 'Show this help' },
  ],
  examples: [
    { command: 'xscan scan', description: 'Scan the current project with all sources enabled' },
    { command: 'xscan scan --project ./my-app --format terminal', description: 'Terminal-only report' },
    {
      command: 'xscan scan --skip-github --project ./my-app',
      description: 'Skip slow GitHub Advisory Database queries',
    },
    {
      command: 'xscan scan --skip-dependabot --project ./my-app',
      description: 'Skip Dependabot alerts when no token is available',
    },
    {
      command: 'xscan scan --project /tmp/checkout --remote-repo owner/repo',
      description: 'Scan a materialized checkout and pin the remote repo for Dependabot',
    },
    {
      command: 'xscan scan --no-cache --node-posts 10 --verbose',
      description: 'Fresh scan with verbose output',
    },
  ],
  howItWorks: [
    'Parse the lockfile and resolve the full dependency tree',
    'Scrape recent Node.js security blog posts for runtime CVEs',
    'Query OSV.dev and GitHub Advisory Database for each resolved package version',
    'Fetch Dependabot alerts when a GitHub repo and token are available',
    'Correlate and deduplicate findings, then emit a report',
  ],
};
