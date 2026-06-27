import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILENAMES = ['.env', '.env.local'] as const;

/** Load `.env` / `.env.local` from a project root without overriding existing shell env. */
export function loadProjectEnv(projectRoot: string): void {
  for (const filename of ENV_FILENAMES) {
    const filePath = join(projectRoot, filename);
    if (!existsSync(filePath)) continue;
    applyEnvFile(readFileSync(filePath, 'utf-8'));
  }
}

function applyEnvFile(content: string): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
