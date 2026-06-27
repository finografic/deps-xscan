import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getCacheDirectory, getCached, setCache } from 'lib/cache.utils';

describe('getCacheDirectory', () => {
  const originalXdg = process.env.XDG_CONFIG_HOME;

  afterEach(() => {
    if (originalXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdg;
    }
  });

  it('resolves under XDG config finografic deps-xscan cache subfolder', () => {
    process.env.XDG_CONFIG_HOME = '/tmp/xdg-config-test';
    expect(getCacheDirectory()).toBe(join('/tmp/xdg-config-test', 'finografic', 'deps-xscan', 'cache'));
  });

  it('defaults to ~/.config/finografic/deps-xscan/cache', () => {
    delete process.env.XDG_CONFIG_HOME;
    expect(getCacheDirectory()).toBe(join(homedir(), '.config', 'finografic', 'deps-xscan', 'cache'));
  });
});

describe('setCache / getCached', () => {
  const originalXdg = process.env.XDG_CONFIG_HOME;
  let tempRoot = '';

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
    if (originalXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdg;
    }
  });

  it('writes and reads a JSON file under the XDG cache directory', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'xscan-cache-test-'));
    process.env.XDG_CONFIG_HOME = tempRoot;

    const payload = { packageName: 'lodash', vulnerabilities: [] };
    setCache('osv-query-v2-lodash@4.17.21', payload);

    const cacheDir = getCacheDirectory();
    expect(existsSync(cacheDir)).toBe(true);
    expect(readdirSync(cacheDir).some((name) => name.endsWith('.json'))).toBe(true);
    expect(getCached('osv-query-v2-lodash@4.17.21')).toEqual(payload);
  });
});
