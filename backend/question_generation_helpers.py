import json
import os
import random
import re
from typing import Any, Dict, List, Optional, Set, Tuple

import litellm


MAX_CODE_COMPARE_BLOCK_LINES = 20
# JavaScript function names to exclude when sampling a function for the code block (e.g. boilerplate handlers)
JS_FUNCTIONS_EXCLUDED_FROM_CODE_BLOCK_SAMPLING = frozenset({"onMove"})
REQUIREMENT_AWARE_COMPARE_TASKS = frozenset({"zic_zac_zoe", "zic_zac_zoe_follow_up"})
REQUIREMENT_TARGET_MAP: Dict[str, Dict[str, str]] = {
    "zic_zac_zoe": {
        "html": "Add a status element in a paragraph tag underneath the header 'Zic-Zac-Zoe'. It should show whose turn it is ('Player A Turn' or 'Player B Turn') and a message when the game is over (e.g., 'Player A Wins!', 'Player B Wins!', 'Tie Game!'), prefixed by 'Status:'",
        "css": "Center the entire web page horizontally",
        "js": "Turns alternate between Player A and Player B, starting with A. Each player places exactly two symbols per turn (A -> A -> B -> B -> ...)",
    },
    "zic_zac_zoe_follow_up": {
        "html": "Add a 'Reset Game' button below the board that resets the board, allowing for a new game of zic-zac-zoe. This must be a button on the page; resetting the game by refreshing the webpage does not count.",
        "css": "Change the colors of symbols on the board: 'A' should be red and 'B' should be blue",
        "js": "Along with your previous win condition logic, a player can also win zic-zac-zoe if they occupy all four corners of the board",
    },
}


def _collect_code_by_language(submission_code: Dict[str, str]) -> Tuple[str, str, str]:
    js_code = ""
    html_code = ""
    css_code = ""
    for filename, code_content in submission_code.items():
        if filename.endswith(".js") or filename.endswith(".javascript"):
            js_code += code_content + "\n\n"
        elif filename.endswith(".html"):
            html_code += code_content + "\n\n"
        elif filename.endswith(".css"):
            css_code += code_content + "\n\n"
    return js_code, html_code, css_code


def _extract_json_object(raw_output: str) -> Optional[Dict[str, Any]]:
    if not raw_output:
        return None
    text = raw_output.replace("```", "").replace("json", "").strip()
    if "{" in text and "}" in text:
        text = text[text.index("{"):text.rindex("}") + 1].strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _extract_html_element_by_id(html_code: str, element_id: str) -> Optional[str]:
    if not html_code or not element_id:
        return None
    open_tag_pattern = re.compile(
        rf"<([a-zA-Z][\w:-]*)\b[^>]*\bid\s*=\s*['\"]{re.escape(element_id)}['\"][^>]*>",
        re.IGNORECASE,
    )
    match = open_tag_pattern.search(html_code)
    if not match:
        return None
    tag_name = match.group(1).lower()
    token_regex = re.compile(r"<!--.*?-->|</?([a-zA-Z][\w:-]*)\b[^>]*?>", re.DOTALL)
    matches = list(token_regex.finditer(html_code))
    open_idx = None
    for idx, m in enumerate(matches):
        if m.start() == match.start():
            open_idx = idx
            break
    if open_idx is None:
        return None
    depth = 1
    for inner in matches[open_idx + 1:]:
        tok = inner.group(0)
        tag = (inner.group(1) or "").lower()
        if tag != tag_name or tok.startswith("<!--"):
            continue
        if tok.startswith("</"):
            depth -= 1
            if depth == 0:
                return html_code[match.start():inner.end()].strip()
        elif not tok.rstrip().endswith("/>"):
            depth += 1
    return html_code[match.start():].strip()


def _extract_html_element_by_class(html_code: str, class_name: str) -> Optional[str]:
    if not html_code or not class_name:
        return None
    open_tag_pattern = re.compile(
        rf"<([a-zA-Z][\w:-]*)\b[^>]*\bclass\s*=\s*['\"][^'\"]*\b{re.escape(class_name)}\b[^'\"]*['\"][^>]*>",
        re.IGNORECASE,
    )
    match = open_tag_pattern.search(html_code)
    if not match:
        return None
    tag_name = match.group(1).lower()
    token_regex = re.compile(r"<!--.*?-->|</?([a-zA-Z][\w:-]*)\b[^>]*?>", re.DOTALL)
    matches = list(token_regex.finditer(html_code))
    open_idx = None
    for idx, m in enumerate(matches):
        if m.start() == match.start():
            open_idx = idx
            break
    if open_idx is None:
        return None
    depth = 1
    for inner in matches[open_idx + 1:]:
        tok = inner.group(0)
        tag = (inner.group(1) or "").lower()
        if tag != tag_name or tok.startswith("<!--"):
            continue
        if tok.startswith("</"):
            depth -= 1
            if depth == 0:
                return html_code[match.start():inner.end()].strip()
        elif not tok.rstrip().endswith("/>"):
            depth += 1
    return html_code[match.start():].strip()


def _extract_css_block_by_selector(css_code: str, selector: str) -> Optional[str]:
    if not css_code or not selector:
        return None
    blocks: List[str] = []
    depth = 0
    token_start = None
    for i, ch in enumerate(css_code):
        if depth == 0 and token_start is None and not ch.isspace():
            token_start = i
        if ch == "{":
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
            if depth == 0 and token_start is not None:
                block = css_code[token_start:i + 1].strip()
                if block:
                    blocks.append(block)
                token_start = None
        elif ch == ";" and depth == 0 and token_start is not None:
            token_start = None
    wanted = selector.strip()
    wanted_low = wanted.lower()
    for block in blocks:
        header = block.split("{", 1)[0].strip()
        header_parts = [h.strip().lower() for h in header.split(",")]
        if wanted_low in header_parts or wanted_low in header.lower():
            return block
    return None


def _extract_css_blocks_by_selectors(css_code: str, selectors: List[str]) -> Optional[str]:
    """
    Extract one or more CSS blocks matching any of the given selectors.
    Returns concatenated blocks (order preserved, deduped by block content).
    """
    if not css_code or not selectors:
        return None
    seen: Set[str] = set()
    result_blocks: List[str] = []
    for sel in selectors:
        block = _extract_css_block_by_selector(css_code, sel)
        if block and block not in seen:
            seen.add(block)
            result_blocks.append(block)
    if not result_blocks:
        return None
    return "\n\n".join(result_blocks)


