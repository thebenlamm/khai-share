"""Khai MCP Server — browser automation and website testing for Claude Code."""

import logging
import os
import sys
import time

from mcp.server.fastmcp import FastMCP

from . import client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

mcp = FastMCP(
    "khai",
    instructions="""Khai (חי) is a browser automation agent for authenticated website testing.
It runs as an Express server on localhost:3001 with Puppeteer for browser control.

Available tools:
- khai_list_sites: See which sites are configured with credentials
- khai_start_test: Start an authenticated crawl test on a site (supports webhook_url)
- khai_test_status: Check if a running test is done yet
- khai_test_results: Get full results from a completed test
- khai_execute_actions: Run a sequence of browser actions (navigate, screenshot, etc.) (supports webhook_url)
- khai_action_status: Check if a running action session is done yet (summary only)
- khai_action_results: Get full results from a completed action session
- khai_run_audit: Start a security/configuration audit on a site (supports webhook_url)
- khai_audit_results: Get audit status and results
- khai_check_links: Check a site for broken links (supports webhook_url)
- khai_watch_create: Create a scheduled watch to monitor an authenticated page for changes (fires webhook on change)
- khai_watch_list: List all configured watches and their status
- khai_watch_delete: Delete a watch by id
- khai_watch_history: Get recent run records for a watch showing what changed and when
- khai_action_har: Get the HAR network trace from a completed action session (must start with record_har=True)

Features beyond MCP tools (available via REST API on localhost:3001):
- Test suites: saved test definitions with tag filtering, replay, run history, and trend analysis (/api/suites/*)
- Accessibility audits: axe-core WCAG compliance checking
- Animation/transition screenshot capture
- Issue deduplication with severity tiers (critical/high/medium/low)
- Login failure detection and session expiry handling
- Lighthouse performance/SEO/accessibility scoring (/api/advanced/lighthouse)
- Visual regression with pixelmatch (/api/advanced/visual/compare)
- Flow testing with multi-step sequences (/api/advanced/flows/run)
- API and form fuzzing (/api/advanced/fuzz/*)
- Quick actions: /api/actions/create-note, /api/actions/send-fax, /api/actions/send-sms

Workflow:
1. Use khai_list_sites() to see configured sites and accounts
2. Start a test/audit/action sequence
3. Poll status until complete
4. Get results

All operations are async — they return an ID immediately, then you poll for completion.

Webhooks: Any start operation accepts an optional webhook_url parameter. When provided,
Khai will POST the full results to that URL when the operation completes. Payloads are
signed with HMAC-SHA256 if KHAI_WEBHOOK_SECRET is set. Delivery retries up to 3 times
with exponential backoff. Check the webhook field in results for delivery status.

Watches: Use khai_watch_create to monitor authenticated pages on a schedule. Khai logs in, captures
content and a screenshot, and compares to the previous run. When content or visual changes are detected,
a webhook notification fires. Use khai_watch_history to review what changed and when.

HAR Recording: Use record_har=True in khai_execute_actions to capture all network traffic during a session.
After the session completes, use khai_action_har to retrieve the full HAR 1.2 file. Useful for debugging
API calls, analyzing page load waterfalls, and auditing network behavior. The HAR file can be opened in
Chrome DevTools (Network tab > Import) or any HAR viewer.

Baselines & Regression Detection: Use khai_baseline_create to snapshot a completed crawl as a baseline.
Use khai_baseline_list and khai_baseline_get to inspect baselines. Use khai_baseline_update to refresh
from a new crawl. Use khai_baseline_delete to remove a baseline. When a crawl completes for a site with
an active baseline, regressions (title changes, missing pages, status code changes, timing degradation)
appear automatically in test results.

IMPORTANT: Khai's Express server (localhost:3001) must be running. Check with khai_list_sites first.
""",
)


