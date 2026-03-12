"""
Tests for signup experiment group assignment (chat vs agent).
Logic under test lives in main.py; this file mirrors it for unit testing without backend deps.

Run from repo root: python -m pytest backend/tests/test_experiment_group.py -v
Or from backend: pytest tests/test_experiment_group.py -v
"""

import random
from typing import Any, Dict, Optional

import pytest

SIGNUP_EXPERIMENT_GROUP_SETTINGS_KEY = "experiment_group"
SIGNUP_LEGACY_GROUPS_SETTINGS_KEY = "groups"
WEBSITE_REQUIREMENTS_SKIPPED_SETTINGS_KEY = "websiteRequirementsSkipped"
SIGNUP_GROUP_CHAT = "chat"
SIGNUP_GROUP_AGENT = "agent"
VALID_SIGNUP_GROUPS = {SIGNUP_GROUP_CHAT, SIGNUP_GROUP_AGENT}


def _normalize_experiment_group(group: Any) -> Optional[str]:
    """Same logic as main._normalize_experiment_group."""
    if not isinstance(group, str):
        return None
    normalized = group.strip().lower()
    if normalized not in VALID_SIGNUP_GROUPS:
        return None
    return normalized


def _is_eligible_for_experiment_group_sampling(user_settings: Any) -> bool:
    """Same logic as main._is_eligible_for_experiment_group_sampling."""
    if not isinstance(user_settings, dict):
        return False
    return user_settings.get(WEBSITE_REQUIREMENTS_SKIPPED_SETTINGS_KEY) is not True


def _assign_signup_group(
    username: str,
    email: str,
    settings: Dict[str, Any],
    get_counts_fn,
) -> str:
    """
    Same logic as main._assign_signup_group but takes get_counts_fn() -> (chat_count, agent_count)
    instead of db, so we can test without a database.
    """
    explicit_group = _normalize_experiment_group(settings.get(SIGNUP_EXPERIMENT_GROUP_SETTINGS_KEY))
    if explicit_group:
        return explicit_group

    legacy_groups = settings.get(SIGNUP_LEGACY_GROUPS_SETTINGS_KEY)
    if isinstance(legacy_groups, list) and legacy_groups:
        legacy_group = _normalize_experiment_group(legacy_groups[0])
        if legacy_group:
            return legacy_group

    chat_count, agent_count = get_counts_fn()

    if chat_count < agent_count:
        return SIGNUP_GROUP_CHAT
    if agent_count < chat_count:
        return SIGNUP_GROUP_AGENT
    return random.choice([SIGNUP_GROUP_CHAT, SIGNUP_GROUP_AGENT])


class TestNormalizeExperimentGroup:
    """_normalize_experiment_group returns only 'chat' or 'agent' or None."""

    def test_accepts_chat(self):
        assert _normalize_experiment_group("chat") == "chat"
        assert _normalize_experiment_group("  chat  ") == "chat"
        assert _normalize_experiment_group("CHAT") == "chat"

    def test_accepts_agent(self):
        assert _normalize_experiment_group("agent") == "agent"
        assert _normalize_experiment_group("  agent  ") == "agent"
        assert _normalize_experiment_group("AGENT") == "agent"

    def test_rejects_invalid(self):
        assert _normalize_experiment_group("") is None
        assert _normalize_experiment_group("ask") is None
        assert _normalize_experiment_group("other") is None
        assert _normalize_experiment_group(None) is None
        assert _normalize_experiment_group(123) is None
        assert _normalize_experiment_group([]) is None


class TestIsEligibleForExperimentGroupSampling:
    """Eligibility for being counted in experiment group balancing."""

    def test_eligible_when_no_skip(self):
        assert _is_eligible_for_experiment_group_sampling({}) is True
        assert _is_eligible_for_experiment_group_sampling({"other": 1}) is True
        assert _is_eligible_for_experiment_group_sampling({WEBSITE_REQUIREMENTS_SKIPPED_SETTINGS_KEY: False}) is True

    def test_not_eligible_when_skipped(self):
        assert _is_eligible_for_experiment_group_sampling({WEBSITE_REQUIREMENTS_SKIPPED_SETTINGS_KEY: True}) is False

    def test_not_eligible_when_not_dict(self):
        assert _is_eligible_for_experiment_group_sampling(None) is False
        assert _is_eligible_for_experiment_group_sampling([]) is False


class TestAssignSignupGroup:
    """_assign_signup_group: explicit, legacy, and counterbalanced assignment."""

    def test_explicit_experiment_group_respected(self):
        def counts():
            return (0, 0)
        assert _assign_signup_group(
            "u", "e@x.com",
            {SIGNUP_EXPERIMENT_GROUP_SETTINGS_KEY: "chat"},
            counts,
        ) == "chat"
        assert _assign_signup_group(
            "u", "e@x.com",
            {SIGNUP_EXPERIMENT_GROUP_SETTINGS_KEY: "agent"},
            counts,
        ) == "agent"
        assert _assign_signup_group(
            "u", "e@x.com",
            {SIGNUP_EXPERIMENT_GROUP_SETTINGS_KEY: "  CHAT  "},
            counts,
        ) == "chat"

    def test_legacy_groups_respected(self):
        def counts():
            return (0, 0)
        assert _assign_signup_group(
            "u", "e@x.com",
            {SIGNUP_LEGACY_GROUPS_SETTINGS_KEY: ["agent"]},
            counts,
        ) == "agent"
        assert _assign_signup_group(
            "u", "e@x.com",
            {SIGNUP_LEGACY_GROUPS_SETTINGS_KEY: ["chat"]},
            counts,
        ) == "chat"

    def test_counterbalanced_assigns_chat_when_fewer_chat(self):
        assert _assign_signup_group(
            "u", "e@x.com", {},
            lambda: (5, 10),
        ) == SIGNUP_GROUP_CHAT

    def test_counterbalanced_assigns_agent_when_fewer_agent(self):
        assert _assign_signup_group(
            "u", "e@x.com", {},
            lambda: (10, 5),
        ) == SIGNUP_GROUP_AGENT

    def test_when_tied_returns_chat_or_agent(self):
        for _ in range(20):
            result = _assign_signup_group("u", "e@x.com", {}, lambda: (7, 7))
            assert result in (SIGNUP_GROUP_CHAT, SIGNUP_GROUP_AGENT)

    def test_when_zero_counts_returns_chat_or_agent(self):
        seen = set()
        for _ in range(50):
            result = _assign_signup_group("u", "e@x.com", {}, lambda: (0, 0))
            assert result in (SIGNUP_GROUP_CHAT, SIGNUP_GROUP_AGENT)
            seen.add(result)
        assert seen == {SIGNUP_GROUP_CHAT, SIGNUP_GROUP_AGENT}
