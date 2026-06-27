import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadProjectEnv } from 'lib/env.utils';
import { resolveGithubToken } from 'lib/github-source.utils';

describe('loadProjectEnv', () => {
  const originalEnv = { ...process.env };
  let tempDir = '';

  afterEach(() => {
    process.env = { ...originalEnv };
    tempDir = '';
  });

  it('loads variables from .env without overriding shell env', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'xscan-env-'));
    writeFileSync(join(tempDir, '.env'), 'NPM_TOKEN=from-file\nOTHER=value\n');

    process.env.NPM_TOKEN = 'from-shell';

    loadProjectEnv(tempDir);

    expect(process.env.NPM_TOKEN).toBe('from-shell');
    expect(process.env.OTHER).toBe('value');
  });
});

describe('resolveGithubToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers NPM_TOKEN in default fallback chain', () => {
    process.env.NPM_TOKEN = 'npm-pat';
    process.env.GITHUB_TOKEN = 'gh-token';

    expect(resolveGithubToken()).toBe('npm-pat');
  });

  it('falls back to GITHUB_TOKEN when NPM_TOKEN is absent', () => {
    delete process.env.NPM_TOKEN;
    delete process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = 'gh-token';

    expect(resolveGithubToken()).toBe('gh-token');
  });

  it('supports comma-separated --github-token-env names', () => {
    process.env.CUSTOM_A = '';
    process.env.CUSTOM_B = 'winner';

    expect(resolveGithubToken('CUSTOM_A,CUSTOM_B')).toBe('winner');
  });
});
