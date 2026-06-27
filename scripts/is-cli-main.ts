import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** True when this file is the process entry (replaces CJS `require.main === module`). */
export function isCliMain(thisFileUrl: string): boolean {
  return Boolean(process.argv[1]) && resolve(fileURLToPath(thisFileUrl)) === resolve(process.argv[1]);
}
