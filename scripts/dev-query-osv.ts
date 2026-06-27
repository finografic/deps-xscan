#!/usr/bin/env tsx

import { queryOsvSingle } from '../src/lib/osv.utils';

const name = process.argv[2];
const version = process.argv[3];

if (!name || !version) {
  console.error('Usage: pnpm script:query-osv <package-name> <version>');
  process.exit(1);
}

queryOsvSingle(name, version)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    return result;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
