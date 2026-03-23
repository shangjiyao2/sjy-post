export const BROWSER_QA_PRESETS = ['java-import', 'api-docs', 'permission-config', 'collections', 'welcome', 'settings', 'history'] as const;

export type QaPreset = (typeof BROWSER_QA_PRESETS)[number];

export function isQaPreset(value: string | null): value is QaPreset {
  return value !== null && BROWSER_QA_PRESETS.includes(value as QaPreset);
}
