/**
 * Saor Browser — entry point.
 *
 * Saor (Irish: "free") is an extremely minimal, lightweight browser
 * designed to run well on constrained hardware such as the Raspberry Pi Zero 2 W.
 *
 * Architecture goals:
 *  - Zero runtime dependencies (pure TypeScript, compiled to vanilla JS)
 *  - Low memory footprint — defaults tuned for <512 MB RAM devices
 *  - No background telemetry or analytics
 */

export { NavigationHistory } from "./navigation/history";
export { normaliseInput, parseUrl, isSearchQuery, isSafeProtocol, stripTrackingParams, extractDomain } from "./navigation/url-parser";
export { TabManager } from "./tabs/tab-manager";
export { BookmarkStore } from "./bookmarks/bookmark-store";
export { TrackerBlocker } from "./privacy/tracker-blocker";
export { SettingsStore } from "./settings/settings-store";
export { assessSecurity, hasMixedContent, parseCspHeader, isBlockedByLocalList } from "./security/content-security";
