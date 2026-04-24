import { writeFileSync } from "fs";
import { CorrelationResult, Finding, NodeVersionFinding } from "./correlate";

// We use chalk for terminal colors. If not available, fall back to plain text.
let chalk: any;
try {
  chalk = require("chalk");
} catch {
  // Fallback: no-op chalk
  const identity = (s: string) => s;
  chalk = new Proxy(identity, {
    get: () => identity,
  });
}

export type OutputFormat = "terminal" | "json" | "both";

/**
 * Generate the scan report in the requested format(s).
 */
export function generateReport(
  result: CorrelationResult,
  format: OutputFormat = "both",
  jsonOutputPath?: string
): void {
  if (format === "terminal" || format === "both") {
    printTerminalReport(result);
  }

  if (format === "json" || format === "both") {
    const jsonOutput = JSON.stringify(result, null, 2);
    if (jsonOutputPath) {
      writeFileSync(jsonOutputPath, jsonOutput, "utf-8");
      console.log(`\n${chalk.dim(`JSON report saved to: ${jsonOutputPath}`)}`);
    } else {
      // Write to stdout-friendly location
      const defaultPath = "dep-scan-report.json";
      writeFileSync(defaultPath, jsonOutput, "utf-8");
      console.log(`\n${chalk.dim(`JSON report saved to: ${defaultPath}`)}`);
    }
  }
}

function printTerminalReport(result: CorrelationResult): void {
  const { summary, nodeVersionFindings, dependencyFindings } = result;

  // Header
  console.log();
  console.log(chalk.bold.white("╔══════════════════════════════════════════════════════╗"));
  console.log(chalk.bold.white("║") + chalk.bold.cyan("  dep-tree-scanner — Security Report") + chalk.bold.white("                 ║"));
  console.log(chalk.bold.white("╚══════════════════════════════════════════════════════╝"));
  console.log();

  // Scan metadata
  console.log(chalk.dim(`  Scanned at:     ${result.scannedAt}`));
  console.log(chalk.dim(`  Node version:   ${result.projectNodeVersion || "not detected"}`));
  console.log(chalk.dim(`  Total deps:     ${result.totalDeps}`));
  console.log();

  // Summary bar
  printSummaryBar(summary);

  // Node.js version findings
  if (nodeVersionFindings.length > 0) {
    console.log();
    console.log(chalk.bold.yellow("  ⚠  Node.js Version Vulnerabilities"));
    console.log(chalk.dim("  ─".repeat(30)));

    for (const f of nodeVersionFindings) {
      const sevColor = severityColor(f.severity);
      console.log(
        `  ${sevColor(`[${f.severity.toUpperCase()}]`)} ${chalk.white(f.cve)}`
      );
      console.log(`    ${chalk.dim("Type:")}      ${f.type}`);
      console.log(`    ${chalk.dim("Current:")}   v${f.currentVersion}`);
      console.log(`    ${chalk.dim("Patched:")}   v${f.patchedIn}`);
      console.log(`    ${chalk.dim("Details:")}   ${f.postUrl}`);
      console.log();
    }
  }

  // Dependency findings
  if (dependencyFindings.length > 0) {
    console.log();
    console.log(chalk.bold.red("  🔍 Dependency Vulnerabilities"));
    console.log(chalk.dim("  ─".repeat(30)));

    // Group by severity
    const grouped = groupBySeverity(dependencyFindings);

    for (const [severity, findings] of grouped) {
      if (findings.length === 0) continue;
      const sevColor = severityColor(severity);

      console.log();
      console.log(sevColor(`  ── ${severity.toUpperCase()} (${findings.length}) ──`));

      for (const f of findings) {
        const directLabel = f.isDirect
          ? chalk.yellow(" [direct]")
          : f.isPeer
            ? chalk.magenta(" [peer]")
            : chalk.dim(" [transitive]");

        console.log();
        console.log(
          `  ${sevColor("●")} ${chalk.bold.white(f.packageName)}@${chalk.dim(f.installedVersion)}${directLabel}`
        );
        console.log(`    ${chalk.dim("ID:")}     ${f.id}`);
        console.log(`    ${chalk.dim("Type:")}   ${f.type}`);
        console.log(`    ${chalk.dim("Title:")}  ${f.title.slice(0, 80)}`);

        if (f.fixedIn) {
          console.log(`    ${chalk.dim("Fix:")}    Upgrade to ${chalk.green(f.fixedIn)}`);
        } else {
          console.log(`    ${chalk.dim("Fix:")}    ${chalk.red("No fix available")}`);
        }

        const sourceLabels = f.sources.map((s) =>
          s === "node-blog" ? chalk.cyan("Node.js Blog") : chalk.blue("OSV.dev")
        );
        console.log(`    ${chalk.dim("Source:")} ${sourceLabels.join(", ")}`);
      }
    }
  }

  // Clean bill of health
  if (dependencyFindings.length === 0 && nodeVersionFindings.length === 0) {
    console.log();
    console.log(chalk.bold.green("  ✅ No known vulnerabilities found!"));
    console.log(chalk.dim("  Your dependency tree looks clean against all checked sources."));
  }

  // Footer
  console.log();
  console.log(chalk.dim("  ─".repeat(30)));
  console.log(chalk.dim("  Sources: Node.js Security Blog, OSV.dev"));
  console.log(chalk.dim("  Note: This scan is a point-in-time snapshot. New vulns may be"));
  console.log(chalk.dim("  disclosed at any time. Run regularly for best coverage."));
  console.log();
}

function printSummaryBar(summary: CorrelationResult["summary"]): void {
  const parts = [
    summary.critical > 0 ? chalk.bgRed.white(` ${summary.critical} CRITICAL `) : null,
    summary.high > 0 ? chalk.bgYellow.black(` ${summary.high} HIGH `) : null,
    summary.medium > 0 ? chalk.bgBlue.white(` ${summary.medium} MEDIUM `) : null,
    summary.low > 0 ? chalk.bgWhite.black(` ${summary.low} LOW `) : null,
  ].filter(Boolean);

  if (parts.length > 0) {
    console.log(`  ${parts.join(" ")}`);
    console.log();
    console.log(
      chalk.dim(
        `  ${summary.affectedDirect} direct | ` +
          `${summary.affectedTransitive} transitive | ` +
          `${summary.affectedPeer} peer`
      )
    );
  } else {
    console.log(chalk.green("  No vulnerabilities found ✓"));
  }
}

function severityColor(severity: string): (s: string) => string {
  switch (severity) {
    case "Critical":
      return chalk.red;
    case "High":
      return chalk.yellow;
    case "Medium":
      return chalk.blue;
    case "Low":
      return chalk.dim;
    default:
      return chalk.white;
  }
}

function groupBySeverity(
  findings: Finding[]
): [string, Finding[]][] {
  const order = ["Critical", "High", "Medium", "Low", "Unknown"];
  const grouped = new Map<string, Finding[]>();

  for (const sev of order) {
    grouped.set(sev, []);
  }

  for (const f of findings) {
    const bucket = grouped.get(f.severity) || grouped.get("Unknown")!;
    bucket.push(f);
  }

  return order.map((sev) => [sev, grouped.get(sev) || []]);
}
