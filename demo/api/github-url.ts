export interface GithubRepoSlug {
  owner: string;
  repo: string;
}

export function githubSlugFromUrl(repoUrl: string): GithubRepoSlug | null {
  try {
    const url = new URL(repoUrl);
    if (!['github.com', 'www.github.com'].includes(url.hostname)) {
      return null;
    }

    const [owner, repo] = url.pathname.split('/').filter(Boolean);
    if (!owner || !repo) {
      return null;
    }

    return { owner, repo };
  } catch {
    return null;
  }
}
