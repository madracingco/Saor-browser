import { TrackerBlocker } from "../../src/privacy/tracker-blocker";

describe("TrackerBlocker", () => {
  let blocker: TrackerBlocker;

  beforeEach(() => {
    blocker = new TrackerBlocker(["tracking.example.com", "ads.net"]);
  });

  describe("check", () => {
    it("blocks an exact hostname match", () => {
      expect(blocker.check("tracking.example.com").blocked).toBe(true);
    });

    it("blocks subdomains of a blocked domain", () => {
      expect(blocker.check("sub.ads.net").blocked).toBe(true);
    });

    it("does not block unrelated hostnames", () => {
      expect(blocker.check("legitimate.com").blocked).toBe(false);
    });

    it("returns the matched rule", () => {
      const result = blocker.check("tracking.example.com");
      expect(result.matchedRule).toBe("tracking.example.com");
    });
  });

  // Missing: filterRequests tests
  // Missing: addRule / removeRule tests
  // Missing: case-insensitive matching (e.g. "ADS.NET" should match "ads.net")
  // Missing: ruleCount / allRules tests
  // Missing: empty blocklist (nothing blocked)
  // Missing: malformed URL in filterRequests
});
