import { TabManager, _resetIdCounter } from "../../src/tabs/tab-manager";

beforeEach(() => _resetIdCounter());

describe("TabManager", () => {
  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  describe("createTab", () => {
    it("creates a tab with default URL", () => {
      const tab = manager.createTab();
      expect(tab.url).toBe("about:newtab");
      expect(tab.isLoading).toBe(false);
      expect(manager.tabCount).toBe(1);
    });

    it("activates the first tab automatically", () => {
      const tab = manager.createTab();
      expect(manager.activeTab()!.id).toBe(tab.id);
    });

    it("activates subsequent tabs when activate=true", () => {
      manager.createTab();
      const second = manager.createTab("https://example.com", true);
      expect(manager.activeTab()!.id).toBe(second.id);
    });
  });

  describe("closeTab", () => {
    it("removes the tab", () => {
      const tab = manager.createTab();
      manager.closeTab(tab.id);
      expect(manager.tabCount).toBe(0);
    });

    it("activates the adjacent tab when the active tab is closed", () => {
      const a = manager.createTab();
      const b = manager.createTab();
      manager.activateTab(a.id);
      manager.closeTab(a.id);
      expect(manager.activeTab()!.id).toBe(b.id);
    });

    it("throws for non-existent tab id", () => {
      expect(() => manager.closeTab("ghost")).toThrow();
    });
  });

  describe("updateTab", () => {
    it("updates url and title", () => {
      const tab = manager.createTab();
      manager.updateTab(tab.id, { url: "https://updated.com", title: "Updated" });
      expect(manager.activeTab()!.url).toBe("https://updated.com");
    });
  });

  // Missing: moveTab reorder test
  // Missing: duplicateTab test
  // Missing: closeAllUnpinned test (pinned tabs should survive)
  // Missing: allTabs ordering test
  // Missing: activeTab returns null when no tabs exist
  // Missing: updateTab throws for missing tab
});