def _unwrap(resp: dict) -> dict:
    """Unwrap the {success, data, error} envelope."""
    if resp.get("success"):
        return resp.get("data", resp)
    raise Exception(resp.get("error", "Unknown Khai error"))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_list_sites() -> dict:
    """List all configured sites and their accounts.

    Returns configured site names, base URLs, and available account types.
    Use this first to discover what sites Khai can test.
    """
    try:
        return _unwrap(client.get("/api/sites"))
    except Exception as e:
        return {"error": str(e), "hint": "Is the Khai server running? Start it with: cd ~/Workspace/khai-share && npm start"}


@mcp.tool(annotations={"destructiveHint": True, "openWorldHint": True})
def khai_start_test(
    site: str,
    account: str,
    max_depth: int = 3,
    viewport: str = "desktop",
    start_path: str | None = None,
    webhook_url: str | None = None,
) -> dict:
    """Start an authenticated crawl test on a configured site.

    Logs in with stored credentials, then crawls pages checking for errors,
    broken links, slow loads, and taking screenshots.

    Args:
        site: Site name from khai_list_sites (e.g. "yoursite.com")
        account: Account type (e.g. "admin", "user")
        max_depth: How many links deep to crawl (default 3)
        viewport: "desktop" or "mobile"
        start_path: Optional path to start crawling from (e.g. "/dashboard")
        webhook_url: URL to POST results to when test completes (optional). Set KHAI_WEBHOOK_SECRET env var for HMAC-SHA256 signing.

    Returns:
        testId for polling with khai_test_status
    """
    payload = {
        "site": site,
        "account": account,
        "maxDepth": max_depth,
        "viewport": viewport,
    }
    if start_path:
        payload["startPath"] = start_path
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    return _unwrap(client.post("/api/test/start", payload))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_test_status(test_id: str) -> dict:
    """Check the status of a running crawl test.

    Args:
        test_id: The testId returned from khai_start_test

    Returns:
        Status (running/logging-in/crawling/completed/login-failed/error),
        phase (login/crawl/complete), pages scanned, issues found.
        If login-failed, loginError field contains the specific failure reason.
    """
    return _unwrap(client.get(f"/api/test/{test_id}/status"))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_test_results(test_id: str) -> dict:
    """Get full results from a completed crawl test.

    Args:
        test_id: The testId returned from khai_start_test

    Returns:
        Complete test results including all pages, issues, screenshots, and summary.
    """
    return _unwrap(client.get(f"/api/test/{test_id}/results"))


@mcp.tool(annotations={"destructiveHint": True, "openWorldHint": True})
def khai_execute_actions(
    site: str,
    account: str,
    actions: list[dict],
    webhook_url: str | None = None,
    record_har: bool = False,
) -> dict:
    """Execute a sequence of browser actions on an authenticated site.

    Logs in first, then runs each action in order. Useful for taking screenshots
    of specific pages, filling forms, navigating workflows.

    Args:
        site: Site name from khai_list_sites
        account: Account type (e.g. "admin")
        actions: List of action objects. Each has a "type" and type-specific params:
            - {"type": "navigate", "url": "/admin/dashboard"}
            - {"type": "wait", "duration": 2000}
            - {"type": "screenshot", "name": "dashboard"}
            - {"type": "evaluate", "script": "document.title"}
            - {"type": "create-note", "patientId": "123", "content": {...}}
            - {"type": "send-fax", "faxNumber": "+15551234567", "content": "..."}
            - {"type": "send-sms", "phoneNumber": "+15551234567", "message": "..."}
        webhook_url: URL to POST results to when the session completes (optional). Set KHAI_WEBHOOK_SECRET env var for HMAC-SHA256 signing.
        record_har: If True, records all network requests/responses as a HAR file during the session.
            Retrieve with khai_action_har after completion.

    Returns:
        sessionId for polling with khai_action_status. If record_har=True, use khai_action_har
        to get the network trace after completion.
    """
    payload = {
        "site": site,
        "account": account,
        "actions": actions,
    }
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    if record_har:
        payload["recordHar"] = True
    return _unwrap(client.post("/api/actions/execute", payload))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_action_status(session_id: str) -> dict:
    """Check the status of a running action session.

    Args:
        session_id: The sessionId returned from khai_execute_actions

    Returns:
        Status summary with actionsCompleted count. Use khai_action_results for full output.
    """
    try:
        return _unwrap(client.get(f"/api/actions/status/{session_id}"))
    except Exception:
        return {"error": f"Session '{session_id}' not found. It may have expired (sessions are kept for 1 hour)."}