def _select_requirement_target(
    language: str,
    task_name: str,
    task_requirements: List[str],
    user_code: Dict[str, str],
    starter_code: Dict[str, str],
) -> Optional[Dict[str, str]]:
    """
    Requirement-aware target selection.
    Returns:
      {"status":"selected","target_kind":"id|selector|function","target_value":"...","reason":"..."}
      or {"status":"abstain","reason":"..."}
    """
    model = "openai/gpt-5.2-2025-12-11"
    task = (task_name or "").strip().lower()
    lang = (language or "").strip().lower()
    mapped_requirement = REQUIREMENT_TARGET_MAP.get(task, {}).get(lang, "")
    if mapped_requirement:
        requirements_for_prompt = [mapped_requirement]
    else:
        requirements_for_prompt = [r for r in task_requirements if isinstance(r, str)]
    requirements_text = "\n".join([f"- {r}" for r in requirements_for_prompt])

    user_js = user_code.get("js", "")
    user_html = user_code.get("html", "")
    user_css = user_code.get("css", "")
    starter_js = starter_code.get("js", "")
    starter_html = starter_code.get("html", "")
    starter_css = starter_code.get("css", "")

    language_guidance = {
        "html": (
            "Choose one meaningful HTML target tied to requirements. "
            "Prefer stable selectable targets (id first, then class/data-attribute)."
        ),
        "css": (
            "Choose one or more meaningful CSS selectors tied to requirements. "
            "Return exact selector strings as written in CSS (e.g., .container, #status). "
            "Use a single selector in target_value, or multiple selectors in target_values (JSON array)."
        ),
        "js": (
            "Choose one meaningful JavaScript function tied to requirements. "
            "Return only a function name that exists in user JS."
        ),
    }.get(lang, "")
    if task == "zic_zac_zoe" and lang == "html":
        language_guidance += (
            " For the status requirement, prefer selecting the paragraph (<p>) status element itself "
            "rather than a nested child node that merely contains status text."
        )
    if task == "zic_zac_zoe" and lang == "js":
        language_guidance += (
            " For this requirement, prefer selecting JS tied to rendering/placing symbols on the board "
            "(cell indexing, row/column mapping, loop bounds, or click-to-cell mapping) rather than winner-check helpers."
        )

    prompt = """
<task>
You will be given a task requirement and your job is to select one target in {language}
that could be shown to the user to test their understanding of that requirement.

You will be given:
1) Starter code (what the user started with)
2) User code (their current implementation)
Use both to understand what changed and what target is most meaningful to test.

Language: {language}
Task name: {task_name}

{language_guidance}

Selection goal:
- Pick the single most meaningful target for this language that corresponds to the requirement(s).
- For CSS only: you may pick multiple selectors if the requirement spans several rules (e.g. layout + cells); use target_values array in that case.
- Prefer a target that reflects the user's implementation work, even if imperfect.

Important abstain policy:
- If the user seems to have implemented a relevant target for this requirement but did so incorrectly, you should still select it.
- Only abstain when the user code indicates no true attempt or artifact for this requirement (nothing to select).
- Prefer selecting something imperfect over abstaining when a plausible target exists.
</task>

<inputs>
Input A: Task requirements you should anchor to
<requirements>
{requirements_text}
</requirements>

Input B: Starter HTML (initial state before user edits)
<starter_html>
{starter_html}
</starter_html>

Input C: Starter CSS (initial state before user edits)
<starter_css>
{starter_css}
</starter_css>

Input D: Starter JS (initial state before user edits)
<starter_js>
{starter_js}
</starter_js>

Input E: User HTML (current code after edits)
<user_html>
{user_html}
</user_html>

Input F: User CSS (current code after edits)
<user_css>
{user_css}
</user_css>

Input G: User JS (current code after edits)
<user_js>
{user_js}
</user_js>
</inputs>

<format>
Return strict JSON only:
{{
  "status": "selected|abstain",
  "target_kind": "id|selector|function|none",
  "target_value": "string_or_empty",
  "target_values": ["optional", "array", "for", "css", "multiple", "selectors"],
  "reason": "short reason"
}}
For CSS: use target_value for one selector, or target_values (array of selector strings) for multiple. If target_values is non-empty, it is used; otherwise target_value is used.
</format>
""".format(
        language=lang,
        task_name=task,
        language_guidance=language_guidance,
        requirements_text=requirements_text,
        starter_html=starter_html,
        starter_css=starter_css,
        starter_js=starter_js,
        user_html=user_html,
        user_css=user_css,
        user_js=user_js,
    ).strip()

    for _ in range(3):
        try:
            response = litellm.completion(model=model, messages=[{"role": "user", "content": prompt}])
            payload = _extract_json_object(response.choices[0].message.content)
            if not payload:
                continue
            status = str(payload.get("status", "")).strip().lower()
            target_kind = str(payload.get("target_kind", "")).strip().lower()
            target_value = str(payload.get("target_value", "")).strip()
            target_values_raw = payload.get("target_values")
            reason = str(payload.get("reason", "")).strip()
            if status == "abstain":
                return {"status": "abstain", "target_kind": "none", "target_value": "", "reason": reason}
            if status == "selected" and target_kind in {"id", "selector", "function"}:
                # For CSS, allow multiple selectors via target_values array
                if lang == "css" and isinstance(target_values_raw, list) and len(target_values_raw) > 0:
                    target_values = [str(s).strip() for s in target_values_raw if s and str(s).strip()]
                    if target_values:
                        return {
                            "status": "selected",
                            "target_kind": target_kind,
                            "target_value": ", ".join(target_values),
                            "target_values": target_values,
                            "reason": reason,
                        }
                if target_value:
                    return {
                        "status": "selected",
                        "target_kind": target_kind,
                        "target_value": target_value,
                        "reason": reason,
                    }
        except Exception as e:
            _code_compare_debug_log(f"[selector] selection error lang={lang}: {e}")
    return {"status": "abstain", "target_kind": "none", "target_value": "", "reason": "selection_failed"}


