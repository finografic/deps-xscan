import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('node-fetch', () => ({
  default: (...args: unknown[]) => fetchMock(...args),
}));

import { queryOsvBatch } from 'lib/osv.utils';

describe('queryOsvBatch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });
  });

  it('reports progress one package at a time', async () => {
    const progress: Array<[number, number]> = [];
    const packages = Array.from({ length: 150 }, (_, i) => ({
      name: `pkg-${i}`,
      version: '1.0.0',
    }));

    await queryOsvBatch(
      packages,
      { disabled: true },
      {
        onProgress: (completed, total) => progress.push([completed, total]),
      },
    );

    expect(progress[0]).toEqual([0, 150]);
    expect(progress).toContainEqual([1, 150]);
    expect(progress).toContainEqual([99, 150]);
    expect(progress).toContainEqual([100, 150]);
    expect(progress.at(-1)).toEqual([150, 150]);
    expect(progress.length).toBe(151);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
