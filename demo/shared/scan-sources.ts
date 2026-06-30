export interface ScanSourceToggles {
  osv: boolean;
  nodePosts: boolean;
  githubAdvisory: boolean;
  dependabot: boolean;
}

export const DEFAULT_SCAN_SOURCES: ScanSourceToggles = {
  osv: true,
  nodePosts: true,
  githubAdvisory: true,
  dependabot: true,
};

export function scanSourcesKey(sources: ScanSourceToggles): string {
  return [
    sources.osv ? '1' : '0',
    sources.nodePosts ? '1' : '0',
    sources.githubAdvisory ? '1' : '0',
    sources.dependabot ? '1' : '0',
  ].join('');
}

export function appendScanSourceParams(searchParams: URLSearchParams, sources: ScanSourceToggles): void {
  if (!sources.osv) searchParams.set('skipOsv', '1');
  if (!sources.nodePosts) searchParams.set('skipNodePosts', '1');
  if (!sources.githubAdvisory) searchParams.set('skipGithub', '1');
  if (!sources.dependabot) searchParams.set('skipDependabot', '1');
}

export function scanSourcesFromSearchParams(searchParams: URLSearchParams): ScanSourceToggles {
  return {
    osv: searchParams.get('skipOsv') !== '1',
    nodePosts: searchParams.get('skipNodePosts') !== '1',
    githubAdvisory: searchParams.get('skipGithub') !== '1',
    dependabot: searchParams.get('skipDependabot') !== '1',
  };
}
