# Test Coverage Analysis — Saor Browser

> **Target hardware:** Raspberry Pi Zero 2 W (512 MB RAM, quad-core ARM Cortex-A53 @ 1 GHz).
> All modules are deliberately dependency-free and allocation-minimal.

---

## 1. Current Coverage Summary

| Module | File | Estimated line coverage | Notes |
|---|---|---|---|
| URL Parser | `src/navigation/url-parser.ts` | ~60 % | Core happy paths covered; edge cases missing |
| Navigation History | `src/navigation/history.ts` | ~55 % | Back/forward basics covered; cap & clear untested |
| Tab Manager | `src/tabs/tab-manager.ts` | ~50 % | Create/close/update covered; reorder & pin logic untested |
| Bookmark Store | `src/bookmarks/bookmark-store.ts` | ~35 % | Add/remove/search basics only; folder tree untested |
| Content Security | `src/security/content-security.ts` | ~55 % | Happy paths covered; edge protocols & CSP fallbacks untested |
| Tracker Blocker | `src/privacy/tracker-blocker.ts` | ~40 % | check() covered; filterRequests, mutation, edge cases missing |
| Settings Store | `src/settings/settings-store.ts` | ~40 % | get/set covered; reset, export/import untested |

**Overall estimated coverage: ~48 %** (target: ≥ 80 %)

---

## 2. Proposed Improvements (Priority Order)

### 2.1 HIGH — Security-critical paths

#### `src/security/content-security.ts`

These gaps could allow malicious content to go undetected.

| Gap | Why it matters |
|---|---|
| `assessSecurity` with invalid URL | Must return `level: "unknown"`, not throw — callers assume a defined return value |
| `hasMixedContent` on HTTP page | An HTTP page loading HTTP resources is **not** mixed content; the function must return `false` |
| Malformed resource URL in `hasMixedContent` | A bad resource URL must be skipped silently, not propagate an exception |
| `cspAllowsEval` when only `script-src` is set (no `default-src`) | Fallback logic must be verified; a missing fallback silently permits eval |
| `isBlockedByLocalList` with malformed URL | Must return `false`, not throw a `TypeError` |

**Suggested tests:**
```typescript
it("returns unknown for invalid URL", () => {
  expect(assessSecurity("not-a-url").level).toBe("unknown");
});

it("does not flag http resources on an http page as mixed", () => {
  expect(hasMixedContent("http://page.com", ["http://cdn.com/img.png"])).toBe(false);
});

it("handles malformed resource URL gracefully", () => {
  expect(() => hasMixedContent("https://page.com", ["::bad:url"])).not.toThrow();
});
```

---

#### `src/navigation/url-parser.ts`

| Gap | Why it matters |
|---|---|
| `parseUrl("vbscript:...")` | `vbscript:` is in `BLOCKED_PROTOCOLS` but no test asserts it is blocked |
| `isSafeProtocol` for `http`, `ftp`, `file`, `about` | These are in the allowlist; regressions here would be silent |
| `isSafeProtocol` with a malformed URL | Must return `false` — the catch branch is untested |
| `normaliseInput` with a custom search engine | Second parameter is never exercised; a misconfigured engine would go undetected |
| `stripTrackingParams` — no-op case | A URL with no tracking params must be returned unchanged (not an empty string) |
| `stripTrackingParams` with a malformed URL | Must return the raw string unchanged |
| `extractDomain` with ≤ 2 parts | `"example.com"` → `"example.com"`, `"localhost"` → `"localhost"` |

---

### 2.2 HIGH — Core browsing UX reliability

#### `src/navigation/history.ts`

| Gap | Why it matters |
|---|---|
| `maxEntries` cap | When >1000 pages are pushed, the oldest must be trimmed and `currentIndex` must remain consistent |
| `clear()` | After clearing, `length === 0`, `current() === null`, `canGoBack() === false` |
| `all()` returns a copy | Mutating the returned array must not affect internal state |
| Case-insensitive search on `title` | Titles are stored as-entered; search must normalise both sides |

```typescript
it("trims history when maxEntries is exceeded", () => {
  const h = new NavigationHistory(3);
  h.push("a.com"); h.push("b.com"); h.push("c.com"); h.push("d.com");
  expect(h.length).toBe(3);
  expect(h.all()[0].url).toBe("b.com");
});
```

#### `src/tabs/tab-manager.ts`

| Gap | Why it matters |
|---|---|
| `moveTab` reordering | Incorrect index arithmetic could corrupt the display order |
| `duplicateTab` | New tab must have a different `id` but same `url` |
| `closeAllUnpinned` | Pinned tabs must survive; active tab must be updated if it was unpinned |
| `allTabs` ordering | Must reflect the display order, not insertion order after moves |
| `activeTab()` with no tabs | Must return `null` — callers guard on this |
| `updateTab` on non-existent tab | Must throw, not silently no-op |

