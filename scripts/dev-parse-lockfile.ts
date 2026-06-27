#!/usr/bin/env tsx

import { parseLockfile } from '../src/lib/lockfile';

const projectRoot = process.argv[2] || process.cwd();

try {
  const result = parseLockfile(projectRoot);
  console.log(JSON.stringify(result, null, 2));
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  process.exit(1);
}
