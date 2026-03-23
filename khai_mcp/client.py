"""HTTP client for Khai's Express API."""

import os

import httpx

KHAI_BASE = "http://127.0.0.1:3001"
TIMEOUT = 120.0  # Long-running browser operations


def _client() -> httpx.Client:
    headers = {}
    api_key = os.environ.get("KHAI_API_KEY")
    if api_key:
        headers["X-Khai-Key"] = api_key
    return httpx.Client(base_url=KHAI_BASE, timeout=TIMEOUT, headers=headers)


def get(path: str) -> dict:
    """GET request to Khai API. Returns parsed JSON."""
    with _client() as c:
        r = c.get(path)
        r.raise_for_status()
        return r.json()


def post(path: str, data: dict | None = None) -> dict:
    """POST request to Khai API. Returns parsed JSON."""
    with _client() as c:
        r = c.post(path, json=data or {})
        r.raise_for_status()
        return r.json()


def put(path: str, data: dict | None = None) -> dict:
    """PUT request to Khai API. Returns parsed JSON."""
    with _client() as c:
        r = c.put(path, json=data or {})
        r.raise_for_status()
        return r.json()


def delete(path: str) -> dict:
    """DELETE request to Khai API. Returns parsed JSON."""
    with _client() as c:
        r = c.delete(path)
        r.raise_for_status()
        return r.json()


def health() -> dict:
    """Check Khai server health."""
    return get("/health")
