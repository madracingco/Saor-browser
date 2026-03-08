import {
  isSearchQuery,
  normaliseInput,
  parseUrl,
  isSafeProtocol,
  stripTrackingParams,
  extractDomain,
} from "../../src/navigation/url-parser";

describe("isSearchQuery", () => {
  it("treats strings with spaces as search queries", () => {
    expect(isSearchQuery("how to bake bread")).toBe(true);
  });

  it("treats strings without dots as search queries", () => {
    expect(isSearchQuery("wikipedia")).toBe(true);
  });

  it("does not treat hostnames as search queries", () => {
    expect(isSearchQuery("example.com")).toBe(false);
  });

  it("treats localhost as a URL, not a query", () => {
    expect(isSearchQuery("localhost")).toBe(false);
  });
});

describe("normaliseInput", () => {
  it("returns about:blank for empty input", () => {
    expect(normaliseInput("")).toBe("about:blank");
    expect(normaliseInput("   ")).toBe("about:blank");
  });

  it("prepends https:// to bare hostnames", () => {
    expect(normaliseInput("example.com")).toBe("https://example.com");
  });

  it("converts search queries to search URLs", () => {
    const result = normaliseInput("hello world");
    expect(result).toContain("hello%20world");
  });

  it("leaves URLs with a scheme untouched", () => {
    expect(normaliseInput("https://example.com/path")).toBe("https://example.com/path");
  });

  // NOTE: Custom search engine parameter is not tested — see coverage gap analysis
});

describe("parseUrl", () => {
  it("parses a valid HTTPS URL", () => {
    const result = parseUrl("https://example.com/path?q=1#section");
    expect(result).not.toBeNull();
    expect(result!.hostname).toBe("example.com");
    expect(result!.pathname).toBe("/path");
    expect(result!.search).toBe("?q=1");
    expect(result!.hash).toBe("#section");
  });

  it("returns null for malformed URLs", () => {
    expect(parseUrl("not a url")).toBeNull();
    expect(parseUrl("")).toBeNull();
  });

  it("returns null for javascript: URLs", () => {
    expect(parseUrl("javascript:alert(1)")).toBeNull();
  });

  // Missing: vbscript: protocol test
  // Missing: ftp:, file:, about: protocol happy-path tests
});

describe("isSafeProtocol", () => {
  it("returns true for https", () => {
    expect(isSafeProtocol("https://example.com")).toBe(true);
  });

  it("returns false for javascript:", () => {
    expect(isSafeProtocol("javascript:void(0)")).toBe(false);
  });

  // Missing: http, ftp, file, about, data protocol tests
  // Missing: malformed URL test
});

describe("stripTrackingParams", () => {
  it("removes utm_ parameters", () => {
    const result = stripTrackingParams("https://example.com/page?utm_source=google&utm_medium=cpc&keep=1");
    expect(result).not.toContain("utm_source");
    expect(result).not.toContain("utm_medium");
    expect(result).toContain("keep=1");
  });

  it("removes fbclid", () => {
    const result = stripTrackingParams("https://example.com/?fbclid=abc123");
    expect(result).not.toContain("fbclid");
  });

  // Missing: gclid, msclkid, _ga tests
  // Missing: malformed URL passthrough test
  // Missing: URL with no tracking params (no-op) test
});

describe("extractDomain", () => {
  it("returns the last two parts for standard hostnames", () => {
    expect(extractDomain("www.example.com")).toBe("example.com");
    expect(extractDomain("sub.domain.example.co")).toBe("example.co");
  });

  // Missing: two-part hostname (e.g. "example.com" should return "example.com")
  // Missing: single-part hostname (e.g. "localhost")
  // Missing: deep subdomain (e.g. "a.b.c.d.example.com")
});