def _resolve_selected_target_to_code(
    language: str,
    selection: Dict[str, str],
    js_code: str,
    html_code: str,
    css_code: str,
) -> Optional[Tuple[str, str]]:
    lang = (language or "").strip().lower()
    kind = (selection.get("target_kind") or "").strip().lower()
    value = (selection.get("target_value") or "").strip()
    if not value:
        return None

    if lang == "html":
        if kind == "id":
            code = _extract_html_element_by_id(html_code, value.lstrip("#"))
            return (f"#{value.lstrip('#')}", code) if code else None
        if kind == "selector" and value.startswith("#"):
            code = _extract_html_element_by_id(html_code, value[1:])
            return (value, code) if code else None
        if kind == "selector" and value.startswith("."):
            code = _extract_html_element_by_class(html_code, value[1:])
            return (value, code) if code else None
        return None

    if lang == "css":
        if kind != "selector":
            return None
        selectors_list = selection.get("target_values")
        if isinstance(selectors_list, list) and len(selectors_list) > 0:
            selectors_list = [s.strip() for s in selectors_list if s and str(s).strip()]
        if not selectors_list:
            selectors_list = [value] if value else []
        if not selectors_list:
            return None
        code = _extract_css_blocks_by_selectors(css_code, selectors_list)
        display_name = ", ".join(selectors_list)
        return (display_name, code) if code else None

    if lang in {"js", "javascript"}:
        if kind != "function":
            return None
        functions = _parse_javascript_functions(js_code)
        code = functions.get(value)
        return (f"{value}()", code) if code else None

    return None


def _generate_html_compare_pair_direct(
    task_name: str,
    requirement_text: str,
    starter_html: str,
    user_html: str,
) -> Optional[Dict[str, str]]:
    """
    Generate both the real and distractor HTML snippets in one call.
    """
    if not user_html or not user_html.strip():
        return None

    model = "openai/gpt-5.2-2025-12-11"
    prompt = """
<task>
You are generating a pair of HTML snippets for a "which code is yours?" question.

Return:
1) real_snippet: an HTML snippet from the user's current code tied to the requirement.
2) distractor_snippet: a plausible distractor with one subtle bug.

Important:
- real_snippet should be isolated to the most relevant block with the difference and that gives context. It will likely be less than 7 lines.
- distractor_snippet should preserve style/shape, but include one subtle wiring bug.
- Keep user-visible text unchanged where possible.
- The two snippets must not be logically equivalent.
- If there is no meaningful relevant snippet, abstain.

HTML wiring guidance for distractor_snippet:
- Prioritize these targets in order if present: reset button wiring, status element wiring, grid/cell wiring.
- Prefer integration-level HTML changes that affect JS wiring:
  - switch between id-based hook and inline onclick,
  - convert id hook to class/data-* hook (or vice versa),
  - change container/cell hook attributes so querySelector/getElementById targets mismatch.
- Keep visible copy/text the same (do not change user-facing wording).
- The website impact should be subtle but real: related interaction fails silently or updates the wrong element.

The change in the hook should NOT be changing the name of the ID. It should be a change that would largely impact how the wiring occurs in the JavaScript.
</task>

<task_name>
{task_name}
</task_name>

<requirement>
{requirement_text}
</requirement>

<starter_html>
{starter_html}
</starter_html>

<user_html>
{user_html}
</user_html>

<format>
Return strict JSON only:
{{
  "status": "selected|abstain",
  "real_snippet": "string_or_empty",
  "distractor_snippet": "string_or_empty",
  "reason": "short reason"
}}
</format>
""".format(
        task_name=task_name,
        requirement_text=requirement_text,
        starter_html=starter_html or "",
        user_html=user_html,
    ).strip()

    for _ in range(4):
        try:
            response = litellm.completion(model=model, messages=[{"role": "user", "content": prompt}])
            payload = _extract_json_object(response.choices[0].message.content)
            if not payload:
                continue
            status = str(payload.get("status", "")).strip().lower()
            if status == "abstain":
                return {
                    "status": "abstain",
                    "real_snippet": "",
                    "distractor_snippet": "",
                    "reason": str(payload.get("reason", "")).strip(),
                }
            if status != "selected":
                continue
            real_snippet = str(payload.get("real_snippet", "")).strip()
            distractor_snippet = str(payload.get("distractor_snippet", "")).strip()
            if not real_snippet or not distractor_snippet:
                continue
            # Basic non-equivalence guard; prompt should already enforce this.
            if real_snippet == distractor_snippet:
                continue
            return {
                "status": "selected",
                "real_snippet": real_snippet,
                "distractor_snippet": distractor_snippet,
                "reason": str(payload.get("reason", "")).strip(),
            }
        except Exception as e:
            _code_compare_debug_log(f"[html-pair] generation error: {e}")
    return None


def _is_code_compare_debug_enabled() -> bool:
    return os.getenv("DEBUG_CODE_COMPARE", "").strip().lower() in {"1", "true", "yes", "on"}


def _code_compare_debug_log(message: str) -> None:
    if _is_code_compare_debug_enabled():
        print(message)


def _code_compare_skip_log(language: str, reason: str, extra: str = "") -> None:
    suffix = f" | {extra}" if extra else ""
    print(f"[code-compare/skip] language={language} reason={reason}{suffix}", flush=True)


def _count_code_lines(code: str) -> int:
    if not code or not code.strip():
        return 0
    return len(code.strip().splitlines())


def generate_distractor_code_block(
    code: str,
    context_label: str = "",
    full_context: Optional[str] = None,
) -> str:
    random_model = "openai/gpt-5.2-2025-12-11"
    backup_model = "openai/gpt-5.2-2025-12-11"
    code_line_count = _count_code_lines(code)
    _code_compare_debug_log(f"[distractor] called | lines={code_line_count}")

    html_focus_instructions = ""
    css_js_task_focus_instructions = ""
    lowered_context = (context_label or "").strip().lower()
    if "language=html" in (context_label or "").strip().lower():
        html_focus_instructions = """

<html-priority-targets>
When the code is HTML, prioritize the primary change target in this exact order:
1. Restart button-related code (if present)
2. Status element-related code (if present)
3. Grid-related structure/logic hooks in HTML (if present)
4. If none of the above are present, pick another meaningful UI element

Apply this as one focused, plausible change while keeping the block valid and realistic.

For restart button and status element targets:
- Do NOT change any user-visible display text, label text, or inner text.
- Keep the exact displayed words unchanged.
- Focus on structural HTML hook changes only.

For HTML distractors, prefer one subtle, mild website-breaking integration change:
- Restart button target: if button uses id-based JS hookup, switch to inline onclick and remove/alter the id; if inline onclick exists, remove it and switch to id/class/data-* hook markup.
- Status target: switch from id-based status hook to an equivalent selector hook (class or data-status), or vice versa.
- Grid target: change grid container/cell hook attributes (id/class/data-*) so querySelector/getElementById assumptions no longer match.
- Impact on website behavior: wiring should be wrong in a plausible way so a related JS interaction silently fails or updates the wrong element.

Keep breakage subtle and plausible, not catastrophic.
Avoid copy/text-based giveaways; changes should be in markup wiring and structure.
</html-priority-targets>
"""
    # Check follow_up before zic_zac_zoe: "task=zic_zac_zoe" is a substring of "task=zic_zac_zoe_follow_up"
    if "language=css" in lowered_context and "task=zic_zac_zoe_follow_up" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-css-focus>
