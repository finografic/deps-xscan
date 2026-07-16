import { useEffect, useState } from 'react';
import type { RepoMeta } from '../data/types';

import { REPOS } from '../data/repos';
import { apiUrl } from './api-base-url';

export interface ScanTargetMeta {
  name: string;
  description: string | null;
  githubUrl: string;
}

function githubSlugFromUrl(repoUrl: string): string | null {
  try {
    const url = new URL(repoUrl);
    if (!['github.com', 'www.github.com'].includes(url.hostname)) {
      return null;
    }

    const [owner, repo] = url.pathname.split('/').filter(Boolean);
    if (!owner || !repo) {
      return null;
    }

    return `${owner}/${repo}`;
  } catch {
    return null;
  }
}

function presetRepoForSlug(slug: string): RepoMeta | undefined {
  return REPOS.find((repo) => `${repo.owner}/${repo.repo}` === slug);
}

function githubUrlFromRepo(repo: RepoMeta): string {
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

function githubUrlFromSlug(slug: string): string {
  return `https://github.com/${slug}`;
}

function githubUrlFromRepoUrl(repoUrl: string): string | null {
  const slug = githubSlugFromUrl(repoUrl);
  return slug ? githubUrlFromSlug(slug) : null;
}

function metaFromRepo(repo: RepoMeta): ScanTargetMeta {
  return {
    name: repo.title,
    description: repo.description,
    githubUrl: githubUrlFromRepo(repo),
  };
}

export function useScanTargetMeta(
  repo: RepoMeta | null,
  repoUrl: string | null,
  apiBaseUrl?: string,
): ScanTargetMeta | null {
  const [meta, setMeta] = useState<ScanTargetMeta | null>(null);

  useEffect(() => {
    if (repo) {
      setMeta(metaFromRepo(repo));
      return;
    }

    if (!repoUrl) {
      setMeta(null);
      return;
    }

    const slug = githubSlugFromUrl(repoUrl);
    const preset = slug ? presetRepoForSlug(slug) : undefined;
    if (preset) {
      setMeta(metaFromRepo(preset));
      return;
    }

    const controller = new AbortController();
    const fallbackUrl = githubUrlFromRepoUrl(repoUrl) ?? repoUrl;
    setMeta(
      slug
        ? { name: slug, description: null, githubUrl: githubUrlFromSlug(slug) }
        : { name: repoUrl, description: null, githubUrl: fallbackUrl },
    );

    void (async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/github-repo?repoUrl=${encodeURIComponent(repoUrl)}`, apiBaseUrl),
          {
            signal: controller.signal,
          },
        );
        if (!res.ok) return;

        const data = (await res.json()) as { fullName: string; description: string | null };
        if (!controller.signal.aborted) {
          setMeta({
            name: data.fullName,
            description: data.description,
            githubUrl: githubUrlFromSlug(data.fullName),
          });
        }
      } catch {
        // Keep slug fallback when metadata fetch fails.
      }
    })();

    return () => controller.abort();
  }, [apiBaseUrl, repo, repoUrl]);

  return meta;
}
