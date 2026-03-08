/**
 * Tab manager for Saor browser.
 * Manages the lifecycle of browser tabs: creation, switching, closing, and reordering.
 */

export type TabId = string;

export interface Tab {
  id: TabId;
  url: string;
  title: string;
  isLoading: boolean;
  isPinned: boolean;
  isMuted: boolean;
  createdAt: Date;
  favicon?: string;
}

let _nextId = 1;
function generateId(): TabId {
  return `tab-${_nextId++}`;
}

// Reset for tests
export function _resetIdCounter(): void {
  _nextId = 1;
}

export class TabManager {
  private tabs: Map<TabId, Tab> = new Map();
  private activeTabId: TabId | null = null;
  private order: TabId[] = [];

  /** Creates a new tab and optionally activates it. */
  createTab(url = "about:newtab", activate = true): Tab {
    const id = generateId();
    const tab: Tab = {
      id,
      url,
      title: "New Tab",
      isLoading: false,
      isPinned: false,
      isMuted: false,
      createdAt: new Date(),
    };

    this.tabs.set(id, tab);
    this.order.push(id);

    if (activate || this.activeTabId === null) {
      this.activeTabId = id;
    }

    return { ...tab };
  }

  /** Closes a tab by id. Activates an adjacent tab if the closed tab was active. */
  closeTab(id: TabId): void {
    if (!this.tabs.has(id)) {
      throw new Error(`Tab ${id} does not exist`);
    }

    const index = this.order.indexOf(id);
    this.tabs.delete(id);
    this.order.splice(index, 1);

    if (this.activeTabId === id) {
      if (this.order.length === 0) {
        this.activeTabId = null;
      } else {
        // Prefer the tab to the right; fall back to the left
        const newIndex = Math.min(index, this.order.length - 1);
        this.activeTabId = this.order[newIndex];
      }
    }
  }

  /** Returns the currently active tab or null if no tabs are open. */
  activeTab(): Tab | null {
    if (!this.activeTabId) return null;
    const tab = this.tabs.get(this.activeTabId);
    return tab ? { ...tab } : null;
  }

  /** Switches the active tab to the given id. */
  activateTab(id: TabId): void {
    if (!this.tabs.has(id)) {
      throw new Error(`Tab ${id} does not exist`);
    }
    this.activeTabId = id;
  }

  /** Updates mutable properties of an existing tab. */
  updateTab(id: TabId, updates: Partial<Pick<Tab, "url" | "title" | "isLoading" | "isPinned" | "isMuted" | "favicon">>): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      throw new Error(`Tab ${id} does not exist`);
    }
    Object.assign(tab, updates);
  }

  /** Returns all tabs in display order. */
  allTabs(): Tab[] {
    return this.order.map((id) => ({ ...this.tabs.get(id)! }));
  }

  /** Moves a tab to a new position in the order array. */
  moveTab(id: TabId, toIndex: number): void {
    const fromIndex = this.order.indexOf(id);
    if (fromIndex === -1) {
      throw new Error(`Tab ${id} does not exist`);
    }
    this.order.splice(fromIndex, 1);
    this.order.splice(toIndex, 0, id);
  }

  /** Duplicates an existing tab and returns the new one. */
  duplicateTab(id: TabId): Tab {
    const source = this.tabs.get(id);
    if (!source) {
      throw new Error(`Tab ${id} does not exist`);
    }
    return this.createTab(source.url, false);
  }

  get tabCount(): number {
    return this.tabs.size;
  }

  /** Closes all non-pinned tabs. */
  closeAllUnpinned(): void {
    const toClose = this.order.filter((id) => !this.tabs.get(id)?.isPinned);
    for (const id of toClose) {
      this.closeTab(id);
    }
  }
}
