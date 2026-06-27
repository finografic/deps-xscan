import { oxlintCliConfig, testOverrides, configOverrides } from '@finografic/oxc-config/oxlint';
import { defineConfig } from 'oxlint';
import type { OxlintConfig } from 'oxlint';

export default defineConfig({
  ...oxlintCliConfig,
  overrides: [testOverrides, configOverrides],
} satisfies OxlintConfig);
