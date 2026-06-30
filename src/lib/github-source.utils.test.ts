import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('node-fetch', () => ({
  default: (...args: unknown[]) => fetchMock(...args),
}));

import {
  fetchDependabotAlerts,
  parseGithubRepoFromRemote,
  queryGithubAdvisoryBatch,
  queryGithubAdvisorySingle,
} from 'lib/github-source.utils';

describe('parseGithubRepoFromRemote', () => {
  it('parses SSH remotes', () => {
    expect(parseGithubRepoFromRemote('git@github.com:finografic/cv-justin-rankin-v1.git')).toBe(
      'finografic/cv-justin-rankin-v1',
    );
  });

  it('parses HTTPS remotes', () => {
    expect(parseGithubRepoFromRemote('https://github.com/finografic/deps-xscan.git')).toBe(
      'finografic/deps-xscan',
    );
  });

  it('returns null for non-GitHub remotes', () => {
    expect(parseGithubRepoFromRemote('git@gitlab.com:org/repo.git')).toBeNull();
  });
});

describe('queryGithubAdvisorySingle', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('maps advisory fields from GitHub API response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
          cve_id: 'CVE-2025-6545',
          summary: 'PBKDF2 weak key generation',
          description: 'Critical issue in pbkdf2',
          severity: 'critical',
          published_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-02-01T00:00:00Z',
          references: [{ url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz' }],
          cvss: { score: 9.8, vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' },
          epss: { percentage: 0.42 },
          cwes: [{ cwe_id: 'CWE-327' }],
          vulnerabilities: [
            {
              package: { name: 'pbkdf2', ecosystem: 'npm' },
              vulnerable_version_range: '>= 3.0.10, <= 3.1.2',
              first_patched_version: { identifier: '3.1.3' },
            },
          ],
        },
      ],
    });

    const result = await queryGithubAdvisorySingle('pbkdf2', '3.1.2', { disabled: true });

    expect(result.packageName).toBe('pbkdf2');
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.vulnerabilities[0]).toMatchObject({
      id: 'GHSA-xxxx-yyyy-zzzz',
      severity: 'Critical',
      fixedIn: '3.1.3',
      affectedVersions: '>= 3.0.10, <= 3.1.2',
      epssPercentage: 0.42,
      cwes: ['CWE-327'],
    });
  });

  it('returns empty vulnerabilities on API failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
    });

    const result = await queryGithubAdvisorySingle('lodash', '4.17.20', { disabled: true });
    expect(result.vulnerabilities).toEqual([]);
  });
});

describe('queryGithubAdvisoryBatch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it('reports progress after each package version', async () => {
    const progress: Array<[number, number]> = [];
    const packages = [
      { name: 'a', version: '1.0.0' },
      { name: 'b', version: '2.0.0' },
      { name: 'a', version: '1.0.0' },
    ];

    await queryGithubAdvisoryBatch(packages, { disabled: true }, undefined, {
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchDependabotAlerts', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('returns empty array without token', async () => {
    const alerts = await fetchDependabotAlerts('finografic/cv-justin-rankin-v1', { disabled: true });
    expect(alerts).toEqual([]);
  });

  it('maps Dependabot alert fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => [
        {
          number: 42,
          state: 'open',
          html_url: 'https://github.com/finografic/cv-justin-rankin-v1/security/dependabot/42',
          dependency: {
            package: { name: 'pbkdf2', ecosystem: 'npm' },
            manifest_path: 'yarn.lock',
            scope: 'runtime',
            version: '3.1.2',
          },
          security_advisory: {
            ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
            cve_id: 'CVE-2025-6545',
            summary: 'pbkdf2 critical vulnerability',
            description: 'Weak key generation',
            severity: 'critical',
            references: [{ url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz' }],
          },
          security_vulnerability: {
            package: { name: 'pbkdf2', ecosystem: 'npm' },
            vulnerable_version_range: '>= 3.0.10, <= 3.1.2',
            first_patched_version: { identifier: '3.1.3' },
          },
        },
      ],
    });

    const alerts = await fetchDependabotAlerts(
      'finografic/cv-justin-rankin-v1',
      { disabled: true },
      'test-token',
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      packageName: 'pbkdf2',
      packageVersion: '3.1.2',
      severity: 'Critical',
      fixedIn: '3.1.3',
      manifestPath: 'yarn.lock',
      scope: 'runtime',
      alertState: 'open',
    });
  });
});
