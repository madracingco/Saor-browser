/**
 * Lightweight key-value settings store for Saor browser.
 * Designed for minimal memory overhead on constrained hardware (e.g. Pi Zero 2 W).
 */

export type SettingKey = string;
export type SettingValue = string | number | boolean;

export interface SettingDescriptor {
  defaultValue: SettingValue;
  description: string;
}

export const DEFAULTS: Record<SettingKey, SettingDescriptor> = {
  "privacy.blockTrackers": { defaultValue: true, description: "Block known tracker domains" },
  "privacy.clearCookiesOnExit": { defaultValue: false, description: "Clear all cookies when browser closes" },
  "navigation.searchEngine": { defaultValue: "https://search.saor.ie/search?q=", description: "Default search engine URL" },
  "ui.darkMode": { defaultValue: false, description: "Use dark colour scheme" },
  "ui.fontSize": { defaultValue: 16, description: "Base font size in pixels" },
  "performance.maxTabs": { defaultValue: 5, description: "Maximum number of tabs (enforced on low-memory devices)" },
  "performance.prefetch": { defaultValue: false, description: "Prefetch links on hover (disable on constrained hardware)" },
};

export class SettingsStore {
  private store: Map<SettingKey, SettingValue> = new Map();

  constructor(initial: Partial<Record<SettingKey, SettingValue>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.set(key, value);
    }
  }

  get<T extends SettingValue>(key: SettingKey): T {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    if (key in DEFAULTS) {
      return DEFAULTS[key].defaultValue as T;
    }
    throw new Error(`Unknown setting: ${key}`);
  }

  set(key: SettingKey, value: SettingValue): void {
    if (!(key in DEFAULTS)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    const expected = typeof DEFAULTS[key].defaultValue;
    if (typeof value !== expected) {
      throw new TypeError(`Setting "${key}" expects ${expected}, got ${typeof value}`);
    }
    this.store.set(key, value);
  }

  reset(key: SettingKey): void {
    this.store.delete(key);
  }

  resetAll(): void {
    this.store.clear();
  }

  /** Serialises current (non-default) overrides to a plain object. */
  export(): Record<SettingKey, SettingValue> {
    return Object.fromEntries(this.store);
  }

  /** Imports overrides, replacing any previously overridden values. */
  import(data: Record<SettingKey, SettingValue>): void {
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
  }
}