For zic_zac_zoe_follow_up symbol-color CSS, choose a plausible near-miss in this order:

1. If the code has two CSS blocks with separate colors and parallel structure (e.g. one block for each symbol color), show a version that uses one CSS block with a single mechanism to vary the color, such as CSS variables (var(--symbol-color)), attribute selectors ([data-symbol="x"]), or modifier classes (.symbol-x). Only one of these so it is not extremely different. This is already a bug because it will no longer work with the rest of the user's code.
2. If the code has one CSS block for symbol colors, show a two-block version (split into two parallel blocks with different colors). This is already a bug because it will no longer work with the rest of the user's code.
3. If neither (1) nor (2) is feasible, fall back to a near-miss like using 'text-decoration-color' or '::marker { color: ... }' incorrectly so that symbol color styling is wrong.

- Do NOT use typo-based bugs (e.g., "centre"), invalid property names, or invalid CSS values.
- The bug should be a plausible but wrong styling strategy for symbol colors, not a spelling mistake.
- Impact on website behavior: symbol color styling is wrong (A/B colors appear incorrectly or do not apply) or would not work with the user's actual code.
</task-specific-css-focus>
"""
    elif "language=css" in lowered_context and "task=zic_zac_zoe" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-css-focus>
For zic_zac_zoe centering-related CSS, prefer a plausible near-miss:
- Prefer an align-items-focused mistake: e.g., use align-items: center without the correct horizontal-centering rule.
- A common near-miss is replacing justify-content: center with align-items: center (or only adding align-items).
- You may also center the wrong container while keeping syntax valid.
- Do NOT use typo-based bugs (e.g., "centre"), invalid property names, or invalid CSS values.
- The bug should be a plausible but wrong styling strategy, not a spelling mistake.
- Impact on website behavior: layout/alignment looks wrong (positioning/centering is incorrect).
- Keep it realistic and close to the original style.
</task-specific-css-focus>
"""

    elif "language=javascript" in lowered_context and "task=zic_zac_zoe_follow_up" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-js-focus>
For zic_zac_zoe_follow_up, prefer a subtle near-miss in diagonal-win logic
or in how it composes with prior winner/tie logic.
- Avoid trivial or obvious literal tweaks (e.g., 25->24, 5->4, 0->1).
- Prefer deeper misconception-style bugs:
  - winner/tie branching order that checks tie too early and masks a valid diagonal win,
  - diagonal bounds/indexing mismatch in one direction only (out-of-bounds or skipped edge),
  - diagonal check runs with stale board state timing,
  - precedence/composition issue between diagonal check and base winner check.
