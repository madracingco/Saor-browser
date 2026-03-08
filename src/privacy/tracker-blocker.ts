/**
 * Tracker blocking module for Saor browser.
 * Lightweight rule matching — avoids heavyweight list libraries.
 */

export type BlockRule = string; // hostname or domain suffix

export interface BlockResult {
  blocked: boolean;
  matchedRule?: string;
}

export class TrackerBlocker {
  private rules: Set<BlockRule> = new Set();

  constructor(initialRules: BlockRule[] = []) {
    for (const rule of initialRules) {
      this.addRule(rule);
    }
  }

  addRule(rule: BlockRule): void {
    this.rules.add(rule.toLowerCase().trim());
  }

  removeRule(rule: BlockRule): void {
    this.rules.delete(rule.toLowerCase().trim());
  }

  /** Returns true if a hostname matches any rule (exact or suffix match). */
  check(hostname: string): BlockResult {
    const lower = hostname.toLowerCase();

    for (const rule of this.rules) {
      if (lower === rule || lower.endsWith("." + rule)) {
        return { blocked: true, matchedRule: rule };
      }
    }

    return { blocked: false };
  }

  /** Filters a list of resource URLs, returning only those that are blocked. */
  filterRequests(resourceUrls: string[]): string[] {
    return resourceUrls.filter((url) => {
      try {
        const { hostname } = new URL(url);
        return this.check(hostname).blocked;
      } catch {
        return false;
      }
    });
  }

  get ruleCount(): number {
    return this.rules.size;
  }

  allRules(): BlockRule[] {
    return [...this.rules];
  }
}
