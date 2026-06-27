import { writeFileSync } from 'node:fs';
import pc from 'picocolors';

import type { CorrelationResult, Finding } from 'lib/correlate.utils';
import type { ReportFoundLine } from 'lib/report-summary.utils';
import { buildActionSummary } from 'lib/report-summary.utils';

import type { SecuritySourceId } from 'constants/security-sources.constants';
import { SECURITY_SOURCE_LABELS } from 'constants/security-sources.constants';
import {
  HR_SEPARATOR,
  TITLE_BORDER_CLOSE,
  TITLE_BORDER_OPEN,
  TITLE_BORDER_SIDE,
} from 'constants/tui.constants';

export type OutputFormat = 'terminal' | 'json' | 'both';

export function generateReport(
  result: CorrelationResult,
  format: OutputFormat = 'both',
  jsonOutputPath?: string,
): void {
  const actionSummary = buildActionSummary(result);
  let savedJsonPath: string | undefined;

  if (format === 'json' || format === 'both') {
    savedJsonPath = jsonOutputPath || 'deps-xscan-report.json';
    const jsonOutput = JSON.stringify(actionSummary ? { ...result, actionSummary } : result, null, 2);
    writeFileSync(savedJsonPath, jsonOutput, 'utf-8');
  }

  if (format === 'terminal' || format === 'both') {
    printTerminalReport(result, actionSummary, savedJsonPath);
  }

  if (format === 'json') {
    console.log(`\n${pc.dim(`  JSON report saved to: ${savedJsonPath}`)}`);
  }
}

function printTerminalReport(
  result: CorrelationResult,
  actionSummary: ReturnType<typeof buildActionSummary>,
  savedJsonPath?: string,
): void {
  const { summary, nodeVersionFindings, dependencyFindings } = result;

  console.log();
  console.log(pc.bold(pc.white(TITLE_BORDER_OPEN)));
  console.log(
    pc.bold(pc.white(TITLE_BORDER_SIDE)) +
      pc.bold(pc.cyan('  deps-xscan — Security Report')) +
      pc.bold(pc.white(`                        ${TITLE_BORDER_SIDE}`)),
  );
  console.log(pc.bold(pc.white(TITLE_BORDER_CLOSE)));
  console.log();

  console.log(pc.dim(`  Scanned at:     ${result.scannedAt}`));
  console.log(pc.dim(`  Node version:   ${result.projectNodeVersion || 'not detected'}`));
  console.log(pc.dim(`  Total deps:     ${result.totalDeps}`));
  console.log();

  printSummaryBar(summary);

  if (nodeVersionFindings.length > 0) {
    console.log();
    console.log(pc.bold(pc.yellow('  ⚠  Node.js Version Vulnerabilities')));
    console.log(pc.dim(HR_SEPARATOR));

    for (const f of nodeVersionFindings) {
      const sevColor = severityColor(f.severity);
      console.log(`  ${sevColor(`[${f.severity.toUpperCase()}]`)} ${pc.white(f.cve)}`);
      console.log(`    ${pc.dim('Type:')}      ${f.type}`);
      console.log(`    ${pc.dim('Current:')}   v${f.currentVersion}`);
      console.log(`    ${pc.dim('Patched:')}   v${f.patchedIn}`);
      console.log(`    ${pc.dim('Details:')}   ${f.postUrl}`);
      console.log();
    }
  }

  if (dependencyFindings.length > 0) {
    console.log();
    console.log(pc.bold(pc.red('  🔍 Dependency Vulnerabilities')));

    const grouped = groupBySeverity(dependencyFindings);

    for (const [severity, findings] of grouped) {
      if (findings.length === 0) continue;

      console.log();
      printSeveritySectionHeader(severity, findings.length);

      const sevColor = severityColor(severity);
      for (const f of findings) {
        const directLabel = f.isDirect
          ? pc.yellow(` [direct ${f.dependencyKind}]`)
          : f.isPeer
            ? pc.magenta(' [peer]')
            : pc.dim(' [transitive]');

        console.log();
        console.log(
          `  ${sevColor('●')} ${pc.bold(pc.white(f.packageName))}@${pc.dim(f.installedVersion)}${directLabel}`,
        );
        console.log(`    ${pc.dim('ID:')}     ${f.id}`);
        console.log(`    ${pc.dim('Type:')}   ${f.type}`);
        console.log(`    ${pc.dim('Title:')}  ${f.title.slice(0, 80)}`);
        if (f.description) {
          console.log(`    ${pc.dim('Info:')}   ${singleLine(f.description, 100)}`);
        }
        if (f.affectedVersions !== 'unknown') {
          console.log(`    ${pc.dim('Range:')}  ${f.affectedVersions}`);
        }

        if (f.fixedIn) {
          console.log(`    ${pc.dim('Fix:')}    Upgrade to ${pc.green(f.fixedIn)}`);
        } else {
          console.log(`    ${pc.dim('Fix:')}    ${pc.red('No fixed version found in advisory')}`);
        }

        console.log(`    ${pc.dim('Via:')}    ${formatDependencyPaths(f)}`);
        console.log(`    ${pc.dim('Risk:')}   ${f.riskContext}`);
        console.log(`    ${pc.dim('Action:')} ${f.action}`);

        const reference = f.references[0];
        if (reference) {
          console.log(`    ${pc.dim('Ref:')}    ${reference}`);
        }

        const sourceLabels = f.sources.map((s) => pc.cyan(formatSourceLabel(s)));
        console.log(`    ${pc.dim('Source:')} ${sourceLabels.join(', ')}`);

        if (f.manifestPath && f.manifestPath !== 'unknown') {
          console.log(`    ${pc.dim('Manifest:')} ${f.manifestPath}`);
        }
        if (f.scope && f.scope !== 'unknown') {
          console.log(`    ${pc.dim('Scope:')} ${f.scope}`);
        }
        if (f.githubAlertUrl) {
          console.log(`    ${pc.dim('GitHub:')} ${f.githubAlertUrl}`);
        }
        if (f.epssPercentage != null) {
          console.log(`    ${pc.dim('EPSS:')} ${f.epssPercentage.toFixed(2)}%`);
        }
        if (f.cwes && f.cwes.length > 0) {
          console.log(`    ${pc.dim('CWE:')} ${f.cwes.join(', ')}`);
        }
      }
    }
  }

  if (dependencyFindings.length === 0 && nodeVersionFindings.length === 0) {
    console.log();
    console.log(pc.bold(pc.green('  ✅ No known vulnerabilities found!')));
    console.log(pc.dim('  Your dependency tree looks clean against all checked sources.'));
  }

  console.log();
  console.log(pc.dim(HR_SEPARATOR));
  console.log();
  console.log(pc.dim('  Sources: Node.js Security Blog, OSV.dev, GitHub Advisory Database, Dependabot'));
  console.log(pc.dim('  Note: This scan is a point-in-time snapshot. New vulns may be'));
  console.log(pc.dim('  disclosed at any time. Run regularly for best coverage.'));

  if (savedJsonPath) {
    console.log();
    console.log(pc.dim(`  JSON report saved to: ${savedJsonPath}`));
  }

  if (actionSummary) {
    printActionSummary(actionSummary);
  }

  console.log();
}

