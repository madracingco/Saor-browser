import { BookmarkStore, _resetBookmarkCounters } from "../../src/bookmarks/bookmark-store";

beforeEach(() => _resetBookmarkCounters());

describe("BookmarkStore", () => {
  let store: BookmarkStore;

  beforeEach(() => {
    store = new BookmarkStore();
  });

  describe("add / remove", () => {
    it("adds a bookmark and increments count", () => {
      store.add("https://example.com", "Example");
      expect(store.bookmarkCount).toBe(1);
    });

    it("removes a bookmark", () => {
      const bm = store.add("https://example.com", "Example");
      store.remove(bm.id);
      expect(store.bookmarkCount).toBe(0);
    });

    it("throws when removing a non-existent bookmark", () => {
      expect(() => store.remove("ghost")).toThrow();
    });
  });

  describe("hasUrl", () => {
    it("returns true for a bookmarked URL", () => {
      store.add("https://example.com", "Example");
      expect(store.hasUrl("https://example.com")).toBe(true);
    });

    it("returns false for an unbookmarked URL", () => {
      expect(store.hasUrl("https://not-bookmarked.com")).toBe(false);
    });
  });

  describe("search", () => {
    it("finds bookmarks by URL fragment", () => {
      store.add("https://example.com", "Example");
      store.add("https://other.com", "Other");
      expect(store.search("example")).toHaveLength(1);
    });
  });

  // Missing: folder creation and bookmark assignment test
  // Missing: deleteFolder recursive test
  // Missing: deleteFolder non-empty without recursive flag throws
  // Missing: byTag test
  // Missing: update() changes fields test
  // Missing: add() with invalid folderId throws
  // Missing: all(folderId) filters correctly
  // Missing: renameFolder test
  // Missing: search by tag and description
});
