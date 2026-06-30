// oxlint-disable import/no-unassigned-import
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import { appendScanSourceParams } from 'shared/scan-sources';
import type { ScanSourceToggles } from 'shared/scan-sources';

interface XscanTerminalProps {
  repoId: string | null;
  repoUrl: string | null;
  scanSources: ScanSourceToggles;
  standby: boolean;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function writeStandbyPrompt(terminal: Terminal): void {
  terminal.write('\x1b[32m$\x1b[0m ');
}

function scanUrl(repoId: string | null, repoUrl: string | null, scanSources: ScanSourceToggles): string {
  const searchParams = new URLSearchParams();
  if (repoUrl) {
    searchParams.set('repoUrl', repoUrl);
  } else if (repoId) {
    searchParams.set('repoId', repoId);
  }

  appendScanSourceParams(searchParams, scanSources);

  return apiUrl(`/api/scan?${searchParams.toString()}`);
}

export function XscanTerminal({ repoId, repoUrl, scanSources, standby }: XscanTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1,
      scrollback: 5000,
      theme: {
        background: '#0f172a',
        foreground: '#f8fafc',
        cursor: '#38bdf8',
        selectionBackground: '#334155',
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      abortRef.current?.abort();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    abortRef.current?.abort();
    terminal.reset();

    if (standby) {
      writeStandbyPrompt(terminal);
      return;
    }

    terminal.writeln('\x1b[2mConnecting to scan stream…\x1b[0m\r\n');

    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const res = await fetch(scanUrl(repoId, repoUrl, scanSources), {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          terminal.writeln(`\r\n\x1b[31mScan request failed (${res.status})\x1b[0m`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const lines = part.split('\n');
            let event = 'message';
            let data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.slice(7);
              else if (line.startsWith('data: ')) data += line.slice(6);
            }
            if (!data) continue;
            const text = JSON.parse(data) as string;
            if (event === 'output') terminal.write(text);
            else if (event === 'error') terminal.writeln(`\r\n\x1b[31m${text}\x1b[0m`);
            else if (event === 'exit') terminal.writeln(`\r\n\x1b[2m[exit ${text}]\x1b[0m`);
          }
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        terminal.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
      }
    })();

    return () => controller.abort();
  }, [repoId, repoUrl, scanSources, standby]);

  return (
    <div
      className="h-full w-full overflow-hidden rounded-lg border border-border py-6 pl-4 pr-2"
      style={{ backgroundColor: '#0F172A' }}
    >
      <div ref={containerRef} className="h-full w-full" aria-label="Scan terminal output" role="log" />
    </div>
  );
}
