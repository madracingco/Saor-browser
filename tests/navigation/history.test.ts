import { NavigationHistory } from "../../src/navigation/history";

describe("NavigationHistory", () => {
  let history: NavigationHistory;

  beforeEach(() => {
    history = new NavigationHistory();
  });

  describe("push", () => {
    it("starts empty", () => {
      expect(history.length).toBe(0);
      expect(history.current()).toBeNull();
    });

    it("adds entries and updates current", () => {
      history.push("https://a.com", "A");
      expect(history.length).toBe(1);
      expect(history.current()!.url).toBe("https://a.com");
    });

    it("discards forward history when a new page is pushed", () => {
      history.push("https://a.com");
      history.push("https://b.com");
      history.back();
      history.push("https://c.com");
      expect(history.length).toBe(2);
      expect(history.current()!.url).toBe("https://c.com");
    });
  });

  describe("back / forward", () => {
    it("navigates backward", () => {
      history.push("https://a.com");
      history.push("https://b.com");
      const prev = history.back();
      expect(prev!.url).toBe("https://a.com");
      expect(history.canGoForward()).toBe(true);
    });

    it("returns null when already at the start", () => {
      history.push("https://a.com");
      expect(history.back()).toBeNull();
    });

    it("navigates forward after going back", () => {
      history.push("https://a.com");
      history.push("https://b.com");
      history.back();
      const next = history.forward();
      expect(next!.url).toBe("https://b.com");
    });

    it("returns null when already at the end", () => {
      history.push("https://a.com");
      expect(history.forward()).toBeNull();
    });
  });

  describe("search", () => {
    it("finds entries matching the URL", () => {
      history.push("https://example.com", "Example");
      history.push("https://other.com", "Other");
      const results = history.search("example");
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe("https://example.com");
    });
  });

  // Missing: maxEntries cap enforcement test
  // Missing: clear() test
  // Missing: all() ordering test
  // Missing: case-insensitive title search test
});