@mcp.tool(annotations={"readOnlyHint": True})
def khai_action_results(session_id: str) -> dict:
    """Get full results from a completed action session.

    Args:
        session_id: The sessionId returned from khai_execute_actions

    Returns:
        Complete action results including all action outputs and timestamps.
    """
    try:
        return _unwrap(client.get(f"/api/actions/results/{session_id}"))
    except Exception:
        return {"error": f"Session '{session_id}' not found. It may have expired (sessions are kept for 1 hour)."}


@mcp.tool(annotations={"readOnlyHint": True})
def khai_action_har(session_id: str) -> dict:
    """Get the HAR (HTTP Archive) file from a completed action session.

    The session must have been started with record_har=True in khai_execute_actions.
    Contains all network requests and responses captured during the session.

    The returned HAR follows the HAR 1.2 specification and can be opened in
    Chrome DevTools (Network tab > Import) or any HAR viewer.

    Args:
        session_id: The sessionId returned from khai_execute_actions

    Returns:
        Full HAR 1.2 JSON object with all network entries, or error if no HAR exists.
    """
    try:
        resp = client.get(f"/api/actions/har/{session_id}")
        # HAR endpoint streams raw JSON (not {success,data} envelope)
        # If it's a HAR, it has a "log" key; if error, it has "success: false"
        if isinstance(resp, dict) and resp.get("success") is False:
            raise Exception(resp.get("error", "Unknown error"))
        return resp
    except Exception as e:
        return {"error": f"No HAR file for session '{session_id}'. {e}"}


@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": True})
def khai_run_audit(
    site: str | None = None,
    base_url: str | None = None,
    categories: list[str] | None = None,
    webhook_url: str | None = None,
) -> dict:
    """Start a security/configuration audit on a site.

    Checks for exposed files, missing security headers, SSL issues,
    and other common vulnerabilities.

    Args:
        site: Site name that matches an audit profile (optional)
        base_url: Direct URL to audit (optional, at least one of site/base_url required)
        categories: List of audit categories to run (optional, runs all by default)
        webhook_url: URL to POST results to when the audit completes (optional). Set KHAI_WEBHOOK_SECRET env var for HMAC-SHA256 signing.

    Returns:
        auditId for polling with khai_audit_results
    """
    payload = {}
    if site:
        payload["site"] = site
    if base_url:
        payload["baseUrl"] = base_url
    if categories:
        payload["categories"] = categories
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    return _unwrap(client.post("/api/audit/start", payload))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_audit_results(audit_id: str) -> dict:
    """Get audit status and results.

    If the audit is still running, returns status only.
    If completed, returns full findings.

    Args:
        audit_id: The auditId returned from khai_run_audit

    Returns:
        Audit status and results (if completed).
    """
    status = _unwrap(client.get(f"/api/audit/{audit_id}/status"))
    if status.get("status") == "completed":
        results = _unwrap(client.get(f"/api/audit/{audit_id}/results"))
        return {"status": "completed", **results}
    return status


