import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GITHUB_API_BASE,
  GITHUB_API_VERSION,
  GITHUB_MEDIA_TYPE,
  SCAN_INPUT_PATHS,
  SUPPORTED_LOCKFILES,
  TOKEN_ENV_NAMES,
} from './constants.js';

export interface MaterializedProject {
  directory: string;
  owner: string;
  repo: string;
  ref: string;
  filesWritten: string[];
  warnings: string[];
}

function resolveToken(): string | undefined {
  for (const name of TOKEN_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': GITHUB_MEDIA_TYPE,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'deps-xscan-demo',
  };
  const token = resolveToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchRepoApi(owner: string, repo: string): Promise<Response> {
  return fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: githubHeaders(),
  });
}

export async function fetchGithubRepoMeta(
  owner: string,
  repo: string,
): Promise<{ fullName: string; description: string | null }> {
  const res = await fetchRepoApi(owner, repo);
  if (!res.ok) {
    return { fullName: `${owner}/${repo}`, description: null };
  }

  const meta = (await res.json()) as { full_name?: string; description?: string | null };
  return {
    fullName: meta.full_name ?? `${owner}/${repo}`,
    description: meta.description?.trim() || null,
  };
}

async function fetchDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetchRepoApi(owner, repo);
  if (!res.ok) {
    throw new Error(`GitHub repo lookup failed (${res.status}) for ${owner}/${repo}`);
  }
  const meta = (await res.json()) as { default_branch: string };
  return meta.default_branch;
}

async function fetchRawFile(owner: string, repo: string, ref: string, path: string): Promise<string | null> {
  const refPath = ref.split('/').map(encodeURIComponent).join('/');
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${refPath}/${path}`;
  const res = await fetch(rawUrl, { headers: githubHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return res.text();
}

export async function materializeGithubProject(
  owner: string,
  repo: string,
  ref?: string,
): Promise<MaterializedProject> {
  const resolvedRef = ref || (await fetchDefaultBranch(owner, repo));
  const directory = mkdtempSync(join(tmpdir(), 'xscan-demo-'));
  mkdirSync(directory, { recursive: true });

  const filesWritten: string[] = [];
  const warnings: string[] = [];

  for (const path of SCAN_INPUT_PATHS) {
    const content = await fetchRawFile(owner, repo, resolvedRef, path);
    if (content == null) continue;
    writeFileSync(join(directory, path), content, 'utf-8');
    filesWritten.push(path);
    if (path === 'yarn.lock') {
      warnings.push('yarn.lock present — xscan does not parse yarn lockfiles yet.');
    }
  }

  const hasLockfile = SUPPORTED_LOCKFILES.some((name) => filesWritten.includes(name));
  if (!hasLockfile) {
    throw new Error(
      `No pnpm-lock.yaml or package-lock.json in ${owner}/${repo}@${resolvedRef}. ` +
        (filesWritten.includes('yarn.lock') ? 'Repo appears yarn-only.' : 'Not a scannable Node lockfile.'),
    );
  }

  if (!filesWritten.includes('package.json')) {
    warnings.push('package.json missing — direct/dev/peer labels will be degraded.');
  }

  return { directory, owner, repo, ref: resolvedRef, filesWritten, warnings };
}
