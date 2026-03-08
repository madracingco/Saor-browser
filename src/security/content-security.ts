/**
 * Content security utilities for Saor browser.
 * Handles mixed-content detection, CSP header parsing, and safe-browsing checks.
 */

export type SecurityLevel = "secure" | "insecure" | "mixed" | "unknown";

export interface SecurityInfo {
  level: SecurityLevel;
  protocol: string;
  issues: string[];
}

/**
 * Assesses the security level of a page URL.
 */
export function assessSecurity(pageUrl: string): SecurityInfo {
  let protocol: string;
  try {
    protocol = new URL(pageUrl).protocol;
  } catch {
    return { level: "unknown", protocol: "", issues: ["Invalid URL"] };
  }

  if (protocol === "https:") {
    return { level: "secure", protocol, issues: [] };
  }

  if (protocol === "http:") {
    return { level: "insecure", protocol, issues: ["Page is served over an unencrypted connection"] };
  }

  return { level: "unknown", protocol, issues: [] };
}

/**
 * Returns true if the page loads any HTTP resources from an HTTPS page (mixed content).
 */
export function hasMixedContent(pageUrl: string, resourceUrls: string[]): boolean {
  let pageProtocol: string;
  try {
    pageProtocol = new URL(pageUrl).protocol;
  } catch {
    return false;
  }

  if (pageProtocol !== "https:") return false;

  for (const resource of resourceUrls) {
    try {
      if (new URL(resource).protocol === "http:") return true;
    } catch {
      // relative URLs are same-origin and therefore safe — skip
    }
  }

  return false;
}

/**
 * Very simplified CSP directive parser.
 * Returns a map of directive name → list of source tokens.
 */
export function parseCspHeader(headerValue: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  const parts = headerValue.split(";").map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    const [name, ...tokens] = part.split(/\s+/);
    if (name) {
      directives.set(name.toLowerCase(), tokens);
    }
  }

  return directives;
}

/**
 * Returns true if the CSP allows inline scripts (unsafe-inline in script-src or default-src).
 */
export function cspAllowsInlineScript(csp: Map<string, string[]>): boolean {
  const scriptSrc = csp.get("script-src") ?? csp.get("default-src") ?? [];
  return scriptSrc.includes("'unsafe-inline'");
}

/**
 * Returns true if the CSP allows eval() (unsafe-eval in script-src or default-src).
 */
export function cspAllowsEval(csp: Map<string, string[]>): boolean {
  const scriptSrc = csp.get("script-src") ?? csp.get("default-src") ?? [];
  return scriptSrc.includes("'unsafe-eval'");
}

// ── Safe-browsing blocklist (stub) ─────────────────────────────────────────

const KNOWN_MALICIOUS: Set<string> = new Set([
  "malware-example.test",
  "phishing-example.test",
]);

/**
 * Checks a URL against a local blocklist.
 * In production this would call an external safe-browsing API.
 */
export function isBlockedByLocalList(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return KNOWN_MALICIOUS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Adds a hostname to the in-memory blocklist (used for user-defined blocks and tests).
 */
export function addToBlocklist(hostname: string): void {
  KNOWN_MALICIOUS.add(hostname);
}

/**
 * Removes a hostname from the in-memory blocklist.
 */
export function removeFromBlocklist(hostname: string): void {
  KNOWN_MALICIOUS.delete(hostname);
}
