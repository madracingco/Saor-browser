/**
 * Browser history manager.
 * Tracks visited pages in a session and provides navigation (back/forward).
 */

export interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: Date;
}

export class NavigationHistory {
  private entries: HistoryEntry[] = [];
  private currentIndex = -1;
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Pushes a new entry onto the history stack.
   * Discards any forward entries that existed beyond the current position.
   */
  push(url: string, title = ""): void {
    // Drop any forward history
    this.entries = this.entries.slice(0, this.currentIndex + 1);

    this.entries.push({ url, title, visitedAt: new Date() });
    this.currentIndex = this.entries.length - 1;

    // Trim oldest entries if we've exceeded the cap
    if (this.entries.length > this.maxEntries) {
      const overflow = this.entries.length - this.maxEntries;
      this.entries.splice(0, overflow);
      this.currentIndex -= overflow;
    }
  }

  /** Navigates backward and returns the previous entry, or null if none. */
  back(): HistoryEntry | null {
    if (!this.canGoBack()) return null;
    this.currentIndex--;
    return this.entries[this.currentIndex];
  }

  /** Navigates forward and returns the next entry, or null if none. */
  forward(): HistoryEntry | null {
    if (!this.canGoForward()) return null;
    this.currentIndex++;
    return this.entries[this.currentIndex];
  }

  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  canGoForward(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  current(): HistoryEntry | null {
    if (this.currentIndex < 0) return null;
    return this.entries[this.currentIndex];
  }

  /** Returns all history entries, oldest first. */
  all(): HistoryEntry[] {
    return [...this.entries];
  }

  /** Clears all history. */
  clear(): void {
    this.entries = [];
    this.currentIndex = -1;
  }

  /** Returns entries whose URL or title contains the query string (case-insensitive). */
  search(query: string): HistoryEntry[] {
    const lower = query.toLowerCase();
    return this.entries.filter(
      (e) => e.url.toLowerCase().includes(lower) || e.title.toLowerCase().includes(lower)
    );
  }

  get length(): number {
    return this.entries.length;
  }
}
