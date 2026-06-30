import type { IncomingMessage, ServerResponse } from 'node:http';

import { scanSourcesFromSearchParams } from '../shared/scan-sources.js';
import { githubSlugFromUrl } from './github-url.js';
import { fetchGithubRepoMeta } from './materialize-github.js';
import { findRepo } from './repos.js';
import { streamGithubScan } from './run-scan.js';

interface ScanTarget {
  owner: string;
  repo: string;
}

function writeSse(res: ServerResponse, event: string, data: string): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function scanTargetFromGithubUrl(repoUrl: string): ScanTarget | null {
  const slug = githubSlugFromUrl(repoUrl);
  if (!slug) {
    return null;
  }

  return { owner: slug.owner, repo: slug.repo };
}

function handleGithubRepo(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const repoUrl = url.searchParams.get('repoUrl');
  if (!repoUrl) {
    res.statusCode = 400;
    res.end('Missing repoUrl');
    return;
  }

  const slug = githubSlugFromUrl(repoUrl);
  if (!slug) {
    res.statusCode = 400;
    res.end(`Invalid GitHub repository URL: ${repoUrl}`);
    return;
  }

  void (async () => {
    try {
      const meta = await fetchGithubRepoMeta(slug.owner, slug.repo);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(meta));
    } catch {
      res.statusCode = 502;
      res.end('Failed to fetch GitHub repository metadata');
    }
  })();
}

function handleScan(_req: IncomingMessage, res: ServerResponse, url: URL): void {
  const repoId = url.searchParams.get('repoId');
  const repoUrl = url.searchParams.get('repoUrl');
  if (!repoId && !repoUrl) {
    res.statusCode = 400;
    res.end('Missing repoId or repoUrl');
    return;
  }

  const preset = repoId ? findRepo(repoId) : undefined;
  const target = repoUrl
    ? scanTargetFromGithubUrl(repoUrl)
    : preset
      ? { owner: preset.owner, repo: preset.repo }
      : null;

  if (!target) {
    res.statusCode = repoUrl ? 400 : 404;
    res.end(repoUrl ? `Invalid GitHub repository URL: ${repoUrl}` : `Unknown repoId: ${repoId}`);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  writeSse(res, 'start', `${target.owner}/${target.repo}`);

  const sources = scanSourcesFromSearchParams(url.searchParams);

  void streamGithubScan({
    owner: target.owner,
    repo: target.repo,
    sources,
    onChunk: (chunk) => writeSse(res, 'output', chunk),
    onError: (message) => writeSse(res, 'error', message),
    onDone: (exitCode) => {
      writeSse(res, 'exit', String(exitCode));
      res.end();
    },
  });
}

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/github-repo') {
    handleGithubRepo(req, res, url);
    return;
  }

  if (url.pathname === '/api/scan') {
    handleScan(req, res, url);
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
}
