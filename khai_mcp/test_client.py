"""Tests for snake_to_camel and build_payload helpers in client.py."""

import pytest
from khai_mcp.client import snake_to_camel, build_payload


# --- snake_to_camel tests ---

def test_snake_to_camel_two_words():
    assert snake_to_camel("max_depth") == "maxDepth"


def test_snake_to_camel_webhook_url():
    assert snake_to_camel("webhook_url") == "webhookUrl"


def test_snake_to_camel_single_word():
    assert snake_to_camel("site") == "site"


def test_snake_to_camel_record_har():
    assert snake_to_camel("record_har") == "recordHar"


def test_snake_to_camel_base_url():
    assert snake_to_camel("base_url") == "baseUrl"


def test_snake_to_camel_start_path():
    assert snake_to_camel("start_path") == "startPath"


# --- build_payload tests ---

def test_build_payload_filters_none_and_transforms_keys():
    result = build_payload(max_depth=3, site="foo", start_path=None)
    assert result == {"maxDepth": 3, "site": "foo"}


def test_build_payload_single_key():
    result = build_payload(webhook_url="http://x")
    assert result == {"webhookUrl": "http://x"}


def test_build_payload_list_value_passes_through():
    actions = [{"type": "navigate"}]
    result = build_payload(actions=actions)
    assert result == {"actions": [{"type": "navigate"}]}


def test_build_payload_empty():
    result = build_payload()
    assert result == {}


def test_build_payload_false_is_dropped():
    result = build_payload(record_har=False)
    assert result == {}


def test_build_payload_zero_is_kept():
    result = build_payload(max_depth=0)
    assert result == {"maxDepth": 0}


def test_build_payload_no_underscore_keys_pass_through():
    result = build_payload(concurrency=5, timeout=10000)
    assert result == {"concurrency": 5, "timeout": 10000}


def test_build_payload_empty_string_is_kept():
    result = build_payload(site="")
    assert result == {"site": ""}


def test_build_payload_nested_dict_keys_not_transformed():
    # Top-level key is transformed, but nested dict structure passes through as-is
    result = build_payload(actions=[{"type": "navigate", "some_key": "value"}])
    assert result == {"actions": [{"type": "navigate", "some_key": "value"}]}


# --- Integration tests: verify tool functions send correct camelCase payloads ---

from unittest.mock import patch


def test_start_test_payload():
    """khai_start_test sends full camelCase payload for all params."""
    with patch("khai_mcp.client.post", return_value={"success": True, "data": {"testId": "t1"}}) as mock_post:
        from khai_mcp.server import khai_start_test
        khai_start_test(site="example.com", account="admin", max_depth=2, viewport="mobile", start_path="/dashboard", webhook_url="http://hook")
        mock_post.assert_called_once()
        payload = mock_post.call_args[0][1]  # second positional arg
        assert payload == {
            "site": "example.com",
            "account": "admin",
            "maxDepth": 2,
            "viewport": "mobile",
            "startPath": "/dashboard",
            "webhookUrl": "http://hook",
        }


def test_start_test_payload_minimal():
    """khai_start_test omits None optional params and keeps non-None defaults."""
    with patch("khai_mcp.client.post", return_value={"success": True, "data": {"testId": "t1"}}) as mock_post:
        from khai_mcp.server import khai_start_test
        khai_start_test(site="example.com", account="admin")
        payload = mock_post.call_args[0][1]
        assert "startPath" not in payload
        assert "webhookUrl" not in payload
        # Defaults from khai_start_test signature: max_depth=3, viewport="desktop"
        assert payload["maxDepth"] == 3
        assert payload["viewport"] == "desktop"


def test_execute_actions_payload():
    """khai_execute_actions omits recordHar when record_har=False (default)."""
    with patch("khai_mcp.client.post", return_value={"success": True, "data": {"sessionId": "s1"}}) as mock_post:
        from khai_mcp.server import khai_execute_actions
        khai_execute_actions(site="example.com", account="admin", actions=[{"type": "screenshot", "name": "test"}])
        payload = mock_post.call_args[0][1]
        assert payload == {
            "site": "example.com",
            "account": "admin",
            "actions": [{"type": "screenshot", "name": "test"}],
        }
        # recordHar should NOT be present (record_har defaults to False, dropped by build_payload)
        assert "recordHar" not in payload


def test_check_links_payload():
    """khai_check_links sends all params as camelCase."""
    with patch("khai_mcp.client.post", return_value={"success": True, "data": {"jobId": "j1"}}) as mock_post:
        from khai_mcp.server import khai_check_links
        khai_check_links(base_url="https://example.com", max_pages=100, concurrency=10, timeout=5000)
        payload = mock_post.call_args[0][1]
        assert payload == {
            "baseUrl": "https://example.com",
            "maxPages": 100,
            "concurrency": 10,
            "timeout": 5000,
        }
