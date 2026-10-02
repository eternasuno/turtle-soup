import type { JevSettings } from '@turtle-soup/core/types';

const SETTINGS_KEY = 'turtle-soup-jev-settings';
export function loadSettings(): JevSettings {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? 'null'
    );
    if (
      typeof value === 'object' &&
      value !== null &&
      'apiUrl' in value &&
      typeof value.apiUrl === 'string' &&
      'apiKey' in value &&
      typeof value.apiKey === 'string'
    ) {
      return { apiUrl: value.apiUrl, apiKey: value.apiKey };
    }
  } catch {
    return { apiUrl: '', apiKey: '' };
  }
  return { apiUrl: '', apiKey: '' };
}
export function saveSettings(settings: JevSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
