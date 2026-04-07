"""HTTP client for Khai's Express API."""

import os

import httpx

KHAI_BASE = "http://127.0.0.1:3001"
TIMEOUT = 120.0  # Long-running browser operations


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase. Single words pass through unchanged."""
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def build_payload(**kwargs) -> dict:
    """Build a camelCase request payload from snake_case keyword arguments.

    - None values are omitted
    - False values are omitted (but 0 and empty string are kept)
    - Top-level keys are converted from snake_case to camelCase
    - Nested structures (dicts, lists) are passed through as-is
    """
    return {
        snake_to_camel(k): v
        for k, v in kwargs.items()
        if v is not None and v is not False
    }


def _client() -> httpx.Client:
    headers = {}
    api_key = os.environ.get("KHAI_API_KEY")
    if api_key:
        headers["X-Khai-Key"] = api_key
    return httpx.Client(base_url=KHAI_BASE, timeout=TIMEOUT, headers=headers)


def get(path: str, params: dict | None = None) -> dict:
    """GET request to Khai API. Returns parsed JSON."""
    with _client() as c:
        r = c.get(path, params=params)
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
