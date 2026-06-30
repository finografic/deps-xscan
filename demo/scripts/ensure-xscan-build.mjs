import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cliPath = resolve(repoRoot, 'dist/index.mjs');

if (!existsSync(cliPath)) {
  console.log('[demo] xscan dist missing — building @finografic/deps-xscan…');
  execSync('pnpm build', { cwd: repoRoot, stdio: 'inherit' });
}
