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
