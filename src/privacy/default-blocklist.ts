/**
 * Default tracker blocklist for Saor browser.
 *
 * A minimal, curated list of high-traffic tracker and ad-network domains.
 * Kept intentionally small so it loads fast on constrained hardware.
 *
 * Users may extend this at runtime via TrackerBlocker.addRule().
 */
export const DEFAULT_BLOCKLIST: readonly string[] = [
  // Google analytics & ads
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "googlesyndication.com",
  "doubleclick.net",
  "google-adservices.com",

  // Meta / Facebook
  "connect.facebook.net",
  "facebook.net",

  // Twitter / X ads
  "ads.twitter.com",
  "analytics.twitter.com",
  "ads-twitter.com",

  // Microsoft ads
  "bat.bing.com",
  "msads.net",

  // Data brokers / analytics
  "scorecardresearch.com",
  "omtrdc.net",        // Adobe Analytics
  "demdex.net",        // Adobe Audience Manager
  "quantserve.com",
  "hotjar.com",
  "fullstory.com",
  "logrocket.com",
  "mouseflow.com",
  "crazyegg.com",
  "inspectlet.com",

  // Product analytics
  "mixpanel.com",
  "segment.io",
  "segment.com",
  "amplitude.com",
  "heap.io",
  "heapanalytics.com",

  // Ad networks
  "adnxs.com",          // Xandr/AppNexus
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "criteo.com",
  "criteo.net",
  "taboola.com",
  "outbrain.com",
  "advertising.com",
  "adblade.com",
  "revcontent.com",

  // CDNs used predominantly for tracking
  "cdn.mxpnl.com",
];
