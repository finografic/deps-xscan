import { spawn as spawnChild } from 'node:child_process';
import { spawn as spawnPty } from 'node-pty';

export interface ScanProcess {
  kill: () => void;
}

export interface ScanProcessHandlers {
  onChunk: (chunk: string) => void;
  onExit: (exitCode: number) => void;
  onError: (message: string) => void;
}

const SCAN_PTY_COLS = 120;
const SCAN_PTY_ROWS = 32;

function scanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.FORCE_COLOR ??= '1';
  return env;
}

function attachPipeChild(
  command: string,
  args: string[],
  cwd: string,
  handlers: ScanProcessHandlers,
  env: Record<string, string>,
): ScanProcess {
  const child = spawnChild(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (buf: Buffer) => handlers.onChunk(buf.toString('utf-8')));
  child.stderr?.on('data', (buf: Buffer) => handlers.onChunk(buf.toString('utf-8')));

  child.on('error', (err) => {
    handlers.onError(err.message);
    handlers.onExit(2);
  });

  child.on('close', (code) => {
    handlers.onExit(code ?? 1);
  });

  return {
    kill: () => child.kill('SIGTERM'),
  };
}

function attachPtyChild(
  command: string,
  args: string[],
  cwd: string,
  handlers: ScanProcessHandlers,
): ScanProcess {
  const child = spawnPty(command, args, {
    name: 'xterm-256color',
    cols: SCAN_PTY_COLS,
    rows: SCAN_PTY_ROWS,
    cwd,
    env: scanEnv(),
  });

  child.onData((data) => handlers.onChunk(data));
  child.onExit(({ exitCode }) => handlers.onExit(exitCode ?? 1));

  return {
    kill: () => {
      try {
        child.kill();
      } catch {
        // best-effort
      }
    },
  };
}

function attachPipeChildWithProgress(
  command: string,
  args: string[],
  cwd: string,
  handlers: ScanProcessHandlers,
): ScanProcess {
  const env = scanEnv();
  env.DEMO_XSCAN_FORCE_PROGRESS = '1';
  return attachPipeChild(command, args, cwd, handlers, env);
}

/**
 * Spawn xscan with a pseudo-TTY so Clack task spinners/progress render (stdout.isTTY).
 * Falls back to piped stdout with DEMO_XSCAN_FORCE_PROGRESS when PTY allocation fails.
 */
export function spawnScanProcess(
  cliPath: string,
  args: string[],
  cwd: string,
  handlers: ScanProcessHandlers,
): ScanProcess {
  try {
    return attachPtyChild(process.execPath, [cliPath, ...args], cwd, handlers);
  } catch {
    return attachPipeChildWithProgress(process.execPath, [cliPath, ...args], cwd, handlers);
  }
}