```typescript
it("preserves pinned tabs when closing all unpinned", () => {
  const pinned = manager.createTab("https://pinned.com");
  manager.updateTab(pinned.id, { isPinned: true });
  manager.createTab("https://unpinned.com");
  manager.closeAllUnpinned();
  expect(manager.tabCount).toBe(1);
  expect(manager.allTabs()[0].isPinned).toBe(true);
});
```

---

### 2.3 MEDIUM — Data integrity

#### `src/bookmarks/bookmark-store.ts`

The bookmark module has the lowest coverage (~35 %) and the most branching logic.

| Gap | Why it matters |
|---|---|
| Folder creation with invalid `parentId` | Must throw; silent failure would produce an orphaned folder |
| `deleteFolder` non-empty without `recursive` | Must throw — data loss otherwise |
| `deleteFolder` recursive | Must delete all children and bookmarks transitively |
| `all(folderId)` filtering | Uncovered branch; wrong filter would lose bookmarks |
| `byTag` | Completely untested |
| `update()` with invalid `folderId` | Must throw |
| `search` by description and tags | Partial coverage — only URL/title branch exercised |
| `renameFolder` | Completely untested |

```typescript
it("deletes a folder and its bookmarks recursively", () => {
  const folder = store.createFolder("test");
  store.add("https://a.com", "A", folder.id);
  store.deleteFolder(folder.id, true);
  expect(store.bookmarkCount).toBe(0);
});

it("throws when deleting a non-empty folder without recursive flag", () => {
  const folder = store.createFolder("test");
  store.add("https://a.com", "A", folder.id);
  expect(() => store.deleteFolder(folder.id)).toThrow();
});
```

---

#### `src/settings/settings-store.ts`

| Gap | Why it matters |
|---|---|
| `reset(key)` restores default | Core UX — "Reset to defaults" button depends on this |
| `resetAll()` clears all overrides | Used by privacy-clear flows |
| `export()` only includes overrides | If defaults leak into exports, re-imports will break future default changes |
| `import()` round-trip | Ensures persist-and-reload works correctly |
| `set()` with unknown key throws | Prevents silent mis-configuration |
| Constructor with initial overrides | Tests that the shorthand initialiser works |

---

### 2.4 MEDIUM — Privacy

#### `src/privacy/tracker-blocker.ts`

| Gap | Why it matters |
|---|---|
| `filterRequests` | Core API never exercised in tests |
| `addRule` / `removeRule` mutation | Dynamic rule updates are untested |
| Case-insensitive matching | `ADS.NET` must match the lowercase rule `ads.net` |
| `ruleCount` / `allRules` | Accessors untested; regressions would be silent |
| Empty blocklist | `check` on an empty blocker must always return `{ blocked: false }` |
| Malformed URL in `filterRequests` | Must be silently skipped |

---

### 2.5 LOW — Integration & performance tests (future)

These are not covered by unit tests at all and should be added once the renderer layer is built:

| Area | What to test |
|---|---|
| **Tab + History integration** | Navigating in a tab pushes to its history; closing a tab destroys its history |
| **Settings + TrackerBlocker** | Disabling `privacy.blockTrackers` in settings propagates to the blocker |
| **URL parser → security** | `normaliseInput` output is always a safe-protocol URL |
| **Memory budget** (Pi Zero 2 W target) | 20 open tabs with full history must stay within a configurable RSS ceiling |
| **Startup time** | Module load + first paint must be measurable and regressions caught |

---

## 3. Coverage Improvement Plan

```
Phase 1 (this sprint) — close security gaps
  ✓ content-security edge cases (invalid URLs, mixed-content false-positive, CSP fallbacks)
  ✓ url-parser blocked protocols & edge inputs

Phase 2 — UX reliability
  ✓ history maxEntries cap & clear
  ✓ tab moveTab, duplicateTab, closeAllUnpinned
  ✓ settings reset / export / import round-trip

Phase 3 — data integrity
  ✓ bookmark folder CRUD (recursive delete, byTag, search depth)
  ✓ tracker-blocker filterRequests, mutation, case folding

Phase 4 — integration
  ✓ tab + history integration scenarios
  ✓ settings propagation to tracker blocker
  ✓ memory / performance regression tests
```

**Target: ≥ 80 % line coverage across all modules after Phase 2.**

---

## 4. Notes on Pi Zero 2 W Constraints

Because Saor targets very constrained hardware, the test suite itself should:

- **Avoid large fixtures** — test data should be minimal; no multi-MB JSON blobs.
- **Test the `performance.maxTabs` setting is respected** — the tab manager must refuse to create tabs beyond the configured limit when running in low-memory mode.
- **Benchmark startup time** — even a 500 ms regression is noticeable on a 1 GHz core.
- **No heavy test dependencies** — the existing `jest` + `ts-jest` stack is appropriate; avoid adding Playwright/Puppeteer to the unit-test pipeline.