function printActionSummary(actionSummary: NonNullable<ReturnType<typeof buildActionSummary>>): void {
  console.log();
  console.log(pc.dim(HR_SEPARATOR));
  console.log();
  console.log(pc.bold(pc.green('SUMMARY & ACTIONS:')));
  console.log();
  printFoundLines(actionSummary.foundLines);
  console.log();
  console.log(pc.bold(pc.dim(pc.cyan('WHAT TO DO:'))));
  console.log();

  for (const step of actionSummary.actionSteps) {
    for (const [index, line] of step.split('\n').entries()) {
      console.log(index === 0 ? line : pc.cyan(line.trim()));
    }
    console.log();
  }

  console.log(pc.bold(pc.dim(pc.cyan('RECOMMENDATION:'))));
  console.log();
  console.log(actionSummary.recommendation);
}

function printFoundLines(lines: ReportFoundLine[]): void {
  const labelWidth = Math.max(...lines.map((line) => line.label.length));
  const countWidth = Math.max(...lines.map((line) => String(line.count).length), 1);

  for (const line of lines) {
    const label = `${line.label}:`.padEnd(labelWidth + 1);
    const count = String(line.count).padStart(countWidth);
    console.log(`${label} ${foundCountColor(line)(count)}`);
  }
}

function foundCountColor(line: ReportFoundLine): (s: string) => string {
  if (line.count === 0) return pc.green;
  return severityColor(line.severity);
}

function formatSourceLabel(source: SecuritySourceId): string {
  return SECURITY_SOURCE_LABELS[source] || source;
}

function singleLine(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function formatDependencyPaths(finding: Finding): string {
  const paths = finding.dependencyPaths.slice(0, 2).map((path) => path.join(' -> '));
  const suffix = finding.dependencyPaths.length > 2 ? ` (+${finding.dependencyPaths.length - 2} more)` : '';
  return `${paths.join('; ')}${suffix}`;
}

function printSummaryBar(summary: CorrelationResult['summary']): void {
  const parts = [
    summary.critical > 0 ? pc.bgRed(pc.white(` ${summary.critical} CRITICAL `)) : null,
    summary.high > 0 ? pc.bgYellow(pc.black(` ${summary.high} HIGH `)) : null,
    summary.medium > 0 ? pc.bgCyan(pc.white(` ${summary.medium} MEDIUM `)) : null,
    summary.low > 0 ? pc.bgWhite(pc.black(` ${summary.low} LOW `)) : null,
  ].filter(Boolean);

  if (parts.length > 0) {
    console.log(`  ${parts.join(' ')}`);
    console.log();
    console.log(
      pc.dim(
        `  ${summary.affectedDirect} direct | ` +
          `${summary.affectedTransitive} transitive | ` +
          `${summary.affectedPeer} peer`,
      ),
    );
  } else {
    console.log(pc.green('  No vulnerabilities found ✓'));
  }
}

function printSeveritySectionHeader(severity: string, count: number): void {
  const label = `${severity.toUpperCase()} vulnerabilities (${count})`;
  const dashCount = Math.max(0, HR_SEPARATOR.length - label.length - 1);
  const sevColor = severityColor(severity);
  console.log(`${sevColor(label)} ${pc.dim('─'.repeat(dashCount))}`);
}

function severityColor(severity: string): (s: string) => string {
  switch (severity) {
    case 'Critical':
      return pc.red;
    case 'High':
      return pc.yellow;
    case 'Medium':
      return pc.cyan;
    case 'Low':
      return pc.dim;
    default:
      return pc.white;
  }
}

function groupBySeverity(findings: Finding[]): Array<[string, Finding[]]> {
  const order = ['Critical', 'High', 'Medium', 'Low', 'Unknown'];
  const grouped = new Map<string, Finding[]>();

  for (const sev of order) {
    grouped.set(sev, []);
  }

  for (const f of findings) {
    const bucket = grouped.get(f.severity) || grouped.get('Unknown')!;
    bucket.push(f);
  }

  return order.map((sev) => [sev, grouped.get(sev) || []]);
}
