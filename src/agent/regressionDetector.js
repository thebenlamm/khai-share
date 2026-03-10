'use strict';

/**
 * Pure regression comparison engine.
 *
 * Compares a stored baseline against the pages from a fresh crawl and returns
 * a structured diff with no I/O, no side effects, and no external dependencies.
 *
 * @param {object|null} baseline   - Baseline object from BaselineManager.getBaselineForSite()
 * @param {Array|null}  currentPages - Pages array from crawler results (crawler.results.pages)
 * @returns {{ hasRegressions: boolean, summary: object, regressions: Array }}
 */
function detectRegressions(baseline, currentPages) {
  const empty = {
    hasRegressions: false,
    summary: {
      titleChanges: 0,
      missingPages: 0,
      newPages: 0,
      statusChanges: 0,
      timingRegressions: 0,
      total: 0,
    },
    regressions: [],
  };

  if (!baseline || !currentPages) {
    return empty;
  }

  const baselinePages = (baseline.snapshot && baseline.snapshot.pages) || [];
  const threshold = baseline.thresholds && baseline.thresholds.pageLoadTime;
  const regressions = [];

  // Build URL-keyed Map from baseline pages for O(1) lookup
  const baselineMap = new Map();
  for (const page of baselinePages) {
    baselineMap.set(page.url, page);
  }

  // Build Set of current page URLs for missing/new detection
  const currentMap = new Map();
  for (const page of currentPages) {
    currentMap.set(page.url, page);
  }

  // 1. Find missing pages: in baseline but absent from current
  for (const [url, basePage] of baselineMap) {
    if (!currentMap.has(url)) {
      regressions.push({ type: 'page_missing', url, before: url, after: null });
    }
  }

  // 2. Find new pages: in current but absent from baseline
  for (const [url, curPage] of currentMap) {
    if (!baselineMap.has(url)) {
      regressions.push({ type: 'page_new', url, before: null, after: url });
    }
  }

  // 3. Compare shared pages: title, status, timing
  for (const [url, curPage] of currentMap) {
    const basePage = baselineMap.get(url);
    if (!basePage) continue; // new page already handled above

    // Title change: only when BOTH titles are non-null strings that differ
    if (
      basePage.title !== null &&
      basePage.title !== undefined &&
      curPage.title !== null &&
      curPage.title !== undefined &&
      basePage.title !== curPage.title
    ) {
      regressions.push({
        type: 'title_changed',
        url,
        before: basePage.title,
        after: curPage.title,
      });
    }

    // Status change: flag if status code differs
    if (basePage.status !== curPage.status) {
      regressions.push({
        type: 'status_changed',
        url,
        before: basePage.status,
        after: curPage.status,
      });
    }

    // Timing regression: flag if current loadTime exceeds the threshold
    // Uses threshold as ceiling — NOT a direct comparison to baseline loadTime
    if (threshold != null && curPage.loadTime > threshold) {
      regressions.push({
        type: 'timing_regression',
        url,
        before: threshold,
        after: curPage.loadTime,
        threshold,
        actual: curPage.loadTime,
      });
    }
  }

  // Build summary from regression array
  const summary = {
    titleChanges: 0,
    missingPages: 0,
    newPages: 0,
    statusChanges: 0,
    timingRegressions: 0,
    total: regressions.length,
  };

  for (const r of regressions) {
    switch (r.type) {
      case 'title_changed':    summary.titleChanges++;      break;
      case 'page_missing':     summary.missingPages++;      break;
      case 'page_new':         summary.newPages++;          break;
      case 'status_changed':   summary.statusChanges++;     break;
      case 'timing_regression': summary.timingRegressions++; break;
    }
  }

  return {
    hasRegressions: summary.total > 0,
    summary,
    regressions,
  };
}

module.exports = { detectRegressions };
