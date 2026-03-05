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
- khai_start_test: Start an authenticated crawl test on a site
- khai_test_status: Check if a running test is done yet
- khai_test_results: Get full results from a completed test
- khai_execute_actions: Run a sequence of browser actions (navigate, screenshot, etc.)
- khai_action_status: Check if a running action session is done yet (summary only)
- khai_action_results: Get full results from a completed action session
- khai_run_audit: Start a security/configuration audit on a site
- khai_audit_results: Get audit status and results
- khai_check_links: Check a site for broken links

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

    Returns:
        sessionId for polling with khai_action_status
    """
    return _unwrap(client.post("/api/actions/execute", {
        "site": site,
        "account": account,
        "actions": actions,
    }))


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


@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": True})
def khai_run_audit(
    site: str | None = None,
    base_url: str | None = None,
    categories: list[str] | None = None,
) -> dict:
    """Start a security/configuration audit on a site.

    Checks for exposed files, missing security headers, SSL issues,
    and other common vulnerabilities.

    Args:
        site: Site name that matches an audit profile (optional)
        base_url: Direct URL to audit (optional, at least one of site/base_url required)
        categories: List of audit categories to run (optional, runs all by default)

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
) -> dict:
    """Check a website for broken links.

    Crawls the site and checks all internal and external links for 404s,
    timeouts, and other errors.

    Args:
        base_url: The URL to start checking from (e.g. "https://yoursite.com")
        max_pages: Maximum pages to crawl (default 50)
        concurrency: Parallel link checks (default 5)
        timeout: Per-link timeout in ms (default 10000)

    Returns:
        jobId for polling. Use GET /api/advanced/jobs/{jobId}/results to get results.
    """
    resp = _unwrap(client.post("/api/advanced/links/check", {
        "baseUrl": base_url,
        "maxPages": max_pages,
        "concurrency": concurrency,
        "timeout": timeout,
    }))

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
