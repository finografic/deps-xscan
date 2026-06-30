import pc from 'picocolors';

import {
  TITLE_BORDER_CLOSE,
  TITLE_BORDER_OPEN,
  TITLE_BORDER_SIDE,
  TITLE_INNER_WIDTH,
} from 'constants/tui.constants';

/** Double-line title box matching the Security Report header style. */
export function printTitleBanner(label: string): void {
  const inner = label.startsWith('  ') ? label : `  ${label}`;
  const padding = Math.max(0, TITLE_INNER_WIDTH - inner.length);

  console.log();
  console.log(pc.bold(pc.white(TITLE_BORDER_OPEN)));
  console.log(
    pc.bold(pc.white(TITLE_BORDER_SIDE)) +
      pc.bold(pc.cyan(inner)) +
      pc.bold(pc.white(`${' '.repeat(padding)}${TITLE_BORDER_SIDE}`)),
  );
  console.log(pc.bold(pc.white(TITLE_BORDER_CLOSE)));
  console.log();
}

export const FETCHING_SOURCES_BANNER = 'xscan — fetching vulnerability sources';

export function skippedSourceLabel(label: string): string {
  return pc.dim(`${label} (skipped)`);
}
