import type { HelpConfig } from '@finografic/cli-kit/render-help';

export const cliHelp: HelpConfig = {
  main: { bin: 'xscan', args: '[command] [options]' },
  commands: {
    title: 'Commands',
    list: [
      {
        label: 'scan',
        description: 'Cross-check lockfile deps against OSV.dev and Node.js advisories',
      },
    ],
  },
  examples: {
    title: 'Examples',
    list: [
      { label: 'Scan current project', description: 'xscan scan' },
      { label: 'Terminal-only report', description: 'xscan scan --format terminal' },
      { label: 'Bare flags (scan implied)', description: 'xscan --verbose' },
    ],
  },
  footer: {
    title: 'Show Help',
    list: [{ label: 'xscan scan --help', description: 'Detailed scan options' }],
  },
};