@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": True})
def khai_check_links(
    base_url: str,
    max_pages: int = 50,
    concurrency: int = 5,
    timeout: int = 10000,
    webhook_url: str | None = None,
) -> dict:
    """Check a website for broken links.

    Crawls the site and checks all internal and external links for 404s,
    timeouts, and other errors.

    Args:
        base_url: The URL to start checking from (e.g. "https://yoursite.com")
        max_pages: Maximum pages to crawl (default 50)
        concurrency: Parallel link checks (default 5)
        timeout: Per-link timeout in ms (default 10000)
        webhook_url: URL to POST results to when the check completes (optional). Set KHAI_WEBHOOK_SECRET env var for HMAC-SHA256 signing.

    Returns:
        jobId for polling. Use GET /api/advanced/jobs/{jobId}/results to get results.
    """
    payload = {
        "baseUrl": base_url,
        "maxPages": max_pages,
        "concurrency": concurrency,
        "timeout": timeout,
    }
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    resp = _unwrap(client.post("/api/advanced/links/check", payload))

    # Poll for completion (link checks are usually fast)
    job_id = resp.get("jobId")
    if job_id:
        for _ in range(60):  # Up to 2 minutes
            time.sleep(2)
            job = _unwrap(client.get(f"/api/advanced/jobs/{job_id}"))
            if job.get("status") in ("completed", "error"):
                if job.get("status") == "completed":
                    return _unwrap(client.get(f"/api/advanced/jobs/{job_id}/results"))
                return job
        return {"status": "timeout", "jobId": job_id, "message": "Still running after 2 minutes"}
    return resp


@mcp.tool(annotations={"destructiveHint": True})
def khai_watch_create(
    site: str,
    account: str,
    url: str,
    schedule: str,
    selector: str | None = None,
    webhook_url: str | None = None,
) -> dict:
    """Create a watch to monitor an authenticated page on a schedule.

    Khai will log in to the site and capture page content and a screenshot
    on each scheduled run, comparing against the previous snapshot. When a
    change is detected, a webhook notification is sent (if webhook_url provided).

    Args:
        site: Site name from khai_list_sites (e.g. "yoursite.com")
        account: Account type (e.g. "admin", "user")
        url: Full URL or path to monitor (e.g. "/dashboard" or "https://yoursite.com/page")
        schedule: Cron expression for run frequency (e.g. "0 * * * *" = hourly,
                  "*/30 * * * *" = every 30 min, "0 9 * * 1-5" = weekdays at 9am UTC)
        selector: CSS selector to extract specific content (optional; default = full body text)
        webhook_url: URL to POST change notifications to (optional)

    Returns:
        Watch object with id for use in khai_watch_history and khai_watch_delete
    """
    payload = {
        "site": site,
        "account": account,
        "url": url,
        "schedule": schedule,
    }
    if selector:
        payload["selector"] = selector
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    return _unwrap(client.post("/api/watches", payload))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_watch_list() -> dict:
    """List all configured watches and their current status.

    Returns all watch definitions with their schedule, last run status,
    and whether they are currently active (running field).

    Returns:
        List of watch objects with id, site, url, schedule, enabled, running fields.
    """
    return _unwrap(client.get("/api/watches"))


@mcp.tool(annotations={"destructiveHint": True})
def khai_watch_delete(watch_id: str) -> dict:
    """Delete a watch by its id.

    Stops the scheduled runs and removes all associated history and screenshots.

    Args:
        watch_id: The id returned from khai_watch_create or khai_watch_list

    Returns:
        Confirmation of deletion.
    """
    return _unwrap(client.delete(f"/api/watches/{watch_id}"))


@mcp.tool(annotations={"readOnlyHint": True})
def khai_watch_history(watch_id: str, limit: int = 20) -> dict:
    """Get recent run history for a watch.

    Each run record shows whether content or visual changes were detected,
    the diff summary, webhook delivery status, and any errors.

    Args:
        watch_id: The id returned from khai_watch_create or khai_watch_list
        limit: Maximum number of recent runs to return (default 20)

    Returns:
        List of run records with status, changed, diff, timestamp, and webhook fields.
    """
    return _unwrap(client.get(f"/api/watches/{watch_id}/history?limit={limit}"))


