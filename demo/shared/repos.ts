export type SuggestionTone = 'findings' | 'maintained' | 'large';

export interface RepoMeta {
  id: string;
  owner: string;
  repo: string;
  title: string;
  description: string;
  tags: string[];
  dependabot: boolean;
  suggestionTone: SuggestionTone;
}

/** Curated suggestion pills for the scan URL form — mix of findings demos and maintained controls. */
export const REPOS: RepoMeta[] = [
  {
    id: 'nodejs-goof',
    owner: 'snyk-labs',
    repo: 'nodejs-goof',
    title: 'snyk-labs/nodejs-goof',
    description: 'Intentionally vulnerable Node.js demo app with npm lockfile coverage.',
    tags: ['npm', 'Vulnerable demo', 'Snyk'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'nodegoat',
    owner: 'OWASP',
    repo: 'NodeGoat',
    title: 'OWASP/NodeGoat',
    description: 'OWASP vulnerable Node.js training app with dependency history worth scanning.',
    tags: ['npm', 'OWASP', 'Training app'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'vulnerable-nodejs-application',
    owner: 'asecurityguru',
    repo: 'vulnerablenodejsapplication',
    title: 'asecurityguru/vulnerablenodejsapplication',
    description:
      'Small vulnerable Node.js training app; useful as a lightweight findings demo if package-lock is present.',
    tags: ['npm', 'Vulnerable demo', 'Training app'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'transitive-vulnerabilities',
    owner: 'ivrubtsov',
    repo: 'TransitiveVulnerabilities',
    title: 'ivrubtsov/TransitiveVulnerabilities',
    description:
      'Intentionally vulnerable app built to test transitive dependency remediation — strong qs/minimist chain coverage.',
    tags: ['npm', 'Vulnerable demo', 'Transitive deps'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'nodejs-vulnerable',
    owner: 'ivrubtsov',
    repo: 'Node.js-Vulnerable',
    title: 'ivrubtsov/Node.js-Vulnerable',
    description:
      'Sample app with outdated express, lodash, mongoose, and axios — good general-purpose SCA findings demo.',
    tags: ['npm', 'Vulnerable demo', 'Training app'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'vulnerable-web-app',
    owner: '0019-KDU',
    repo: 'vulnerable-web-app',
    title: '0019-KDU/vulnerable-web-app',
    description:
      'Classic intentionally vulnerable Express app with committed package-lock — reliable training and scanner demo.',
    tags: ['npm', 'Vulnerable demo', 'CTF', 'Training app'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'vulnerable-js-application',
    owner: 'themalka',
    repo: 'Vulnerable-JS-Application',
    title: 'themalka/Vulnerable-JS-Application',
    description:
      '60+ outdated 2017–2018 packages for SCA benchmarking — high findings volume; test scan time before live demo.',
    tags: ['npm', 'Vulnerable demo', 'SCA benchmark'],
    dependabot: true,
    suggestionTone: 'findings',
  },
  {
    id: 'koa',
    owner: 'koajs',
    repo: 'koa',
    title: 'koajs/koa',
    description: 'Lightweight Node.js web framework; useful as a smaller maintained framework scan.',
    tags: ['npm', 'Node.js', 'Framework', 'Middleware'],
    dependabot: true,
    suggestionTone: 'maintained',
  },
  {
    id: 'commander',
    owner: 'tj',
    repo: 'commander.js',
    title: 'tj/commander.js',
    description: 'Popular CLI library; useful for showing scanner behaviour on a smaller JavaScript package.',
    tags: ['npm', 'CLI', 'Library'],
    dependabot: true,
    suggestionTone: 'maintained',
  },
  {
    id: 'marked',
    owner: 'markedjs',
    repo: 'marked',
    title: 'markedjs/marked',
    description:
      'Markdown parser library; relevant to the AI markdown pipeline demo and typically much smaller than app repos.',
    tags: ['npm', 'Markdown', 'Parser', 'Library'],
    dependabot: true,
    suggestionTone: 'maintained',
  },
  {
    id: 'axios',
    owner: 'axios',
    repo: 'axios',
    title: 'axios/axios',
    description: 'Popular HTTP client library with package-lock scan inputs.',
    tags: ['npm', 'HTTP client', 'Library'],
    dependabot: true,
    suggestionTone: 'maintained',
  },
];

export function findRepo(id: string): RepoMeta | undefined {
  return REPOS.find((r) => r.id === id);
}
