export const SECURITY_SOURCE_IDS = {
  osv: 'osv',
  nodeBlog: 'node-blog',
  githubAdvisory: 'github-advisory',
  githubDependabot: 'github-dependabot',
} as const;

export type SecuritySourceId = (typeof SECURITY_SOURCE_IDS)[keyof typeof SECURITY_SOURCE_IDS];

export const SECURITY_SOURCE_LABELS: Record<SecuritySourceId, string> = {
  'osv': 'OSV.dev',
  'node-blog': 'Node.js Blog',
  'github-advisory': 'GitHub Advisory Database',
  'github-dependabot': 'Dependabot',
};
