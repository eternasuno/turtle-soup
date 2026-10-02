import { afterEach, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings } from '../../src/lib/storage';

const key = 'turtle-soup-jev-settings';
afterEach(() => vi.unstubAllGlobals());
it('stores only configured settings and loads them', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (id: string) => values.get(id) ?? null,
    setItem: (id: string, value: string) => values.set(id, value),
  });
  expect(loadSettings()).toEqual({ apiUrl: '', apiKey: '' });
  const settings = { apiUrl: 'https://example.com', apiKey: 'user-key' };
  saveSettings(settings);
  expect(values.get(key)).toBe(JSON.stringify(settings));
  expect(loadSettings()).toEqual(settings);
});
it.each(['invalid', 'null', '{"apiUrl":1,"apiKey":"key"}'])(
  'ignores malformed stored data: %s',
  (value) => {
    vi.stubGlobal('localStorage', { getItem: () => value });
    expect(loadSettings()).toEqual({ apiUrl: '', apiKey: '' });
  }
);
it('handles unavailable reads and surfaces failed writes', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  });
  expect(loadSettings()).toEqual({ apiUrl: '', apiKey: '' });
  expect(() => saveSettings({ apiUrl: '', apiKey: '' })).toThrow('blocked');
});
