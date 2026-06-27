#!/usr/bin/env node

import { createRequire } from 'node:module';
import process from 'node:process';
import type { CommandHandler } from '@finografic/cli-kit/commands';
import { renderHelp } from '@finografic/cli-kit/render-help';

import { cliHelp } from './cli.help';
import { runScanCommand } from './commands/scan';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

function isScanInvocation(argv: string[]): boolean {
  if (argv.length === 0) return true;
  const first = argv[0];
  return first === 'scan' || first.startsWith('-');
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const [, , ...argv] = process.argv;

  if (argv.length === 0) {
    await runScanCommand({ argv: [], cwd });
    return;
  }

  const [first, ...rest] = argv;

  if (first === '--help' || first === '-h') {
    renderHelp(cliHelp);
    return;
  }

  if (first === '--version' || first === '-v') {
    console.log(version);
    return;
  }

  if (isScanInvocation(argv)) {
    const scanArgv = first === 'scan' ? rest : argv;
    await runScanCommand({ argv: scanArgv, cwd });
    return;
  }

  const commands: Record<string, CommandHandler> = {
    scan: runScanCommand,
    help: () => renderHelp(cliHelp),
  };

  const handler = commands[first];
  if (!handler) {
    console.error(`Unknown command: ${first}`);
    renderHelp(cliHelp);
    process.exit(1);
    return;
  }

  await handler({ argv: rest, cwd });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
