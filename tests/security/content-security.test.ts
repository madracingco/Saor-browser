import {
  assessSecurity,
  hasMixedContent,
  parseCspHeader,
  cspAllowsInlineScript,
  cspAllowsEval,
  isBlockedByLocalList,
  addToBlocklist,
  removeFromBlocklist,
} from "../../src/security/content-security";

describe("assessSecurity", () => {
  it("marks https URLs as secure", () => {
    const info = assessSecurity("https://example.com");
    expect(info.level).toBe("secure");
    expect(info.issues).toHaveLength(0);
  });

  it("marks http URLs as insecure", () => {
    const info = assessSecurity("http://example.com");
    expect(info.level).toBe("insecure");
    expect(info.issues.length).toBeGreaterThan(0);
  });

  // Missing: invalid URL test → level === "unknown"
  // Missing: other protocols (ftp, file) test
});

describe("hasMixedContent", () => {
  it("detects http resources on an https page", () => {
    expect(
      hasMixedContent("https://page.com", ["http://cdn.example.com/img.png"])
    ).toBe(true);
  });

  it("returns false when all resources are https", () => {
    expect(
      hasMixedContent("https://page.com", ["https://cdn.example.com/img.png"])
    ).toBe(false);
  });

  // Missing: http page with http resources (should return false — not mixed)
  // Missing: malformed resource URL (should be skipped, not throw)
  // Missing: empty resource list
});

describe("parseCspHeader", () => {
  it("parses a basic CSP string", () => {
    const csp = parseCspHeader("default-src 'self'; script-src 'self' https://cdn.example.com");
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("script-src")).toContain("https://cdn.example.com");
  });

  // Missing: empty header
  // Missing: CSP with trailing semicolon / extra whitespace
});

describe("cspAllowsInlineScript / cspAllowsEval", () => {
  it("detects unsafe-inline", () => {
    const csp = parseCspHeader("script-src 'unsafe-inline'");
    expect(cspAllowsInlineScript(csp)).toBe(true);
  });

  it("detects unsafe-eval", () => {
    const csp = parseCspHeader("default-src 'unsafe-eval'");
    expect(cspAllowsEval(csp)).toBe(true);
  });

  // Missing: script-src overrides default-src for eval check
  // Missing: CSP with no script-src or default-src (should return false)
});

describe("isBlockedByLocalList / addToBlocklist / removeFromBlocklist", () => {
  it("blocks known malicious hostnames", () => {
    expect(isBlockedByLocalList("https://malware-example.test/page")).toBe(true);
  });

  it("does not block unknown hostnames", () => {
    expect(isBlockedByLocalList("https://safe-site.example.com")).toBe(false);
  });

  it("adds and removes custom blocks", () => {
    addToBlocklist("bad-actor.test");
    expect(isBlockedByLocalList("https://bad-actor.test")).toBe(true);
    removeFromBlocklist("bad-actor.test");
    expect(isBlockedByLocalList("https://bad-actor.test")).toBe(false);
  });

  // Missing: malformed URL → should return false, not throw
  // Missing: subdomain of a blocked root is NOT blocked (current impl: exact match only)
});