@mcp.tool(annotations={"destructiveHint": True})
def khai_baseline_create(
    test_id: str,
    thresholds: dict | None = None,
) -> dict:
    """Create a baseline from a completed crawl test.

    Snapshots the crawl results so future crawls on the same site can be compared
    against it for regression detection. Only one baseline is allowed per site+account;
    use khai_baseline_update to refresh an existing baseline.

    Args:
        test_id: The testId from a completed khai_start_test crawl
        thresholds: Optional timing thresholds dict to override defaults.
            Supported keys: responseTime (ms), pageLoadTime (ms).
            Example: {"responseTime": 3000, "pageLoadTime": 8000}

    Returns:
        Created baseline object with id, site, account, sourceTestId, createdAt,
        thresholds, and snapshot summary (pageCount).
    """
    try:
        payload: dict = {"testId": test_id}
        if thresholds:
            payload["thresholds"] = thresholds
        return _unwrap(client.post("/api/baselines", payload))
    except Exception as e:
        return {"error": str(e)}


@mcp.tool(annotations={"readOnlyHint": True})
def khai_baseline_list(site: str | None = None) -> dict:
    """List all configured baselines.

    Returns metadata for each baseline (excludes snapshot page details for compact output).
    Use khai_baseline_get to retrieve full snapshot data for a specific baseline.

    Args:
        site: Optional site name to filter results (e.g. "yoursite.com")

    Returns:
        List of baseline objects with id, site, account, sourceTestId, createdAt,
        updatedAt, thresholds, and pageCount.
    """
    try:
        path = "/api/baselines"
        if site:
            path = f"/api/baselines?site={site}"
        return _unwrap(client.get(path))
    except Exception as e:
        return {"error": str(e)}


@mcp.tool(annotations={"readOnlyHint": True})
def khai_baseline_get(baseline_id: str) -> dict:
    """Get full details for a specific baseline, including all snapshot pages.

    Args:
        baseline_id: The baseline id from khai_baseline_list or khai_baseline_create

    Returns:
        Full baseline object including snapshot.pages array with per-page data
        (url, title, statusCode, responseTime, pageLoadTime).
    """
    try:
        return _unwrap(client.get(f"/api/baselines/{baseline_id}"))
    except Exception as e:
        return {"error": str(e)}


@mcp.tool(annotations={"destructiveHint": True})
def khai_baseline_update(baseline_id: str, test_id: str) -> dict:
    """Update an existing baseline from a new crawl test.

    Replaces the snapshot data while preserving the baseline id and thresholds.
    Use this to refresh a baseline after deploying changes.

    Args:
        baseline_id: The baseline id from khai_baseline_list or khai_baseline_create
        test_id: The testId from a completed khai_start_test crawl to use as new snapshot

    Returns:
        Updated baseline object with new snapshot data and updatedAt timestamp.
    """
    try:
        return _unwrap(client.put(f"/api/baselines/{baseline_id}", {"testId": test_id}))
    except Exception as e:
        return {"error": str(e)}


@mcp.tool(annotations={"destructiveHint": True})
def khai_baseline_delete(baseline_id: str) -> dict:
    """Delete a baseline.

    Removes the baseline and its snapshot data. Future crawls on the same site
    will no longer produce regression comparisons until a new baseline is created.

    Args:
        baseline_id: The baseline id from khai_baseline_list or khai_baseline_create

    Returns:
        Confirmation of deletion.
    """
    try:
        return _unwrap(client.delete(f"/api/baselines/{baseline_id}"))
    except Exception as e:
        return {"error": str(e)}


def main():
    """Run the MCP server.

    Supports two transport modes:
      - stdio (default): For single-session use via Claude Code's MCP config
      - SSE: For multi-session use via HTTP. Enable with --sse flag or MCP_SSE_PORT env var.
    """
    use_sse = "--sse" in sys.argv or os.environ.get("MCP_SSE_PORT")
    port = int(os.environ.get("MCP_SSE_PORT", "3105"))

    if use_sse:
        mcp.settings.host = "localhost"
        mcp.settings.port = port
        logger.info(f"Starting Khai MCP server (SSE on localhost:{port})...")
        mcp.run(transport="sse")
    else:
        logger.info("Starting Khai MCP server (stdio)...")
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
