#!/usr/bin/env node
/**
 * Release the browser demo package.
 *
 * Bumps demo/package.json, commits the bump, creates a standard vX.Y.Z tag,
 * and pushes the release commit plus tag. The tag triggers the package
 * publishing workflows in GitHub Actions.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bump = process.argv[2];

if (!['patch', 'minor', 'major'].includes(bump ?? '')) {
  console.error('\n  Usage: tsx scripts/release-demo.ts <patch|minor|major>\n');
  process.exit(1);
}

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const demoDir = path.join(repoRoot, 'demo');

function run(cmd: string, opts: { cwd?: string } = {}): void {
  try {
    console.log(`\n  -> ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: opts.cwd ?? repoRoot });
  } catch {
    console.error(`\n  Failed: ${cmd}\n`);
    process.exit(1);
  }
}

function readVersion(packageJsonPath: string): string {
  return (JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string }).version;
}

try {
  execSync('git diff --exit-code --quiet', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git diff --cached --exit-code --quiet', { cwd: repoRoot, stdio: 'pipe' });
} catch {
  console.error('\n  Working tree is dirty. Commit source changes before releasing the demo package.\n');
  process.exit(1);
}

run(`pnpm version ${bump} --no-git-tag-version --ignore-scripts`, { cwd: demoDir });

const version = readVersion(path.join(demoDir, 'package.json'));

run('git add demo/package.json');
run(`git commit -m "chore(demo): release v${version}"`);
run(`git tag -a "v${version}" -m "@finografic/deps-xscan-demo v${version}"`);
run('git push --follow-tags');

console.log(`\n  Released @finografic/deps-xscan-demo@${version}\n`);
