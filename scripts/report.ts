import { writeFileSync } from 'node:fs';
import pc from 'picocolors';
import type { CorrelationResult, Finding } from './correlate';

export type OutputFormat = 'terminal' | 'json' | 'both';

/**
 * Generate the scan report in the requested format(s).
 */
export function generateReport(
  result: CorrelationResult,
  format: OutputFormat = 'both',
  jsonOutputPath?: string,
): void {
  if (format === 'terminal' || format === 'both') {
    printTerminalReport(result);
  }

  if (format === 'json' || format === 'both') {
    const jsonOutput = JSON.stringify(result, null, 2);
    if (jsonOutputPath) {
      writeFileSync(jsonOutputPath, jsonOutput, 'utf-8');
      console.log(`\n${pc.dim(`JSON report saved to: ${jsonOutputPath}`)}`);
    } else {
      const defaultPath = 'dep-scan-report.json';
      writeFileSync(defaultPath, jsonOutput, 'utf-8');
      console.log(`\n${pc.dim(`JSON report saved to: ${defaultPath}`)}`);
    }
  }
}

function printTerminalReport(result: CorrelationResult): void {
  const { summary, nodeVersionFindings, dependencyFindings } = result;

  console.log();
  console.log(pc.bold(pc.white('╔══════════════════════════════════════════════════════╗')));
  console.log(
    pc.bold(pc.white('║')) +
      pc.bold(pc.cyan('  dep-tree-scanner — Security Report')) +
      pc.bold(pc.white('                 ║')),
  );
  console.log(pc.bold(pc.white('╚══════════════════════════════════════════════════════╝')));
  console.log();

  console.log(pc.dim(`  Scanned at:     ${result.scannedAt}`));
  console.log(pc.dim(`  Node version:   ${result.projectNodeVersion || 'not detected'}`));
  console.log(pc.dim(`  Total deps:     ${result.totalDeps}`));
  console.log();

  printSummaryBar(summary);

  if (nodeVersionFindings.length > 0) {
    console.log();
    console.log(pc.bold(pc.yellow('  ⚠  Node.js Version Vulnerabilities')));
    console.log(pc.dim('  ─'.repeat(30)));

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
    console.log(pc.dim('  ─'.repeat(30)));

    const grouped = groupBySeverity(dependencyFindings);

    for (const [severity, findings] of grouped) {
      if (findings.length === 0) continue;
      const sevColor = severityColor(severity);

      console.log();
      console.log(sevColor(`  ── ${severity.toUpperCase()} (${findings.length}) ──`));

      for (const f of findings) {
        const directLabel = f.isDirect
          ? pc.yellow(' [direct]')
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

        if (f.fixedIn) {
          console.log(`    ${pc.dim('Fix:')}    Upgrade to ${pc.green(f.fixedIn)}`);
        } else {
          console.log(`    ${pc.dim('Fix:')}    ${pc.red('No fix available')}`);
        }

        const sourceLabels = f.sources.map((s) =>
          s === 'node-blog' ? pc.cyan('Node.js Blog') : pc.blue('OSV.dev'),
        );
        console.log(`    ${pc.dim('Source:')} ${sourceLabels.join(', ')}`);
      }
    }
  }

  if (dependencyFindings.length === 0 && nodeVersionFindings.length === 0) {
    console.log();
    console.log(pc.bold(pc.green('  ✅ No known vulnerabilities found!')));
    console.log(pc.dim('  Your dependency tree looks clean against all checked sources.'));
  }

  console.log();
  console.log(pc.dim('  ─'.repeat(30)));
  console.log(pc.dim('  Sources: Node.js Security Blog, OSV.dev'));
  console.log(pc.dim('  Note: This scan is a point-in-time snapshot. New vulns may be'));
  console.log(pc.dim('  disclosed at any time. Run regularly for best coverage.'));
  console.log();
}

function printSummaryBar(summary: CorrelationResult['summary']): void {
  const parts = [
    summary.critical > 0 ? pc.bgRed(pc.white(` ${summary.critical} CRITICAL `)) : null,
    summary.high > 0 ? pc.bgYellow(pc.black(` ${summary.high} HIGH `)) : null,
    summary.medium > 0 ? pc.bgBlue(pc.white(` ${summary.medium} MEDIUM `)) : null,
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

function severityColor(severity: string): (s: string) => string {
  switch (severity) {
    case 'Critical':
      return pc.red;
    case 'High':
      return pc.yellow;
    case 'Medium':
      return pc.blue;
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
