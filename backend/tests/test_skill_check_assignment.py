"""
Tests for skill check assignment pre/post variant split.

Run from repo root: python -m pytest backend/tests/test_skill_check_assignment.py -v
Or from backend: pytest tests/test_skill_check_assignment.py -v
"""

import random
import pytest


def _split_variants(base_tags: list[str]) -> tuple[list[str], list[str]]:
    """Same logic as in main._build_skill_check_assignment_names_split_pre_post."""
    pre_names, post_names = [], []
    for base in base_tags:
        v1, v2 = f"{base}_1", f"{base}_2"
        chosen = random.choice((v1, v2))
        other = v2 if chosen == v1 else v1
        pre_names.append(chosen)
        post_names.append(other)
    return pre_names, post_names


def _base_tags():
    """Match main.py base tag lists."""
    return {
        "frontend": [
            "html_knowledge", "html_recall", "html_trace_code", "html_change_code",
            "css_knowledge", "css_recall", "css_trace_code", "css_change_code",
            "js_knowledge", "js_recall", "js_trace_code", "js_change_code",
        ],
        "ux": [
            "choices", "memory", "mobile", "design_protocol", "error",
            "aesthetics", "object", "cognitive_ease", "visual_order", "excitement",
        ],
        "code_normal": ["paren"],
        "code_debug": ["string_shift"],
    }


def test_split_variants_opposite_per_tag():
    """For each base tag, pre and post must get the two different variants (_1 and _2)."""
    tags = _base_tags()
    for section, base_tags in tags.items():
        pre, post = _split_variants(base_tags)
        assert len(pre) == len(post) == len(base_tags), f"{section}: length mismatch"
        for i, base in enumerate(base_tags):
            v1, v2 = f"{base}_1", f"{base}_2"
            assert pre[i] in (v1, v2), f"{section}[{i}]: pre should be {v1} or {v2}, got {pre[i]}"
            assert post[i] in (v1, v2), f"{section}[{i}]: post should be {v1} or {v2}, got {post[i]}"
            assert pre[i] != post[i], f"{section}[{i}]: pre and post must differ, got pre={pre[i]} post={post[i]}"


def test_split_variants_sets_distinct_and_combined_has_all_variants():
    """Pre and post sets are disjoint, and combined they contain every base tag with both _1 and _2."""
    tags = _base_tags()
    for section, base_tags in tags.items():
        pre, post = _split_variants(base_tags)
        pre_set, post_set = set(pre), set(post)
        # Pre and post are distinct (no overlap)
        assert pre_set.isdisjoint(post_set), f"{section}: pre and post must not share any question"
        # Combined = exactly {base_1, base_2} for every base
        combined = pre_set | post_set
        expected = {f"{b}_{suffix}" for b in base_tags for suffix in (1, 2)}
        assert combined == expected, f"{section}: combined should be {expected}, got {combined}"


def test_split_variants_different_runs():
    """Over many runs, we should see both variants chosen for pre (randomness)."""
    base_tags = ["paren"]  # one tag, many runs
    pre_values = set()
    for _ in range(100):
        pre, post = _split_variants(base_tags)
        pre_values.add(pre[0])
        assert post[0] == ("paren_2" if pre[0] == "paren_1" else "paren_1")
    assert pre_values == {"paren_1", "paren_2"}, "Both variants should appear as pre over 100 runs"


def test_split_variants_assignments_vary_across_runs():
    """Across multiple shuffles, (pre, post) assignments are not always identical."""
    base_tags = _base_tags()["frontend"]  # enough tags that we see variation
    seen_assignments = set()
    for _ in range(50):
        pre, post = _split_variants(base_tags)
        # Use tuple of (tuple(pre), tuple(post)) as hashable fingerprint
        seen_assignments.add((tuple(pre), tuple(post)))
    assert len(seen_assignments) > 1, "Multiple runs should produce at least two different (pre, post) assignments"
