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
    { flag: '--no-github', description: 'Disable GitHub Advisory Database checks (enabled by default)' },
    { flag: '--dependabot', description: 'Fetch Dependabot alerts for the repository (requires token)' },
    { flag: '--github-repo <owner/repo>', description: 'GitHub repository for Dependabot alerts' },
    {
      flag: '--github-alert-states <states>',
      description: 'Dependabot alert states, comma-separated (default: open)',
    },
    { flag: '--github-token-env <names>', description: 'Env var(s) for GitHub token, comma-separated' },
    { flag: '-h, --help', description: 'Show this help' },
  ],
  examples: [
    { command: 'xscan scan', description: 'Scan the current project with default settings' },
    { command: 'xscan scan --project ./my-app --format terminal', description: 'Terminal-only report' },
    {
      command: 'xscan scan --dependabot --project ./my-app',
      description: 'Include Dependabot alerts (reads NPM_TOKEN or GITHUB_TOKEN from .env)',
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
    'Optionally fetch Dependabot alerts when --dependabot is set',
    'Correlate and deduplicate findings, then emit a report',
  ],
};
