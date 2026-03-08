/**
 * URL parsing and validation utilities for Saor browser.
 * Handles raw user input, protocol normalisation, and URL canonicalisation.
 */

export interface ParsedUrl {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  href: string;
}

export type UrlInput = string;

const SAFE_PROTOCOLS = new Set(["https:", "http:", "ftp:", "file:", "about:", "data:"]);
const BLOCKED_PROTOCOLS = new Set(["javascript:", "vbscript:", "data:"]);

/**
 * Determines if a string looks like a search query rather than a URL.
 */
export function isSearchQuery(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.includes(" ")) return true;
  if (!trimmed.includes(".") && !trimmed.startsWith("localhost")) return true;
  if (trimmed.startsWith("?")) return true;
  return false;
}

/**
 * Normalises a raw user input string into an absolute URL string.
 * Falls back to a search URL when the input looks like a query.
 */
export function normaliseInput(input: string, searchEngine = "https://search.saor.ie/search?q="): string {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";

  if (isSearchQuery(trimmed)) {
    return searchEngine + encodeURIComponent(trimmed);
  }

  // Add protocol if missing
  if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmed) && !trimmed.startsWith("about:")) {
    return "https://" + trimmed;
  }

  return trimmed;
}

/**
 * Parses a URL string and returns a structured object.
 * Returns null if the URL is malformed or uses a blocked protocol.
 */
export function parseUrl(rawUrl: string): ParsedUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (BLOCKED_PROTOCOLS.has(url.protocol)) {
    return null;
  }

  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    href: url.href,
  };
}

/**
 * Returns true if the URL uses a safe, allowlisted protocol.
 */
export function isSafeProtocol(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.has(parsed.protocol) && !BLOCKED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Strips tracking parameters (utm_*, fbclid, gclid, etc.) from a URL.
 */
export function stripTrackingParams(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const TRACKING_PARAMS = [
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "fbclid", "gclid", "msclkid", "mc_eid", "yclid", "_ga",
  ];

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  return url.toString();
}

/**
 * Extracts the effective domain (eTLD+1) from a hostname.
 * Simplified implementation — does not use a public-suffix list.
 */
export function extractDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}
