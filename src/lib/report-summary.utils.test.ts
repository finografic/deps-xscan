import { describe, expect, it } from 'vitest';

import type { CorrelationResult, Finding } from 'lib/correlate.utils';
import { buildActionSummary, combinedUpdateCommand } from 'lib/report-summary.utils';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'GHSA-test',
    packageName: 'ws',
    installedVersion: '8.20.1',
    isDirect: false,
    isPeer: false,
    dependencyKind: 'transitive',
    dependencyPaths: [['ws']],
    severity: 'High',
    type: 'Other',
    title: 'ws DoS',
    description: 'test',
    affectedVersions: '>= 1.1.0 < 5.2.5',
    fixedIn: '5.2.5',
    action: 'Update ws',
    riskContext: 'Transitive dependency via ws',
    sources: ['osv'],
    references: [],
    ...overrides,
  };
}

function resultWith(findings: Finding[]): CorrelationResult {
  return {
    scannedAt: new Date().toISOString(),
    projectNodeVersion: '24.16.0',
    totalDeps: 10,
    nodeVersionFindings: [],
    dependencyFindings: findings,
    summary: {
      critical: findings.filter((f) => f.severity === 'Critical').length,
      high: findings.filter((f) => f.severity === 'High').length,
      medium: 0,
      low: 0,
      unknown: 0,
      total: findings.length,
      affectedDirect: findings.filter((f) => f.dependencyKind === 'prod').length,
      affectedTransitive: findings.filter((f) => f.dependencyKind !== 'prod').length,
      affectedPeer: 0,
    },
  };
}

describe('buildActionSummary', () => {
  it('groups transitive dev findings with a single cyan command when only one package', () => {
    const summary = buildActionSummary(resultWith([finding()]));

    expect(summary).not.toBeNull();
    expect(summary!.exposureNote).toContain('No production runtime exposure');
    expect(summary!.foundLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Critical (runtime)', count: 0 }),
        expect.objectContaining({ label: 'High (development)', count: 1 }),
      ]),
    );

    const transitiveGroup = summary!.actionGroups.find((g) =>
      g.title.includes('high transitive, development'),
    );
    expect(transitiveGroup).toMatchObject({
      badgeSeverity: 'High',
      subtitle: 'does not affect production runtime consumers',
      commands: ['pnpm update ws@5.2.5'],
    });
    expect(summary!.recommendation).toContain('not a production deploy blocker');
  });

  it('groups direct production dependencies under Update first', () => {
    const summary = buildActionSummary(
      resultWith([
        finding({
          packageName: 'lodash',
          dependencyKind: 'prod',
          isDirect: true,
          severity: 'Critical',
          fixedIn: '4.17.21',
        }),
        finding({
          packageName: 'express',
          dependencyKind: 'prod',
          isDirect: true,
          severity: 'High',
          fixedIn: '4.21.0',
        }),
      ]),
    );

    const prodGroup = summary!.actionGroups[0];
    expect(prodGroup).toMatchObject({
      badgeSeverity: 'Critical',
      title: 'Update first',
      subtitle: 'direct production dependencies, affecting runtime consumers',
      commands: ['pnpm update lodash@4.17.21', 'pnpm update express@4.21.0'],
    });
  });

  it('combines individual pnpm update lines into one command', () => {
    expect(combinedUpdateCommand(['pnpm update lodash@4.17.21', 'pnpm update express@4.21.0'])).toBe(
      'pnpm update lodash@4.17.21 express@4.21.0',
    );
  });
});
