export const OSV_API_BASE = 'https://api.osv.dev/v1';
export const NODE_BLOG_VULN_FEED = 'https://nodejs.org/en/blog/vulnerability';
export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_API_VERSION = '2022-11-28';
export const GITHUB_MEDIA_TYPE = 'application/vnd.github+json';

/** Single explicit override via --github-token-env (comma-separated for ordered fallbacks). */
export const DEFAULT_GITHUB_TOKEN_ENV = 'GITHUB_TOKEN';

/**
 * Auto-detected env var names when --github-token-env is omitted.
 * Order matters: first non-empty wins. Shell env takes precedence over .env file values.
 */
export const GITHUB_TOKEN_ENV_FALLBACKS = ['NPM_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;

/** Optional path to a file containing the token (used after env var fallbacks). */
export const GITHUB_TOKEN_FILE_ENV = 'GITHUB_TOKEN_FILE';
