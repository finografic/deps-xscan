import { XscanTerminal } from 'components/XscanTerminal/XscanTerminal';
import { useEffect, useState } from 'react';
import { DEFAULT_SCAN_SOURCES, scanSourcesKey } from 'shared/scan-sources';
import type { RepoMeta } from 'data/types';
import type { ScanSourceToggles } from 'shared/scan-sources';

import { useScanTargetMeta } from 'lib/useScanTargetMeta';

interface ScanPaneProps {
  repo: RepoMeta | null;
  repoUrl: string | null;
  suggestions: RepoMeta[];
  onRepoUrlSubmit: (repoUrl: string) => void;
}

const SCAN_SOURCE_FIELDS: Array<{ key: keyof ScanSourceToggles; label: string }> = [
  { key: 'osv', label: 'OSV.dev' },
  { key: 'nodePosts', label: 'Node.js runtime advisories' },
  { key: 'githubAdvisory', label: 'GitHub Advisory Database' },
  { key: 'dependabot', label: 'Dependabot alerts' },
];

const GITHUB_REPO_URL_PATTERN = 'https://(www\\.)?github\\.com/[^/\\s]+/[^/\\s]+.*';

const XSCAN_TITLE = '@finografic/deps-xscan';
const XSCAN_SUBTITLE =
  'Supply-chain security scanner for GitHub projects. It analyzes resolved lockfile dependency trees and cross-checks them against:';

function repoUrlForSuggestion(repo: RepoMeta): string {
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

function suggestionClassName(repo: RepoMeta): string {
  const base = 'rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer';

  switch (repo.suggestionTone) {
    case 'findings':
      return `${base} bg-orange-200 text-orange-900 hover:bg-orange-300`;
    case 'maintained':
      return `${base} bg-green-200 text-green-800 hover:bg-green-300`;
    case 'large':
      return `${base} bg-amber-200 text-amber-900 hover:bg-amber-300`;
    default: {
      const _exhaustive: never = repo.suggestionTone;
      return _exhaustive;
    }
  }
}

export function ScanPane({ repo, repoUrl, suggestions, onRepoUrlSubmit }: ScanPaneProps) {
  const [repoUrlInput, setRepoUrlInput] = useState(repoUrl ?? '');
  const [scanSources, setScanSources] = useState<ScanSourceToggles>(DEFAULT_SCAN_SOURCES);
  const [activeScanSources, setActiveScanSources] = useState<ScanSourceToggles>(DEFAULT_SCAN_SOURCES);
  const hasScanTarget = Boolean(repo || repoUrl);
  const targetMeta = useScanTargetMeta(repo, repoUrl);

  const startScan = (nextRepoUrl: string) => {
    onRepoUrlSubmit(nextRepoUrl);
    setActiveScanSources(scanSources);
  };

  useEffect(() => {
    setRepoUrlInput(repoUrl ?? '');
  }, [repoUrl, repo?.id]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-none px-6 py-5">
        <h2 className="text-xl font-semibold text-foreground">{XSCAN_TITLE}</h2>
        <a
          className="text-sm font-semibold text-primary underline"
          href="https://github.com/finografic/deps-xscan"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://github.com/finografic/deps-xscan
        </a>
        <p className="mt-1 text-sm text-muted-foreground">{XSCAN_SUBTITLE}</p>
        <ul className="mt-3 grid list-disc grid-cols-2 gap-x-8 gap-y-1 pl-5 text-sm font-semibold text-muted-foreground">
          <li>OSV.dev</li>
          <li>Node.js runtime advisories</li>
          <li>GitHub Advisory Database</li>
          <li>Dependabot alerts</li>
        </ul>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden p-4 pt-2">
        <XscanTerminal
          key={`${repo?.id ?? repoUrl ?? 'standby'}-${scanSourcesKey(activeScanSources)}`}
          repoId={repo?.id ?? null}
          repoUrl={repoUrl}
          scanSources={activeScanSources}
          standby={!hasScanTarget}
        />
      </div>

      <fieldset className="flex flex-none flex-wrap gap-x-5 gap-y-2 px-6 pb-3">
        <legend className="sr-only">Scan sources</legend>
        {SCAN_SOURCE_FIELDS.map(({ key, label }) => {
          const fieldId = `scan-source-${key}`;

          return (
            <div key={key} className="flex items-center gap-2">
              <input
                id={fieldId}
                type="checkbox"
                className="size-4 rounded border border-border accent-primary"
                checked={scanSources[key]}
                onChange={(event) => {
                  setScanSources((current) => ({
                    ...current,
                    [key]: event.target.checked,
                  }));
                }}
              />
              <label htmlFor={fieldId} className="text-sm font-medium text-muted-foreground">
                {label}
              </label>
            </div>
          );
        })}
      </fieldset>

      <div className="flex flex-col px-6 pt-3">
        {hasScanTarget && targetMeta ? (
          <div>
            <h3 className="text-base font-bold text-foreground">Scan target: {targetMeta.name}</h3>
            <a
              className="text-sm font-semibold text-primary underline"
              href={targetMeta.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {targetMeta.githubUrl}
            </a>
            {targetMeta.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{targetMeta.description}</p>
            ) : null}
          </div>
        ) : (
          <div>
            <h3 className="text-base font-bold text-primary">Please enter a GitHub repository to scan</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter a GitHub repository URL or pick a suggestion below to start a live dependency scan.
            </p>
            <p className="mt-2 text-sm text-muted-foreground/70">
              Fetches lockfiles from GitHub, runs{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono font-semibold text-[14px] text-primary">
                xscan
              </code>{' '}
              on the demo API server.
            </p>
          </div>
        )}
      </div>

      <form
        className="mb-8 flex flex-none flex-col gap-3 px-6 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          startScan(repoUrlInput.trim());
        }}
      >
        <label className="sr-only" htmlFor="github-repo-url">
          GitHub repository URL
        </label>
        <div className="my-2 flex gap-3">
          <input
            id="github-repo-url"
            className="flex-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            type="url"
            inputMode="url"
            pattern={GITHUB_REPO_URL_PATTERN}
            placeholder="https://github.com/owner/repo"
            title="Enter a GitHub repository URL, for example https://github.com/owner/repo"
            value={repoUrlInput}
            onChange={(event) => setRepoUrlInput(event.target.value)}
            required
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Scan project vulnerabilities
          </button>
        </div>

        <div className="gap-2">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-muted-foreground">
              Suggested repos (click to scan):
            </span>
            <span className="text-sm text-muted-foreground ml-4">
              <span className="mr-3 inline-flex items-center gap-2 pt-1">
                <span className="size-3 rounded-full bg-orange-300" aria-hidden="true" />
                Likely findings
              </span>
              <span className="inline-flex items-center gap-2 ml-2">
                <span className="size-3 rounded-full bg-green-300" aria-hidden="true" />
                Maintained control
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {suggestions.map((suggestion) => {
              const suggestionUrl = repoUrlForSuggestion(suggestion);

              return (
                <button
                  key={suggestion.id}
                  className={suggestionClassName(suggestion)}
                  type="button"
                  title={
                    suggestion.suggestionTone === 'findings'
                      ? 'Likely findings — security training or intentionally vulnerable target'
                      : suggestion.suggestionTone === 'maintained'
                        ? 'Maintained control — active library or framework'
                        : 'Possibly heavy — test scan time before live demo'
                  }
                  onClick={() => {
                    setRepoUrlInput(suggestionUrl);
                    startScan(suggestionUrl);
                  }}
                >
                  {suggestion.title}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </div>
  );
}
