import { defineConfig } from 'tsdown';

export default defineConfig({
  exports: { legacy: true },
  entry: {
    index: 'src/cli.ts',
  },
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  target: 'esnext',
});