- Impact on website behavior: win detection is wrong, such as premature winner/tie decisions or missed valid diagonal wins by looping over diagonals incorrectly.
</task-specific-js-focus>
"""

    elif "language=javascript" in lowered_context and "task=zic_zac_zoe" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-js-focus>
For zic_zac_zoe board rendering / move placement logic, add an error related to indexing or looping
that still looks correct at first glance.
- Avoid trivial or obvious literal tweaks, like changing a certain number or just one index
- Impact on website behavior: move play flow is wrong (whose turn it is, move counter tracking, or where a symbol gets placed).
- The code should not have any self-contradictions: for example, if you change the board indexing in one location, it should be changed in all locations.
</task-specific-js-focus>
"""

    prompt = """
<task>
Generate a distractor for this code block.
- The distractor code block
- Introduce one major bug that could probe a common misconception of students. Basically, someone who did not actually implement this code themselves may not realize the error
- Do not add obvious stylistic differences or artifacts. For example, if the original code block did not have comments, you should not add comments to the distractor block
- For JavaScript specifically: do NOT make reorder-only edits or stylistic rewrites that are logically equivalent.
- For JavaScript specifically: the distractor must introduce a genuine behavioral difference that changes outcomes for at least one realistic input path.
- For JavaScript specifically: do not merely rename variables, reorder condition checks with same semantics, or swap equivalent expressions.
- The bug should have a clear user-visible impact on website behavior (not only internal code differences).
</task>

<code>
{code}
</code>
{html_focus_instructions}
{css_js_task_focus_instructions}
{full_context_section}

<format>
Return strict JSON only:
{{
  "code": "DISTRACTOR_CODE"
}}
</format>
"""
    full_context_section = ""
    if full_context and full_context.strip():
        full_sheet_content = full_context.strip()
        _code_compare_debug_log(
            f"[distractor] full_context provided for CSS: lines={_count_code_lines(full_sheet_content)}"
        )
        full_context_section = (
            "\n<full_context>\n"
            "The following is the entire stylesheet for context. The block you must create a distractor for is in the <code> section above.\n"
            "</full_context>\n"
            "<full_sheet>\n"
            + full_sheet_content
            + "\n</full_sheet>"
        )
    prompt = prompt.format(
        code=code,
        full_context_section=full_context_section,
        html_focus_instructions=html_focus_instructions,
        css_js_task_focus_instructions=css_js_task_focus_instructions,
    ).strip()
    max_line_diff = 10

    context_suffix = f" context={context_label}" if context_label else ""

    for num_tries in range(5):
        model_name = random_model if num_tries == 0 else backup_model
        _code_compare_debug_log(f"[distractor] attempt={num_tries + 1}/3 model={model_name}")
        try:
            response = litellm.completion(
                model=model_name,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            output = response.choices[0].message.content.replace('```', '').replace('json', '').strip()
            if "{" in output and "}" in output:
                output = output[output.index("{"):output.rindex("}") + 1].strip()
            output = json.loads(output)
            candidate = output.get("code", None)
            if not isinstance(candidate, str):
                print(
                    f"[distractor] rejected attempt={num_tries + 1}: invalid 'code' field type="
                    f"{type(candidate).__name__} (expected str){context_suffix}",
                    flush=True,
                )
                _code_compare_debug_log(
                    f"[distractor] attempt={num_tries + 1} invalid output type={type(candidate).__name__}"
                )
                continue

            candidate_line_count = _count_code_lines(candidate)
            line_diff = abs(candidate_line_count - code_line_count)
            if line_diff <= max_line_diff:
                _code_compare_debug_log(f"[distractor] success on attempt={num_tries + 1}")
                return candidate
            print(
                f"[distractor] rejected attempt={num_tries + 1}: line-count mismatch "
                f"original={code_line_count} candidate={candidate_line_count} diff={line_diff} "
                f"(allowed<={max_line_diff}){context_suffix}",
                flush=True,
            )
            _code_compare_debug_log(
                f"[distractor] attempt={num_tries + 1} invalid/size-mismatched output diff={line_diff}"
            )
        except Exception as e:
            print(
                f"[distractor] rejected attempt={num_tries + 1}: exception={type(e).__name__} "
                f"details={e}{context_suffix}",
                flush=True,
            )
            _code_compare_debug_log(f"[distractor] attempt={num_tries + 1} failed: {e}")
            continue
    print(f"[distractor] exhausted attempts; returning empty string{context_suffix}", flush=True)
    _code_compare_debug_log("[distractor] exhausted attempts, returning empty string")
    return ""


def generate_single_code_compare_question(
    submission_code: Dict[str, str],
    language: str,
    include_explanation: bool = True,
    project_name: Optional[str] = None,
    selection_context: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Generate one code-compare question for a specific language family.
    Supported languages: html, css, js/javascript.
    project_name is passed through for task-specific HTML sampling (e.g. zic_zac_zoe).
    """
    normalized = (language or "").strip().lower()
    normalized_project = (project_name or "").strip().lower()
    print(
        f"[code-compare/start] language={normalized or language} include_explanation={include_explanation} project={normalized_project or 'none'}",
        flush=True,
    )
    if not include_explanation:
        _code_compare_skip_log(normalized or "unknown", "include_explanation_disabled")
        return None

    js_code, html_code, css_code = _collect_code_by_language(submission_code)

    use_requirement_selector = (
        normalized_project in REQUIREMENT_AWARE_COMPARE_TASKS
        and isinstance(selection_context, dict)
    )
    if use_requirement_selector:
        if normalized == "html":
            mapped_requirement = REQUIREMENT_TARGET_MAP.get(normalized_project, {}).get("html", "")
            starter_html = ""
            if isinstance(selection_context, dict):
                starter_html = str((selection_context.get("starter_code") or {}).get("html", "") or "")
            html_pair = _generate_html_compare_pair_direct(
                task_name=normalized_project,
                requirement_text=mapped_requirement,
                starter_html=starter_html,
                user_html=html_code,
            )
            if not html_pair or html_pair.get("status") != "selected":
                reason = ""
                if isinstance(html_pair, dict):
                    reason = str(html_pair.get("reason", "")).strip()
                _code_compare_skip_log("html", "html_pair_generation_abstain", f"reason={reason or 'none'}")
                return None
            return _build_code_compare_question_from_pair(
                question_name="identify_own_html_component",
                code_kind_label="HTML component",
                code_language="html",
                original_code=str(html_pair.get("real_snippet", "")).strip(),
                distractor_code=str(html_pair.get("distractor_snippet", "")).strip(),
            )

        requirements = selection_context.get("requirements", [])
        starter_code = selection_context.get("starter_code", {})
        user_code = {"html": html_code, "css": css_code, "js": js_code}
        selection = _select_requirement_target(
            language=normalized,
            task_name=normalized_project,
            task_requirements=requirements if isinstance(requirements, list) else [],
            user_code=user_code,
            starter_code=starter_code if isinstance(starter_code, dict) else {},
        )
        if selection and selection.get("status") == "selected":
            resolved = _resolve_selected_target_to_code(normalized, selection, js_code, html_code, css_code)
            if resolved:
                selected_name, selected_code = resolved
                question_name = {
                    "html": "identify_own_html_component",
                    "css": "identify_own_css_block",
                    "js": "identify_own_js_function",
                    "javascript": "identify_own_js_function",
                }.get(normalized, "identify_own_code_block")
                code_kind_label = {
                    "html": f"HTML component {selected_name}",
                    "css": f"CSS selector {selected_name}",
                    "js": f"JavaScript function {selected_name}",
                    "javascript": f"JavaScript function {selected_name}",
                }.get(normalized, "Code block")
                code_language = "javascript" if normalized in {"js", "javascript"} else normalized
                _code_compare_debug_log(
                    f"[selector] selected language={normalized} target={selection.get('target_kind')} value={selection.get('target_value')}"
                )
                return _build_code_compare_question(
                    question_name=question_name,
                    code_kind_label=code_kind_label,
                    code_language=code_language,
                    original_code=selected_code,
                    full_context_code=css_code if normalized == "css" else None,
                    task_name=normalized_project,
                )
            _code_compare_debug_log(
                f"[selector] abstain language={normalized}: selected target could not be resolved in user code"
            )
            _code_compare_skip_log(
                normalized,
                "selector_target_unresolvable",
                f"target_kind={selection.get('target_kind')} target_value={selection.get('target_value')}",
            )
            return None
        reason = selection.get("reason") if isinstance(selection, dict) else "selector_abstain"
        _code_compare_debug_log(f"[selector] abstain language={normalized} reason={reason}")
        _code_compare_skip_log(normalized, "selector_abstain", f"reason={reason}")
        return None

    if normalized == "html":
        main_container_component = _sample_main_container_html_component(html_code)
        if main_container_component:
            sampled_name, sampled_code = main_container_component
        else:
            sampled_html_component = _sample_html_component_for_explanation(
                html_code,
                project_name=project_name,
            )
            if not sampled_html_component:
                _code_compare_debug_log("[code-compare] html single compare skipped: no sampled component")
                _code_compare_skip_log("html", "no_sampled_component")
                return None
            sampled_name, sampled_code = sampled_html_component
        if not sampled_code or not sampled_code.strip():
            _code_compare_debug_log("[code-compare] html single compare skipped: no sampled component")
            _code_compare_skip_log("html", "sampled_component_empty")
            return None
        return _build_code_compare_question(
            question_name="identify_own_html_component",
            code_kind_label=f"HTML component {sampled_name}",
            code_language="html",
            original_code=sampled_code,
            task_name=normalized_project,
        )

    if normalized == "css":
        if not css_code or not css_code.strip():
            _code_compare_debug_log("[code-compare] css single compare skipped: no CSS content")
            _code_compare_skip_log("css", "no_css_content")
            return None
        return _build_code_compare_question(
            question_name="identify_own_css_block",
            code_kind_label="CSS stylesheet",
            code_language="css",
            original_code=css_code,
            full_context_code=None,
            task_name=normalized_project,
        )

    if normalized in ("js", "javascript"):
        functions_map = _parse_javascript_functions(js_code)
        if len(functions_map) == 0:
            _code_compare_debug_log("[code-compare] js single compare skipped: no functions")
            _code_compare_skip_log("javascript", "no_functions_found")
            return None

        eligible_functions = {
            name: code
            for name, code in functions_map.items()
            if name not in JS_FUNCTIONS_EXCLUDED_FROM_CODE_BLOCK_SAMPLING
            and _count_code_lines(code) <= MAX_CODE_COMPARE_BLOCK_LINES
        }
        if eligible_functions:
            sampled_function_name = random.choice(list(eligible_functions.keys()))
            sampled_function_code = eligible_functions[sampled_function_name]
            sampled_line_count = _count_code_lines(sampled_function_code)
            _code_compare_debug_log(
                f"[code-compare] js single compare sampled function='{sampled_function_name}' lines={sampled_line_count} max_lines={MAX_CODE_COMPARE_BLOCK_LINES}"
            )
        else:
            fallback_functions = {
                name: code
                for name, code in functions_map.items()
                if name not in JS_FUNCTIONS_EXCLUDED_FROM_CODE_BLOCK_SAMPLING
            }
            if not fallback_functions:
                _code_compare_debug_log("[code-compare] js single compare skipped: no functions after excluding onMove etc.")
                _code_compare_skip_log("javascript", "no_functions_after_exclusions")
                return None
            sampled_function_name = random.choice(list(fallback_functions.keys()))
            sampled_function_code = fallback_functions[sampled_function_name]
            sampled_line_count = _count_code_lines(sampled_function_code)
            _code_compare_debug_log(
                f"[code-compare] js single compare sampled fallback function='{sampled_function_name}' lines={sampled_line_count} (no <= {MAX_CODE_COMPARE_BLOCK_LINES} candidates)"
            )

        return _build_code_compare_question(
            question_name="identify_own_js_function",
            code_kind_label=f"JavaScript function {sampled_function_name}()",
            code_language="javascript",
            original_code=sampled_function_code,
            task_name=normalized_project,
        )

    _code_compare_debug_log(f"[code-compare] unsupported single compare language='{language}'")
    _code_compare_skip_log(normalized or "unknown", "unsupported_language", f"input={language}")
    return None


def _build_code_compare_question(
    question_name: str,
    code_kind_label: str,
    code_language: str,
    original_code: str,
    full_context_code: Optional[str] = None,
    task_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Build a two-block "which one is yours?" question using a distractor block.
    For CSS questions, pass full_context_code as the entire stylesheet so the distractor is context-aware.
    """
    if not original_code or not original_code.strip():
        _code_compare_debug_log(
            f"[code-compare] skip question={question_name} language={code_language}: empty original code"
        )
        _code_compare_skip_log(code_language, "empty_original_code", f"question={question_name}")
        return None

    print(
        f"[code-compare/build] question={question_name} language={code_language} original_lines={_count_code_lines(original_code)}",
        flush=True,
    )
    _code_compare_debug_log(f"[code-compare] building question={question_name} language={code_language}")
    is_css = (code_language or "").strip().lower() == "css"
    distractor_code = generate_distractor_code_block(
        original_code,
        context_label=f"question={question_name} language={code_language} task={(task_name or '').strip().lower()}",
        full_context=full_context_code if is_css else None,
    )
    if not distractor_code or not distractor_code.strip():
        _code_compare_debug_log(
            f"[code-compare] skip question={question_name} language={code_language}: empty distractor"
        )
        _code_compare_skip_log(code_language, "empty_distractor_code", f"question={question_name}")
        return None

    original_on_left = random.choice([True, False])
    left_code = original_code if original_on_left else distractor_code
    right_code = distractor_code if original_on_left else original_code
    answer_index = 1 if original_on_left else 2
    language_display = {
        "javascript": "JS",
        "html": "HTML",
        "css": "CSS",
    }.get(code_language.lower(), code_language.upper())
    block_label = "code blocks"
    # Keep "Left block:" / "Right block:" so frontend regex for side-by-side layout still matches.
    _code_compare_debug_log(
        f"[code-compare] built question={question_name} language={code_language} original_on_left={original_on_left}"
    )
    print(
        f"[code-compare/success] question={question_name} language={code_language} original_on_left={original_on_left}",
        flush=True,
    )
    return {
        "question_name": question_name,
        "question": (
            f"Exactly one of these two {language_display} {block_label} is from your project. "
            f"Which one is yours? The 🔶 symbol indicates line changes.\n\n"
            f"Left block:\n```{code_language}\n{left_code}\n```\n\n"
            f"Right block:\n```{code_language}\n{right_code}\n```"
        ),
        "question_type": "mcqa",
        "choices": ["The Left Code is Mine", "The Right Code is Mine"],
        "answer": answer_index,
    }


def _build_code_compare_question_from_pair(
    question_name: str,
    code_kind_label: str,
    code_language: str,
    original_code: str,
    distractor_code: str,
) -> Optional[Dict[str, Any]]:
    """Build compare question from pre-generated real/distractor pair."""
    if not original_code or not original_code.strip():
        _code_compare_skip_log(code_language, "empty_original_code", f"question={question_name}")
        return None
    if not distractor_code or not distractor_code.strip():
        _code_compare_skip_log(code_language, "empty_distractor_code", f"question={question_name}")
        return None
    if original_code.strip() == distractor_code.strip():
        _code_compare_skip_log(code_language, "identical_real_and_distractor", f"question={question_name}")
        return None

    original_on_left = random.choice([True, False])
    left_code = original_code if original_on_left else distractor_code
    right_code = distractor_code if original_on_left else original_code
    answer_index = 1 if original_on_left else 2
    language_display = {
        "javascript": "JS",
        "html": "HTML",
        "css": "CSS",
    }.get(code_language.lower(), code_language.upper())
    block_label = "stylesheets" if code_language.lower() == "css" else "code blocks"
    print(
        f"[code-compare/success] question={question_name} language={code_language} mode=direct_pair original_on_left={original_on_left}",
        flush=True,
    )
    return {
        "question_name": question_name,
        "question": (
            f"Exactly one of these two {language_display} {block_label} is from your project. "
            f"Which one is yours? The 🔶 symbol indicates line changes.\n\n"
            f"Left block:\n```{code_language}\n{left_code}\n```\n\n"
            f"Right block:\n```{code_language}\n{right_code}\n```"
        ),
        "question_type": "mcqa",
        "choices": ["The Left Code is Mine", "The Right Code is Mine"],
        "answer": answer_index,
    }


def _parse_javascript_functions(js_code: str) -> Dict[str, str]:
    """
    Parse JavaScript code to extract functions and their definitions.
    Uses esprima to parse the AST and extract:
    - Function declarations: function foo() { ... }
    - Arrow functions: const bar = () => {}
    - Function expressions: const baz = function() {}

    Falls back to regex-based parsing if esprima fails (e.g., due to modern syntax).

    Returns a dictionary mapping function names to their complete definitions.
    """
    import esprima

    functions_map: Dict[str, str] = {}

    if not js_code:
        return functions_map

    def extract_function_code(node):
        """Extract the source code for a function node using range."""
        if hasattr(node, "range") and node.range:
            # Use range to extract the exact source code
            start, end = node.range
            return js_code[start:end]
        return None

    def parse_with_esprima():
        """Try to parse with esprima, returning functions_map if successful."""
        result = {}

        # Try with tolerant mode first (handles some syntax errors)
        try:
            tree = esprima.parseScript(js_code, loc=True, range=True, tolerant=True)
        except Exception:
            # If tolerant mode fails, try parseModule for ES6 modules
            try:
                tree = esprima.parseModule(js_code, loc=True, range=True, tolerant=True)
            except Exception:
                # Both failed, return empty
                return result

        # Traverse the top-level statements in the program
        for node in tree.body:
            # Function declarations: function foo() { ... }
            if node.type == "FunctionDeclaration":
                if hasattr(node, "id") and node.id:
                    func_name = node.id.name
                    func_code = extract_function_code(node)
                    if func_code:
                        result[func_name] = func_code

            # Variable declarations that hold functions: const bar = () => {}
            elif node.type == "VariableDeclaration":
                for decl in node.declarations:
                    if hasattr(decl, "id") and hasattr(decl, "init") and decl.init:
                        var_name = decl.id.name if hasattr(decl.id, "name") else None
                        init = decl.init

                        # Arrow functions: const bar = () => {}
                        if init.type == "ArrowFunctionExpression":
                            if var_name:
                                func_code = extract_function_code(decl)
                                if func_code:
                                    result[var_name] = func_code

                        # Function expressions: const baz = function() {}
                        elif init.type == "FunctionExpression":
                            if var_name:
                                func_code = extract_function_code(decl)
                                if func_code:
                                    result[var_name] = func_code

        return result

    def parse_with_regex_fallback():
        """Fallback regex-based parser for basic function extraction."""
        result = {}

        # Pattern 1: Function declarations: function name() { ... }
        pattern1 = r"function\s+(\w+)\s*\([^)]*\)\s*\{"
        for match in re.finditer(pattern1, js_code):
            func_name = match.group(1)
            start = match.start()
            # Find matching closing brace
            brace_count = 0
            in_string = False
            string_char = None
            i = start
            while i < len(js_code):
                char = js_code[i]
                # Handle string literals
                if char in ('"', "'", "`") and (i == 0 or js_code[i - 1] != "\\"):
                    if not in_string:
                        in_string = True
                        string_char = char
                    elif char == string_char:
                        in_string = False
                        string_char = None
                elif not in_string:
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            result[func_name] = js_code[start:i + 1]
                            break
                i += 1

        # Pattern 2: Arrow functions: const name = () => { ... } or const name = () => ...
        pattern2 = r"(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{"
        for match in re.finditer(pattern2, js_code):
            func_name = match.group(1)
            start = match.start()
            # Find matching closing brace
            brace_count = 0
            in_string = False
            string_char = None
            # Skip to the => and then to the {
            arrow_pos = js_code.find("=>", start)
            if arrow_pos == -1:
                continue
            i = js_code.find("{", arrow_pos)
            if i == -1:
                continue

            while i < len(js_code):
                char = js_code[i]
                # Handle string literals
                if char in ('"', "'", "`") and (i == 0 or js_code[i - 1] != "\\"):
                    if not in_string:
                        in_string = True
                        string_char = char
                    elif char == string_char:
                        in_string = False
                        string_char = None
                elif not in_string:
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            result[func_name] = js_code[start:i + 1]
                            break
                i += 1

        # Pattern 3: Function expressions: const name = function() { ... }
        pattern3 = r"(?:const|let|var)\s+(\w+)\s*=\s*function\s*\([^)]*\)\s*\{"
        for match in re.finditer(pattern3, js_code):
            func_name = match.group(1)
            start = match.start()
            # Find matching closing brace
            brace_count = 0
            in_string = False
            string_char = None
            # Skip to the first {
            func_start = js_code.find("function", start)
            if func_start == -1:
                continue
            i = js_code.find("{", func_start)
            if i == -1:
                continue

            while i < len(js_code):
                char = js_code[i]
                # Handle string literals
                if char in ('"', "'", "`") and (i == 0 or js_code[i - 1] != "\\"):
                    if not in_string:
                        in_string = True
                        string_char = char
                    elif char == string_char:
                        in_string = False
                        string_char = None
                elif not in_string:
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            result[func_name] = js_code[start:i + 1]
                            break
                i += 1

        return result

    # Try esprima first
    try:
        functions_map = parse_with_esprima()
        if functions_map:
            return functions_map
    except Exception as e:
        print(f"Error parsing JavaScript with esprima (attempting fallback): {e}")

    # Fall back to regex-based parsing
    try:
        functions_map = parse_with_regex_fallback()
        if functions_map:
            print(f"Used regex fallback parser, extracted {len(functions_map)} functions")
            return functions_map
    except Exception as e:
        print(f"Error parsing JavaScript with regex fallback: {e}")

    # Return empty dict if both methods fail
    return functions_map


def _sample_main_container_html_component(html_code: str) -> Optional[tuple[str, str]]:
    """
    Prefer the starter wrapper block when present:
    <main class="container"> ... </main>
    """
    if not html_code or not html_code.strip():
        return None

    tag_regex = re.compile(r"<!--.*?-->|</?([a-zA-Z][\w:-]*)\b[^>]*?>", re.DOTALL)
    class_regex = re.compile(r'class\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
    matches = list(tag_regex.finditer(html_code))

    for idx, match in enumerate(matches):
        token = match.group(0)
        tag_name = (match.group(1) or "").lower()
        if tag_name != "main" or token.startswith("</") or token.startswith("<!--"):
            continue

        class_match = class_regex.search(token)
        if not class_match:
            continue
        classes = {cls.strip().lower() for cls in class_match.group(1).split() if cls.strip()}
        if "container" not in classes:
            continue

        depth = 1
        closing_end = None
        for inner_match in matches[idx + 1:]:
            inner_token = inner_match.group(0)
            inner_tag = (inner_match.group(1) or "").lower()
            if inner_tag != "main" or inner_token.startswith("<!--"):
                continue
            if inner_token.startswith("</"):
                depth -= 1
                if depth == 0:
                    closing_end = inner_match.end()
                    break
            elif not inner_token.rstrip().endswith("/>"):
                depth += 1

        if closing_end is None:
            continue

        component_code = html_code[match.start():closing_end].strip()
        if component_code:
            return "main.container", component_code

    return None


def _sample_html_component_for_explanation(
    html_code: str,
    project_name: Optional[str] = None,
) -> Optional[tuple[str, str]]:
    """
    Extract a non-trivial HTML component with threshold backoff and random sampling.
    For project_name "zic_zac_zoe", prefers a <p> tag or an element containing the text "Status".
    """
    if not html_code or not html_code.strip():
        return None

    normalized_project_name = (project_name or "").strip().lower()
    prefer_status_or_p = normalized_project_name == "zic_zac_zoe"

    tag_regex = re.compile(r"<!--.*?-->|</?([a-zA-Z][\w:-]*)\b[^>]*?>", re.DOTALL)
    void_tags = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr",
    }
    skip_tags = {"html", "head", "body", "script", "style"}
    candidates: List[Dict[str, Any]] = []

    matches = list(tag_regex.finditer(html_code))
    for idx, match in enumerate(matches):
        token = match.group(0)
        tag_name = (match.group(1) or "").lower()
        if not tag_name or token.startswith("</") or token.startswith("<!--"):
            continue
        if tag_name in void_tags or tag_name in skip_tags or token.rstrip().endswith("/>"):
            continue

        depth = 1
        closing_end = None
        for inner_match in matches[idx + 1:]:
            inner_token = inner_match.group(0)
            inner_tag = (inner_match.group(1) or "").lower()
            if not inner_tag or inner_token.startswith("<!--"):
                continue
            if inner_tag != tag_name:
                continue
            if inner_token.startswith("</"):
                depth -= 1
                if depth == 0:
                    closing_end = inner_match.end()
                    break
            elif inner_tag not in void_tags and not inner_token.rstrip().endswith("/>"):
                depth += 1

        if closing_end is None:
            continue

        component_code = html_code[match.start():closing_end].strip()
        if not component_code:
            continue

        line_count = len([line for line in component_code.splitlines() if line.strip()])
        visible_text = re.sub(r"<[^>]+>", " ", component_code)
        is_preferred_candidate = (
            tag_name == "p" or bool(re.search(r"\bstatus\b", visible_text, re.IGNORECASE))
        )
        # Keep the original non-triviality filter for all tasks except zic_zac_zoe.
        # For zic_zac_zoe, allow short preferred candidates (common for status labels).
        if line_count < 4 and not (prefer_status_or_p and is_preferred_candidate):
            continue

        open_tag_text = token
        id_match = re.search(r'id\s*=\s*["\']([^"\']+)["\']', open_tag_text, re.IGNORECASE)
        class_match = re.search(r'class\s*=\s*["\']([^"\']+)["\']', open_tag_text, re.IGNORECASE)
        name = tag_name
        if id_match:
            name += f"#{id_match.group(1)}"
        if class_match:
            first_class = class_match.group(1).strip().split()[0] if class_match.group(1).strip() else ""
            if first_class:
                name += f".{first_class}"

        candidates.append({
            "name": name,
            "code": component_code,
            "line_count": line_count,
            "tag_name": tag_name,
        })

    if not candidates:
        return None

    def _is_preferred(c: Dict[str, Any]) -> bool:
        if not prefer_status_or_p:
            return False
        if c["tag_name"] == "p":
            return True
        # Strip HTML tags and check for "status" in visible text.
        text = re.sub(r"<[^>]+>", " ", c["code"])
        return bool(re.search(r"\bstatus\b", text, re.IGNORECASE))

    eligible = [c for c in candidates if c["line_count"] <= MAX_CODE_COMPARE_BLOCK_LINES]
    if eligible:
        preferred = [c for c in eligible if _is_preferred(c)]
        pool = preferred if preferred else eligible
        chosen = random.choice(pool)
        return chosen["name"], chosen["code"]

    preferred = [c for c in candidates if _is_preferred(c)]
    pool = preferred if preferred else candidates
    chosen = random.choice(pool)
    return chosen["name"], chosen["code"]


def _normalize_css_selector_for_sampling(header: str) -> str:
    """Normalize selector for name checks: strip, lowercase, remove leading . and #."""
    s = header.strip().lower()
    while s and s[0] in (".", "#"):
        s = s[1:]
    first = s.split()[0] if s else ""
    return first.rstrip(",;") if first else first


def _sample_css_block_for_explanation(css_code: str) -> Optional[tuple[str, str]]:
    """
    Extract a reasonably sized CSS block using simple brace parsing.
    Prefer: 'cell' or any selector that is not 'cell', 'body', or 'grid'.
    Fallback: 'body' or 'grid'.
    """
    if not css_code or not css_code.strip():
        return None

    blocks: List[str] = []
    depth = 0
    token_start = None

    for i, ch in enumerate(css_code):
        if depth == 0 and token_start is None and not ch.isspace():
            token_start = i

        if ch == "{":
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
            if depth == 0 and token_start is not None:
                block = css_code[token_start:i + 1].strip()
                if block:
                    blocks.append(block)
                token_start = None
        elif ch == ";" and depth == 0 and token_start is not None:
            # Handles top-level statements such as @import;
            token_start = None

    if not blocks:
        return None

    fallback_names = ("body", "grid")

    scored: List[Dict[str, Any]] = []
    for block in blocks:
        header = block.split("{", 1)[0].strip()
        norm = _normalize_css_selector_for_sampling(header)
        declaration_count = block.count(":")
        line_count = len([line for line in block.splitlines() if line.strip()])
        if line_count < 3 and declaration_count < 3:
            continue
        scored.append({
            "name": header if header else "CSS block",
            "norm": norm,
            "code": block,
            "line_count": line_count,
            "declaration_count": declaration_count,
        })

    if not scored:
        return None

    # Preferred: any selector that is not 'body' or 'grid'
    preferred = [b for b in scored if b["norm"] not in fallback_names]
    # Fallback: only 'body' or 'grid'
    fallback = [b for b in scored if b["norm"] in fallback_names]

    if preferred:
        chosen = random.choice(preferred)
        return chosen["name"], chosen["code"]
    if fallback:
        chosen = random.choice(fallback)
        return chosen["name"], chosen["code"]
    return None
