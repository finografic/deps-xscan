import { describe, expect, it } from 'vitest';

import { correlate } from 'lib/correlate.utils';
import type { GithubAdvisoryQueryResult, GithubDependabotAlert } from 'lib/github-source.utils';
import type { ResolvedDep } from 'lib/lockfile.utils';
import type { OsvQueryResult } from 'lib/osv.utils';

const deps: ResolvedDep[] = [
  {
    name: 'pbkdf2',
    version: '3.1.2',
    isDirect: false,
    isPeer: false,
    dependencyKind: 'transitive',
    dependencyPaths: [['webpack', 'crypto-browserify', 'pbkdf2']],
  },
];

describe('correlate GitHub sources', () => {
  it('merges OSV and GitHub advisory findings by GHSA', () => {
    const osvResults: OsvQueryResult[] = [
      {
        packageName: 'pbkdf2',
        packageVersion: '3.1.2',
        vulnerabilities: [
          {
            id: 'GHSA-xxxx-yyyy-zzzz',
            aliases: ['CVE-2025-6545'],
            summary: 'OSV summary',
            details: 'OSV details',
            severity: 'High',
            affectedVersions: '>= 3.0.10, <= 3.1.2',
            fixedIn: '3.1.3',
            references: ['https://osv.dev/GHSA-xxxx-yyyy-zzzz'],
            published: '',
            modified: '',
          },
        ],
      },
    ];

    const githubAdvisoryResults: GithubAdvisoryQueryResult[] = [
      {
        packageName: 'pbkdf2',
        packageVersion: '3.1.2',
        vulnerabilities: [
          {
            id: 'GHSA-xxxx-yyyy-zzzz',
            summary: 'GitHub summary',
            details: 'GitHub details',
            severity: 'Critical',
            aliases: ['GHSA-xxxx-yyyy-zzzz', 'CVE-2025-6545'],
            affectedVersions: '>= 3.0.10, <= 3.1.2',
            fixedIn: '3.1.3',
            references: ['https://github.com/advisories/GHSA-xxxx-yyyy-zzzz'],
            published: '',
            modified: '',
            cvssScore: 9.8,
            cvssVector: null,
            epssPercentage: 0.42,
            cwes: ['CWE-327'],
          },
        ],
      },
    ];

    const result = correlate(deps, null, [], osvResults, githubAdvisoryResults, []);

    expect(result.dependencyFindings).toHaveLength(1);
    expect(result.dependencyFindings[0].sources).toEqual(expect.arrayContaining(['osv', 'github-advisory']));
    expect(result.dependencyFindings[0].severity).toBe('Critical');
    expect(result.dependencyFindings[0].epssPercentage).toBe(0.42);
  });

  it('merges Dependabot alert into existing finding by CVE', () => {
    const osvResults: OsvQueryResult[] = [
      {
        packageName: 'pbkdf2',
        packageVersion: '3.1.2',
        vulnerabilities: [
          {
            id: 'CVE-2025-6545',
            aliases: ['CVE-2025-6545'],
            summary: 'OSV summary',
            details: 'OSV details',
            severity: 'High',
            affectedVersions: '>= 3.0.10, <= 3.1.2',
            fixedIn: '3.1.3',
            references: [],
            published: '',
            modified: '',
          },
        ],
      },
    ];

    const dependabotAlerts: GithubDependabotAlert[] = [
      {
        alertNumber: 42,
        packageName: 'pbkdf2',
        packageVersion: '3.1.2',
        severity: 'Critical',
        title: 'pbkdf2 critical vulnerability',
        description: 'Dependabot confirmed',
        affectedVersions: '>= 3.0.10, <= 3.1.2',
        fixedIn: '3.1.3',
        ghsaId: 'GHSA-xxxx-yyyy-zzzz',
        cveId: 'CVE-2025-6545',
        manifestPath: 'yarn.lock',
        scope: 'runtime',
        alertState: 'open',
        htmlUrl: 'https://github.com/finografic/cv-justin-rankin-v1/security/dependabot/42',
        references: [],
      },
    ];

    const result = correlate(deps, null, [], osvResults, [], dependabotAlerts);

    expect(result.dependencyFindings).toHaveLength(1);
    expect(result.dependencyFindings[0].sources).toEqual(
      expect.arrayContaining(['osv', 'github-dependabot']),
    );
    expect(result.dependencyFindings[0].manifestPath).toBe('yarn.lock');
    expect(result.dependencyFindings[0].scope).toBe('runtime');
    expect(result.dependencyFindings[0].githubAlertUrl).toContain('dependabot/42');
  });
});
