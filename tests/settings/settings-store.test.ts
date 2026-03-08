import { SettingsStore } from "../../src/settings/settings-store";

describe("SettingsStore", () => {
  let store: SettingsStore;

  beforeEach(() => {
    store = new SettingsStore();
  });

  describe("get", () => {
    it("returns default values for unset keys", () => {
      expect(store.get("privacy.blockTrackers")).toBe(true);
      expect(store.get<number>("ui.fontSize")).toBe(16);
    });

    it("throws for unknown keys", () => {
      expect(() => store.get("nonexistent.key")).toThrow();
    });
  });

  describe("set", () => {
    it("overrides a default value", () => {
      store.set("ui.darkMode", true);
      expect(store.get("ui.darkMode")).toBe(true);
    });

    it("throws for wrong value type", () => {
      // ui.fontSize expects a number
      expect(() => store.set("ui.fontSize", "large" as never)).toThrow(TypeError);
    });
  });

  // Missing: reset(key) restores default test
  // Missing: resetAll() clears all overrides test
  // Missing: export() only includes overrides (not defaults) test
  // Missing: import() round-trip test
  // Missing: constructor with initial overrides test
  // Missing: set() throws for unknown key test
});
