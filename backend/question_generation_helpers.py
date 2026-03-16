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
# Unified abstention policy for all question-generation stages (target selection, question rewrite, snippet generation).
# Use in prompts so selection, validation, and snippet generation apply the same rule.
ABSTAIN_POLICY_UNIFIED = """
A question should be selected when the participant's code contains a recognizable artifact related to the target feature. If no such artifact exists, return status = "abstain". Use the following guidelines:

- HTML questions: Select the question if the code includes a status element intended to display game status on the page (e.g., a <p>, <div>, or similar element that appears to hold status text) and JavaScript code that attempts to access that element (e.g., selectElementById, querySelector, ...)

- CSS questions: Select the question if the code includes a CSS rule that appears to attempt positioning or aligning the board or page layout (i.e., centering rules like align-items or justify-content). The implementation may be incomplete or incorrect. If the user did not change their code based on the starter implementation, then you MUST abstain.

- JavaScript questions: Select the question if the code includes a function or logic that renders or populate the game board on the page (e.g., iterating over the board state and updating DOM elements). The implementation may be incomplete or incorrect. If this function (initially called renderBoard()) does not exist or was not attempted (blank or has a print statement), abstain.

If none of these artifacts are present for the relevant question type, return status = "abstain".
"""

REQUIREMENT_TARGET_MAP: Dict[str, Dict[str, str]] = {
    "zic_zac_zoe": {
        "html": "Add a status element in a paragraph tag underneath the header 'Zic-Zac-Zoe'. It should show whose turn it is ('Player A Turn' or 'Player B Turn') and a message when the game is over (e.g., 'Player A Wins!', 'Player B Wins!', 'Tie Game!'), prefixed by 'Status:'",
        "css": "Add CSS styling that allows the webpage to become centered horizontally",
        "js": "The board renders A and B moves in a 5x5 grid",
    },
    "zic_zac_zoe_follow_up": {
        "html": "Add a 'Reset Game' button below the board that resets the board, allowing for a new game of zic-zac-zoe. This must be a button on the page; resetting the game by refreshing the webpage does not count.",
        "css": "Change the colors of symbols on the board: 'A' should be red and 'B' should be blue",
        "js": "Along with your previous win condition logic, a player can also win zic-zac-zoe if they occupy all four corners of the board",
    },
}

SNIPPET_QUESTION_TEMPLATE_CONFIG: Dict[str, Dict[str, Dict[str, Dict[str, Any]]]] = {
    "zic_zac_zoe": {
        "html": {
            "mechanism": {
                "intent": "Test the user's understanding about the purpose of the status element",
                "main": "Which of these options best describes how the JavaScript code below uses the HTML element [INSERT DESCRIPTOR]?",
                "sample_gold_answers": [
                    "The JavaScript updates this element to display the game status",
                ],
                "sample_distractors": [
                    "The JavaScript uses this element to store the game board state for future access",
                    "The JavaScript updates this element to determine which player symbol appears next",
                    "The JavaScript listens for changes to this element to detect player moves",
                ],
                "gold_letter": "A",
            },
            "change": {
                "intent": "Ask the user a counterfactual question to see if they understand how the JavaScript code interacts with their HTML status element. Specifically, introduce a change that would alter how the JavaScript would access this HTML element.",
                "main": "In the HTML snippet below, the JavaScript selects the status element using the `[INSERT THE ATTRIBUTE THE USER'S WEBSITE CODE USES, LIKE ID NAME, CLASS NAME, OR TAG NAME in code ticks]` identifier. If `[INSERT SAME ATTRIBUTE in code ticks]` on the HTML element was changed to `[INSERT NEW ATTRIBUTE in code ticks]` but the rest of the website remained the same, what would most likely happen?",
                "sample_gold_answers": [
                    "The status element would never update",
                ],
                "sample_distractors": [
                    "The player turn and win detection logic would change",
                    "The status element would disappear from the page",
                    "The status element would be able to update",
                ],
                "gold_letter": "D",
            },
        },
        "css": {
            "mechanism": {
                "intent": "Test the user's understanding of how the CSS code applies styles. In this one in particular, the gold answers and distractors will probably be the same set, but the gold answer is subject to change.",
                "main": "In the CSS rule shown below, how does the selector `[CSS_SELECTOR in code ticks]` determine which elements on the website the styles are applied to?",
                "sample_gold_answers": [
                    "HTML elements whose ID matches the selector receive the rule's styles",
                ],
                "sample_distractors": [
                    "HTML elements whose class matches the selector receive the rule's styles",
                    "HTML elements whose tag name matches the selector receive the rule's styles",
                    "HTML elements whose children match the selector receive the rule's styles",
                ],
                "gold_letter": "D",
            },
            "change": {
                "intent": "Ask the user a counterfactual question to see if they understand how the CSS code actually centers the board element. Specifically, introduce a change that would modify the positioning.",
                "main": "The CSS rule in the snippet below uses the attribute `[INSERT MAIN ATTRIBUTE(S) that attempts to do centering in code ticks]`. If this attribute was removed but the rest of the website stayed the same, what would most likely happen to the elements where the `[INSERT SELECTOR that is shown]` rule applies?",
                "sample_gold_answers": [
                    "The elements would be aligned to the left",
                ],
                "sample_distractors": [
                    "The elements would be aligned to the right",
                    "The elements would be centered horizontally",
                    "The elements would be unable to show the grid",
                ],
                "gold_letter": "B",
            },
        },
        "js": {
            "mechanism": {
                "intent": "Ask the user about the purpose of the JavaScript function for rendering the board",
                "main": "The JavaScript snippet below shows the function `[FUNCTION_NAME in code ticks]`. Which of these options best describes the primary purpose of this function?",
                "sample_gold_answers": [
                "Sync the displayed board with the current board state"
                ],
                "sample_distractors": [
                "Initialize the website with a blank board for each game",
                "Transform the board from a 2D to a 1D array",
                "Save the current board state for future game logic"
                ],
                "gold_letter": "C"
            },
            "change": {
                "intent": "Ask the user a counterfactual question to see if they understand how the JavaScript function actually renders the board. Specifically, introduce a change that would not make the last row render. If the user is not actually udpating the board visually in their function, you should abstain. (If the user's initial function did not render the last row correctly, you MUST alter this question susbtantially to something that would not render properly.)\nNOTE: if the user's code has no for loop, abstain from this question",
                "main": "The JavaScript snippet below shows the function `[FUNCTION_NAME in code ticks]`, which renders the game board. Imagine the loop indexing in this function were changed so that [IF THIS IS A NESTED INDEX OVER `board`, CHANGE THE LOGIC SO THE INNER LOOP ENDS ONE EARLY. IF THIS IS A SINGLE LOOP OVER `cells`, CHANGE THE LOGIC SO THE LOOP STOPS AT 20 (OR ANOTHER NUMBER IF NOT POSSIBLE)]. If the rest of the website stayed the same, which of these best describes how your original board display logic would change? (Remember: If the user's initial function did not render the last row correctly, you MUST alter this question susbtantially to something that would not render properly.)",
                "sample_gold_answers": [
                    "The bottom-most row of the board would not be accessed",
                ],
                "sample_distractors": [
                    "The left-most column of the board would not be accessed",
                    "The right-most column of the board would not be accessed",
                    "The top-most row of the board would not be accessed",
                ],
                "gold_letter": "D",
            },
        },
    },
    "zic_zac_zoe_follow_up": {
        "html": {
            "mechanism": {
                "intent": "Ask the user about the role of the HTML snippet for the restart button on their website.",
                "main": "In this snippet, what is the primary role of this HTML element [reference the element uniquely for the reset button] in your website?",
                "sample_gold_answers": [
                    "It lets the user play a new game",
                ],
                "sample_distractors": [
                    "It lets the user change who goes first",
                    "It lets the user refresh the page",
                    "It lets the user clear the symbol color",
                ],
                "gold_letter": "C",
            },
            "change": {
                "intent": "Ask the user a counterfactual question to see if they understand how the JavaScript code interacts with their HTML elements. Specifically, introduce a change that would alter how the JavaScript accesses the HTML element.",
                "main": "In this snippet, if the identifier [insert whatever is used to select this element in the JavaScript, such as the ID, tag (e.g. <div> vs <p>), or the class, used for displaying the reset button] of this HTML button [reference the name of the element] was changed but the rest of the website stayed the same, what would happen to your website?",
                "sample_gold_answers": [
                    "Clicking the button would no longer reset the game",
                ],
                "sample_distractors": [
                    "The button would no longer appear on the page",
                    "The visual style of the button would change",
                    "The position of the button would change",
                ],
                "gold_letter": "A",
            },
        },
        "css": {
            "mechanism": {
                "intent": "Ask the user the role of the CSS snippet for controlling the color of A and B symbols on their website.",
                "main": "In this snippet, what visual effect does the CSS rule [insert the rules for changing the colors of A and B symbols] have on the game symbols?",
                "sample_gold_answers": [
                    "It controls the color of symbols on the board",
                ],
                "sample_distractors": [
                    "It controls the default color of the entire page",
                    "It controls the color of cell backgrounds on the board",
                    "It controls the text of all elements on the page"
                ],
                "gold_letter": "A",
            },
            "change": {
                "intent": "Ask the user a counterfactual question to see if they understand how the CSS code actually colors the symbols on their website.",
                "main": "In this snippet, if the [insert selector for selecting A] were changed to [insert another selector name like relating to cell C] but the rest of the website stayed the same, what would happen to your website?",
                "sample_gold_answers": [
                    "The A symbol would no longer use this style",
                ],
                "sample_distractors": [
                    "The board would look the same",
                    "Cells with 'A' would display a different symbol",
                    "All symbols on the board would change color",
                ],
                "gold_letter": "A",
            },
        },
        "js": {
            "mechanism": {
                "intent": "Ask the user about the role of the follow-up JavaScript snippet for their game logic.",
                "main": "In this snippet, what behavior or logic does this JavaScript function [insert the name of the JavaScript function that checks the winners] handle?",
                "sample_gold_answers": [
                    "It detects whether a player has won the game",
                ],
                "sample_distractors": [
                    "It updates the board display after a player moves",
                    "It creates the status element that displays the winner",
                    "It handles user clicks on the board cells",
                ],
                "gold_letter": "C",
            },
            "change": {
                "intent": "Ask the user a counterfactual to test whether they understand that the order of independent win-condition checks does not affect gameplay.",
                "main": "In this snippet, if the order of the horizontal win check and the corner win check were swapped, what would happen to your game?",
                "sample_gold_answers": [
                    "The game would still correctly detect winners",
                ],
                "sample_distractors": [
                    "The game would no longer detect corner win conditions",
                    "The game would prematurely detect corner win conditions",
                    "The game would no longer detect horizontal win conditions",
                ],
                "gold_letter": "A",
            },
        },
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
        # Match only when the wanted selector is exactly one of the comma-separated
        # selectors (e.g. .B must match ".B" not ".board"). No substring matching.
        header_parts = [h.strip().lower() for h in header.split(",")]
        if wanted_low in header_parts:
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
            "Selectors may be class names, tag names, or IDs. "
            "Use a single selector in target_value, or multiple selectors in target_values (JSON array). "
            "If the user's CSS is identical or nearly identical to the starter CSS (no meaningful attempt at the requirement), return status = \"abstain\"."
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

{abstain_policy}
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
        abstain_policy=ABSTAIN_POLICY_UNIFIED.strip(),
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


def _get_snippet_question_templates(task_name: str, language: str) -> Optional[Dict[str, Dict[str, Any]]]:
    task_key = (task_name or "").strip().lower()
    lang_key = "js" if (language or "").strip().lower() in {"javascript", "js"} else (language or "").strip().lower()
    if not task_key:
        return None
    task_templates = SNIPPET_QUESTION_TEMPLATE_CONFIG.get(task_key)
    if not isinstance(task_templates, dict):
        return None
    language_templates = task_templates.get(lang_key)
    if not isinstance(language_templates, dict):
        return None
    mechanism_templates = language_templates.get("mechanism")
    change_templates = language_templates.get("change")
    if not isinstance(mechanism_templates, dict) or not isinstance(change_templates, dict):
        return None
    return {
        "mechanism": mechanism_templates,
        "change": change_templates,
    }


def _build_full_website_context(html_code: str, css_code: str, js_code: str) -> str:
    return (
        "<website_html>\n"
        + (html_code or "")
        + "\n</website_html>\n\n"
        + "<website_css>\n"
        + (css_code or "")
        + "\n</website_css>\n\n"
        + "<website_javascript>\n"
        + (js_code or "")
        + "\n</website_javascript>"
    )


def _gold_letter_to_index(gold_letter: str) -> Optional[int]:
    letter = (gold_letter or "").strip().upper()
    mapping = {"A": 1, "B": 2, "C": 3, "D": 4}
    return mapping.get(letter)


def _build_fixed_choices_from_templates(type_templates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    gold_answers = [str(x).strip() for x in (type_templates.get("sample_gold_answers") or []) if str(x).strip()]
    distractors = [str(x).strip() for x in (type_templates.get("sample_distractors") or []) if str(x).strip()]
    gold_idx = _gold_letter_to_index(str(type_templates.get("gold_letter", "")))

    # Fixed-choice contract: exactly one gold and three distractors.
    if len(gold_answers) != 1 or len(distractors) != 3 or not gold_idx:
        return None

    gold = gold_answers[0]
    if any(d.lower() == gold.lower() for d in distractors):
        return None

    return {
        "gold_answer": gold,
        "distractors": distractors,
        "answer_index": gold_idx,
    }


def _assemble_choices_with_fixed_gold_position(
    gold_answer: str,
    distractors: List[str],
    answer_index: int,
) -> Optional[List[str]]:
    if not gold_answer or not isinstance(distractors, list) or len(distractors) != 3:
        return None
    if answer_index < 1 or answer_index > 4:
        return None
    cleaned_distractors = [str(x).strip() for x in distractors if str(x).strip()]
    if len(cleaned_distractors) != 3:
        return None
    if any(d.lower() == gold_answer.lower() for d in cleaned_distractors):
        return None
    choices: List[str] = []
    distractor_iter = iter(cleaned_distractors)
    for i in range(1, 5):
        if i == answer_index:
            choices.append(gold_answer)
        else:
            choices.append(next(distractor_iter))
    if len(set(c.lower() for c in choices)) < 4:
        return None
    return choices


def _pick_snippet_for_language(
    submission_code: Dict[str, str],
    language: str,
    project_name: Optional[str],
    selection_context: Optional[Dict[str, Any]],
) -> Optional[Tuple[str, str]]:
    normalized = (language or "").strip().lower()
    normalized_project = (project_name or "").strip().lower()
    js_code, html_code, css_code = _collect_code_by_language(submission_code)

    use_requirement_selector = (
        normalized_project in REQUIREMENT_AWARE_COMPARE_TASKS
        and isinstance(selection_context, dict)
    )
    if use_requirement_selector:
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
            if resolved and resolved[1] and resolved[1].strip():
                return resolved

    if normalized == "html":
        sampled = _sample_main_container_html_component(html_code) or _sample_html_component_for_explanation(
            html_code,
            project_name=project_name,
        )
        if sampled and sampled[1] and sampled[1].strip():
            return sampled
        return None

    if normalized == "css":
        sampled = _sample_css_block_for_explanation(css_code)
        if sampled and sampled[1] and sampled[1].strip():
            return sampled
        return None

    if normalized in {"js", "javascript"}:
        functions_map = _parse_javascript_functions(js_code)
        if not functions_map:
            return None
        eligible = [
            (name, code)
            for name, code in functions_map.items()
            if name not in JS_FUNCTIONS_EXCLUDED_FROM_CODE_BLOCK_SAMPLING
            and _count_code_lines(code) <= MAX_CODE_COMPARE_BLOCK_LINES
        ]
        if eligible:
            name, code = random.choice(eligible)
            return (f"{name}()", code)
        fallback = [
            (name, code)
            for name, code in functions_map.items()
            if name not in JS_FUNCTIONS_EXCLUDED_FROM_CODE_BLOCK_SAMPLING
        ]
        if fallback:
            name, code = random.choice(fallback)
            return (f"{name}()", code)
    return None


def _build_snippet_question_stems(type_templates: Dict[str, Any], include_change_backup_questions: bool) -> List[str]:
    stems: List[str] = []
    main = str(type_templates.get("main", "")).strip()
    if main:
        stems.append(main)
    stems.extend([str(x).strip() for x in (type_templates.get("backups") or []) if str(x).strip()])
    if include_change_backup_questions:
        stems.extend([str(x).strip() for x in (type_templates.get("backup_questions") or []) if str(x).strip()])
    # Preserve order while deduping.
    seen: Set[str] = set()
    unique_stems: List[str] = []
    for stem in stems:
        if stem in seen:
            continue
        seen.add(stem)
        unique_stems.append(stem)
    return unique_stems


def _rewrite_and_validate_fixed_mcq(
    full_website_context: str,
    snippet_label: str,
    snippet_code: str,
    code_language: str,
    question_kind: str,
    question_stem: str,
    template_intent: str,
    sample_gold_answer: str,
    sample_distractors: List[str],
    answer_index: int,
    snippet_code_js: Optional[str] = None,
    starter_css: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    model = "openai/gpt-5.2-2025-12-11"
    if not question_stem:
        return None
    if not sample_gold_answer or not isinstance(sample_distractors, list) or len(sample_distractors) != 3:
        return None
    if answer_index < 1 or answer_index > 4:
        return None
    prompt = """
<task>
You are validating whether a multiple-choice question can be asked about a user's code snippet.

You MUST do two things:
1) Rewrite the question so it aligns with the provided question template and code details.
2) Validate the answer options, and adapt their wording only if needed for this participant's code.

Interpret the code literally. Do not infer intended behavior beyond what the code actually does or attempts to do. The generated question is meant to test the understanding of the user's own code.

Question-rewrite rules:
- Try to adhere to the style of the question_template.
- Fill in concrete details from the participant's code (e.g. element IDs, function names, selectors) where the template has placeholders.
- Write a single clear question that stands on its own; the snippet will be shown right after it
- Make sure the question is extremely clear and easy to understand

Validation rule:
- The designated gold option must be correct for the user's actual code.
- Every distractor option must be incorrect for the user's actual code.
- The gold option must describe what the code ACTUALLY does, not the intended behavior

Abstention policy:
{abstain_policy}

Option-adaptation rules:
- Start from the provided sample gold answer and sample distractors.
- Keep the original wording when it already fits the participant's code.
- If wording does not fit, adapt it so one option is clearly correct and three are clearly incorrect for this participant's implementation.
- Avoid introducing stylistic cues: keep all four options similar in length (no more than five word differences), tone, specificity, and structure. In particular, all distractors must be very similar in length to each other (and the gold option should be similar too) so that length does not cue the answer. Do not add extra punctuation like parentheses or semi-colons on individual answers.
- None of the options should include words that relate to "change"; this is especially important in the counterfactual-style questions. We don't want to cue the user based on how their implementation current works. So instead of saying "Your board would stay centered" or this would "no longer" work, you could say "Your board would be centered"
- Remember: one option must stay correct and three must stay incorrect.
</task>

<question_spec>
- question_kind: {question_kind}
- intent: {template_intent}
- question_template: {question_stem}
</question_spec>

<full_website_context>
{full_website_context}
</full_website_context>
{starter_css_block}

<selected_snippet label="{snippet_label}" language="{code_language}">
{snippet_code}
</selected_snippet>
{snippet_js_block}

The question template below provides an example question choices for a WORKING implementation. If the user's implementation is correct, you can adapt this question directly. If their implementation is incomplete or incorrect, you will have to adapt the options to make sure the gold answer is correct and the distractors are objectively wrong.
<provided_option_templates>
- sample_gold_answer: {sample_gold_answer}
- sample_distractors:
  - {sample_distractor_1}
  - {sample_distractor_2}
  - {sample_distractor_3}
- gold_answer_index: {answer_index}
</provided_option_templates>

Remember, if you are changing the gold answer, keep the word length differences minimal! (less than 5 words)

<format>
Return strict JSON only. Also provide a short reason explaining why the question was selected or why the feature was absent in a "reason" key, and how you made any changes:
{{
  "status": "selected|abstain",
  "rewritten_question": "string_or_empty",
  "adapted_gold_option": "string_or_empty",
  "adapted_distractor_options": ["d1", "d2", "d3"],
  "reason": "short reason"
}}
</format>
"""
    snippet_js_block = ""
    if snippet_code_js and snippet_code_js.strip():
        snippet_js_block = (
            '\n<selected_snippet label="' + snippet_label + '" language="javascript">\n'
            + snippet_code_js.strip()
            + "\n</selected_snippet>\n"
        )
    starter_css_block = ""
    if code_language == "css" and starter_css and starter_css.strip():
        starter_css_block = (
            "\n<starter_css>\n"
            "The participant started with this CSS (before any edits). Use it to judge whether they made meaningful change towards the task requirement. If their current CSS is identical or nearly identical, return status = \"abstain\".\n"
            "```css\n"
            + starter_css.strip()
            + "\n```\n"
            "</starter_css>\n"
        )
    prompt = prompt.format(
        question_kind=question_kind,
        template_intent=template_intent or "",
        question_stem=question_stem,
        full_website_context=full_website_context,
        starter_css_block=starter_css_block,
        snippet_label=snippet_label,
        code_language=code_language,
        snippet_code=snippet_code,
        snippet_js_block=snippet_js_block,
        abstain_policy=ABSTAIN_POLICY_UNIFIED.strip(),
        sample_gold_answer=sample_gold_answer,
        sample_distractor_1=sample_distractors[0],
        sample_distractor_2=sample_distractors[1],
        sample_distractor_3=sample_distractors[2],
        answer_index=answer_index,
    ).strip()
    try:
        response = litellm.completion(model=model, messages=[{"role": "user", "content": prompt}])
        payload = _extract_json_object(response.choices[0].message.content)
        if not payload:
            return None
        status = str(payload.get("status", "")).strip().lower()
        rewritten_question = str(payload.get("rewritten_question", "")).strip()
        if status == "abstain":
            return {
                "status": "abstain",
                "rewritten_question": "",
                "reason": str(payload.get("reason", "")).strip(),
            }

        if code_language in {'js', 'javascript'}:
            print('\n')
            print(payload)

        adapted_gold_option = str(payload.get("adapted_gold_option", "")).strip()
        adapted_distractor_options_raw = payload.get("adapted_distractor_options")
        if (
            status == "selected"
            and rewritten_question
            and adapted_gold_option
            and isinstance(adapted_distractor_options_raw, list)
        ):
            adapted_distractor_options = [
                str(x).strip() for x in adapted_distractor_options_raw if str(x).strip()
            ]
            if len(adapted_distractor_options) != 3:
                return None
            choices = _assemble_choices_with_fixed_gold_position(
                gold_answer=adapted_gold_option,
                distractors=adapted_distractor_options,
                answer_index=answer_index,
            )
            if not choices:
                return None
            return {
                "status": "selected",
                "rewritten_question": rewritten_question,
                "choices": choices,
                "answer_index": answer_index,
            }
    except Exception as e:
        _code_compare_debug_log(
            f"[snippet-questions] validation error kind={question_kind}: {e}"
        )
    return None


def generate_snippet_understanding_questions(
    submission_code: Dict[str, str],
    language: str,
    include_questions: bool = True,
    project_name: Optional[str] = None,
    selection_context: Optional[Dict[str, Any]] = None,
    real_block_override: Optional[Dict[str, str]] = None,
    compare_question_generated: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    if not include_questions:
        return []
    normalized = (language or "").strip().lower()
    if normalized not in {"html", "css", "js", "javascript"}:
        return []
    # For CSS/JS, only show purpose/mechanism questions when the pairwise "identify your code" question was generated.
    if normalized in {"css", "js", "javascript"} and compare_question_generated is False:
        return []

    snippet_label: Optional[str] = None
    snippet_code: Optional[str] = None
    snippet_code_js: Optional[str] = None

    if normalized == "html":
        if real_block_override and real_block_override.get("html_snippet"):
            snippet_label = "status element (HTML + JavaScript)"
            snippet_code = str(real_block_override["html_snippet"]).strip()
            snippet_code_js = str(real_block_override.get("html_snippet_js") or "").strip() or None
        else:
            # HTML mechanism/change questions use only the snippet from the identify_own pair; no fallback.
            return []
    elif normalized in {"css", "js", "javascript"} and real_block_override and real_block_override.get("snippet_code"):
        # Use the same block as the pairwise compare question (same logic, same snippet).
        snippet_label = str(real_block_override.get("snippet_label") or "snippet").strip() or "snippet"
        snippet_code = str(real_block_override["snippet_code"]).strip()
    else:
        snippet = _pick_snippet_for_language(
            submission_code=submission_code,
            language=normalized,
            project_name=project_name,
            selection_context=selection_context,
        )
        if not snippet:
            return []
        snippet_label, snippet_code = snippet
        snippet_code = (snippet_code or "").strip() if snippet_code else ""

    if not snippet_code:
        return []

    normalized_project = (project_name or "").strip().lower()
    if not normalized_project or normalized_project not in SNIPPET_QUESTION_TEMPLATE_CONFIG:
        return []

    js_code, html_code, css_code = _collect_code_by_language(submission_code)
    full_website_context = _build_full_website_context(html_code, css_code, js_code)
    starter_css_for_prompt = ""
    if normalized == "css" and isinstance(selection_context, dict):
        starter_code = selection_context.get("starter_code")
        if isinstance(starter_code, dict):
            starter_css_for_prompt = str(starter_code.get("css") or "").strip()
    templates = _get_snippet_question_templates(normalized_project, normalized)
    if not templates:
        return []
    prompt_language = "javascript" if normalized in {"js", "javascript"} else normalized
    normalized_prefix = "js" if normalized in {"js", "javascript"} else normalized

    mechanism_templates = templates.get("mechanism") or {}
    change_templates = templates.get("change") or {}
    mechanism_stems = _build_snippet_question_stems(
        mechanism_templates,
        include_change_backup_questions=False,
    )
    change_stems = _build_snippet_question_stems(
        change_templates,
        include_change_backup_questions=True,
    )
    mechanism_fixed = _build_fixed_choices_from_templates(mechanism_templates)
    change_fixed = _build_fixed_choices_from_templates(change_templates)
    if not mechanism_fixed or not change_fixed:
        return []

    if snippet_code_js:
        snippet_block = (
            f"HTML:\n```html\n{snippet_code}\n```\n\n"
            f"JavaScript:\n```javascript\n{snippet_code_js}\n```"
        )
    else:
        snippet_block = f"```{prompt_language}\n{snippet_code}\n```"
    generated_questions: List[Dict[str, Any]] = []

    for kind, type_templates, stems, fixed, question_name in [
        (
            "mechanism",
            mechanism_templates,
            mechanism_stems,
            mechanism_fixed,
            f"{normalized_prefix}_snippet_mechanism",
        ),
        (
            "change",
            change_templates,
            change_stems,
            change_fixed,
            f"{normalized_prefix}_snippet_change_impact",
        ),
    ]:
        if not stems:
            continue
        selected: Optional[Dict[str, Any]] = None
        for stem in stems:
            attempt = _rewrite_and_validate_fixed_mcq(
                full_website_context=full_website_context,
                snippet_label=snippet_label or "snippet",
                snippet_code=snippet_code,
                code_language=prompt_language,
                question_kind=kind,
                question_stem=stem,
                template_intent=str(type_templates.get("intent", "")).strip(),
                sample_gold_answer=str(fixed["gold_answer"]),
                sample_distractors=list(fixed["distractors"]),
                answer_index=int(fixed["answer_index"]),
                snippet_code_js=snippet_code_js,
                starter_css=starter_css_for_prompt if normalized == "css" else None,
            )

            if not attempt:
                continue
            if attempt.get("status") == "selected":
                selected = attempt
                break
        if not selected:
            continue
        choices = selected["choices"]
        answer_index = int(fixed["answer_index"])
        gold_text = (
            choices[answer_index - 1]
            if isinstance(choices, list) and 1 <= answer_index <= len(choices)
            else str(fixed.get("gold_answer", ""))
        )
        generated_questions.append(
            {
                "question_name": question_name,
                "question": f"{selected['rewritten_question']}\n{snippet_block}",
                "question_type": "mcqa_vertical",
                "choices": choices,
                "answer": answer_index,
                "gold_answer": gold_text,
            }
        )

    return generated_questions


def _generate_html_compare_pair_direct(
    task_name: str,
    requirement_text: str,
    starter_html: str,
    user_html: str,
    user_js: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Generate real and distractor snippets for a "which code is yours?" question.
    For status element-related code, returns both HTML and JavaScript snippets per side.
    """
    if not user_html or not user_html.strip():
        return None

    model = "openai/gpt-5.2-2025-12-11"
    prompt = """
<task>
You are generating a pair of code snippets for a "which code is yours?" question.

Prioritize the primary change target in this exact order:
1. Status element-related code (if present)

When generating status element-related code, you MUST extract BOTH:
- The HTML element for the status (usually a few lines, often one), in real_snippet and distractor_snippet.
- The relevant JavaScript that accesses that element (e.g. getElementById, querySelector, etc.), in real_snippet_js and distractor_snippet_js. We just need the line with the variable that accesses the HTML element and the line that updates the content (e.g., via textContent, innerHTML, etc.). Do not paste the whole function where it updates. You can use "..." to indicate line breaks. You do not need to preserve indenting for the JavaScript code

Use the user's full HTML and JavaScript (provided below) to find the status element and the JS that references its id, class, or tag. Return the exact snippets from the user's code for the "real" side, and a logically equivalent but altered version for the "distractor" side.

For the distractor: change the identifier used to select the element (e.g. a different id or class name) and reflect that change in BOTH the HTML and the JavaScript so the distractor is self-consistent. Match the user's style.

If you are NOT generating status element code (e.g. no status element or no JS that accesses it), return only real_snippet and distractor_snippet (leave real_snippet_js and distractor_snippet_js empty or omitted). In that case, use only HTML snippets as before.

{abstain_policy}
For this task: the required artifact is the status element plus the JavaScript that accesses it; abstain only when either is absent.
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

<user_javascript>
{user_js}
</user_javascript>

<format>
Return strict JSON only:
{{
  "status": "selected|abstain",
  "real_snippet": "string (HTML snippet; required when selected)",
  "distractor_snippet": "string (HTML snippet; required when selected)",
  "real_snippet_js": "string or empty (JS that accesses the element; use for status element)",
  "distractor_snippet_js": "string or empty (JS for distractor; use for status element)",
  "reason": "short reason"
}}
</format>
""".format(
        task_name=task_name,
        requirement_text=requirement_text,
        abstain_policy=ABSTAIN_POLICY_UNIFIED.strip(),
        starter_html=starter_html or "",
        user_html=user_html,
        user_js=user_js or "",
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
            real_snippet_js = str(payload.get("real_snippet_js", "")).strip()
            distractor_snippet_js = str(payload.get("distractor_snippet_js", "")).strip()
            # If one side has JS, both should (for consistent two-block display).
            if real_snippet_js or distractor_snippet_js:
                if not real_snippet_js or not distractor_snippet_js:
                    continue
            return {
                "status": "selected",
                "real_snippet": real_snippet,
                "distractor_snippet": distractor_snippet,
                "real_snippet_js": real_snippet_js,
                "distractor_snippet_js": distractor_snippet_js,
                "reason": str(payload.get("reason", "")).strip(),
            }
        except Exception as e:
            _code_compare_debug_log(f"[html-pair] generation error: {e}")
    return {
        "status": "abstain",
        "real_snippet": "",
        "distractor_snippet": "",
        "reason": "could not generate both snippets",
    }


def _is_code_compare_debug_enabled() -> bool:
    return os.getenv("DEBUG_CODE_COMPARE", "").strip().lower() in {"1", "true", "yes", "on"}


def _code_compare_debug_log(message: str) -> None:
    if _is_code_compare_debug_enabled():
        pass  # debug logging disabled (print removed)


def _code_compare_skip_log(language: str, reason: str, extra: str = "") -> None:
    pass  # skip logging disabled (print removed)


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

1. If the code defines two near-identical CSS rules that differ mainly by color for two cell types (for example, .A and .B), provide a version that consolidates them into a single shared rule and varies only the color through one simple mechanism, such as a CSS variable, an attribute selector, or a modifier class. Use just one of those approaches, not multiple. The goal is to preserve the original structure while showing that the two styles could be merged, assuming the backend can output the needed class or attribute.
2. If the code has one CSS block for symbol colors, show a two-block version (split into two parallel blocks with different colors).
3. If neither (1) nor (2) is feasible, fall back to a near-miss like using 'text-decoration-color' or '::marker { color: ... }' incorrectly so that symbol color styling is wrong.

- Do NOT use typo-based bugs (e.g., "centre"), invalid property names, or invalid CSS values.
- The bug should be a plausible but wrong styling strategy for symbol colors, not a spelling mistake.
- Impact on website behavior: symbol color styling is wrong (A/B colors appear incorrectly or do not apply) or would not work with the user's actual code.
- Keep it realistic and mirroring the original style. Do not introduce stylistic differences like adding/removing comments that were/were not in the original, using different spacing/indents/newlines, or different syntax conventions that are logically equivalent in this case 
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
- Keep it realistic and mirroring the original style. Do not introduce stylistic differences like adding/removing comments that were/were not in the original, using different spacing/indents/newlines, or different syntax conventions that are logically equivalent in this case 
</task-specific-css-focus>
"""

    elif "language=javascript" in lowered_context and "task=zic_zac_zoe_follow_up" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-js-focus>
For zic_zac_zoe_follow_up, prefer a subtle near-miss when checking the winner in all four corners of the board that would change the win detection
- Avoid trivial or obvious literal tweaks (e.g., changing numbers)
- Prefer deeper misconception-style bugs that would break intergration with the rest of the code:
  - winner/tie branching order that checks for ties too early
  - Not actually comparing all four corners due to an overlap
  - a for loop that doesn't actually detect all four corners of the board
  - Returning different values that are incompatible with the rest of the codebase
- Impact on website behavior: win detection is wrong, such as premature winner/tie decisions or missed valid four-corner wins by looping over corners incorrectly.
- Keep it realistic and mirroring the original style. Do not introduce stylistic differences like adding/removing comments that were/were not in the original, using different spacing/indents/newlines, or different syntax conventions that are logically equivalent in this case (e.g., == versus ===)
</task-specific-js-focus>
"""

    elif "language=javascript" in lowered_context and "task=zic_zac_zoe" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-js-focus>
For zic_zac_zoe board rendering / move placement logic, add an error related to indexing or looping
that still looks correct at first glance.
- Avoid trivial or obvious literal tweaks, like changing a certain number or just one index
- Prefer deeper misconception-style bugs that would break intergration with the rest of the code:
  - Incorrectly indexing the input board (e.g., swapping rows and columns)
  - Off-by-one errors when counting the number of player turns and whose turn it is
  - Setting the value of HTML elements incorrectly or prematurely
- Impact on website behavior: move play flow is wrong (whose turn it is, move counter tracking, or where a symbol gets placed).
- The code should not have any self-contradictions: for example, if you change the board indexing or return type in one location, it should be changed in all relevant locations.
- Keep it realistic and mirroring the original style. Do not introduce stylistic differences like adding/removing comments that were/were not in the original, using different spacing/indents/newlines, or different syntax conventions that are logically equivalent in this case (e.g., == versus ===)
</task-specific-js-focus>
"""

    prompt = """
<task>
Generate a distractor for this code block.
- The distractor code block
- Introduce one major bug that could probe a common misconception of students. Basically, someone who did not actually implement this code themselves may not realize the error
- Do not add obvious stylistic differences or artifacts. For example, if the original code block did not have comments, you should not add comments to the distractor block. If the original code block did have comments, you should preserve them.
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
                _code_compare_debug_log(
                    f"[distractor] attempt={num_tries + 1} invalid output type={type(candidate).__name__}"
                )
                continue

            candidate_line_count = _count_code_lines(candidate)
            line_diff = abs(candidate_line_count - code_line_count)
            if line_diff <= max_line_diff:
                _code_compare_debug_log(f"[distractor] success on attempt={num_tries + 1}")
                return candidate
            _code_compare_debug_log(
                f"[distractor] attempt={num_tries + 1} invalid/size-mismatched output diff={line_diff}"
            )
        except Exception as e:
            _code_compare_debug_log(f"[distractor] attempt={num_tries + 1} failed: {e}")
            continue
    _code_compare_debug_log("[distractor] exhausted attempts, returning empty string")
    return ""


def generate_distractor_code_block_logical_equivalence(
    code: str,
    context_label: str = "",
    full_context: Optional[str] = None,
) -> str | Tuple[str, str]:
    """
    Generate a distractor code block. For CSS and JS, returns (real_code, distractor_code)
    so both are generated in one call for consistent style; otherwise returns just the distractor string.
    """
    random_model = "openai/gpt-5.2-2025-12-11"
    backup_model = "openai/gpt-5.2-2025-12-11"
    code_line_count = _count_code_lines(code)
    _code_compare_debug_log(f"[distractor] called | lines={code_line_count}")

    html_focus_instructions = ""
    css_js_task_focus_instructions = ""
    lowered_context = (context_label or "").strip().lower()
    generate_both_real_and_distractor = (
        "language=css" in lowered_context or "language=javascript" in lowered_context
    )
    if "language=html" in (context_label or "").strip().lower():
        html_focus_instructions = """

<html-priority-targets>
When the code is HTML, prioritize the primary change target in this exact order:
1. Restart button-related code (if present)
2. Status element-related code (if present)
3. Grid-related structure/logic hooks in HTML (if present)
4. If none of the above are present, pick another meaningful UI element

For HTML distractors, prioritize the following changes in this order:
- switch the label of the element's ID to something that this user could plausibly specify. this distractor should match the style of the user's
- switch the label of the element's class name to something that this user could plausibly specify. this distractor should match the style of the user's
- any other change that is noticeable but different
</html-priority-targets>
"""
    # Check follow_up before zic_zac_zoe: "task=zic_zac_zoe" is a substring of "task=zic_zac_zoe_follow_up"
    if "language=css" in lowered_context and "task=zic_zac_zoe_follow_up" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-css-focus>
For zic_zac_zoe_follow_up symbol-color CSS, prefer one of these distractors:
1. If the code has two CSS blocks with separate colors and parallel structure (e.g. one block for each symbol color), show a version that uses one CSS block with a single mechanism to vary the color, such as CSS variables (var(--symbol-color)), attribute selectors ([data-symbol="x"]), or modifier classes (.symbol-x). Only one of these so it is not extremely different. This is already a bug because it will no longer work with the rest of the user's code.
2. If the code has one CSS block for symbol colors, show a two-block version (split into two parallel blocks with different colors). This is already a bug because it will no longer work with the rest of the user's code.
3. If neither (1) nor (2) is feasible, fall back to a synonymous way of setting the text color like "-webkit-text-fill-color"
4. If this still is not possible, introduce some other logically equivalent difference

- Do NOT use typo-based bugs (e.g., "centre"), invalid property names, or invalid CSS values.
- Keep it realistic and mirroring the original style. Do not introduce stylistic differences like adding/removing comments that were/were not in the original, using different spacing/indents/newlines, or different syntax conventions that are logically equivalent in this case 
</task-specific-css-focus>
"""
    elif "language=css" in lowered_context and "task=zic_zac_zoe" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-css-focus>
For zic_zac_zoe centering-related CSS, generate a different but logically equivalent way that the user could have centered their code horizontally, i.e., by altering different attributes than what the user's code did. Try to use one that is similar to what they did in style. For example, if they used justify-content: center, you could use align-items: center and switching the flexbox direction (and vice versa).

There are different ways to center the component, but the distractor should focus on one that appears simple. If you add too many extra lines compared to the original its a clear giveaway.

If this is not possible, introduce some other logically equivalent difference (but they should not be identical)
</task-specific-css-focus>
"""

    elif "language=javascript" in lowered_context and "task=zic_zac_zoe_follow_up" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-js-focus>
For zic_zac_zoe_follow_up, prefer one of these distractors in this order:
- First, change the location in the code for where the user checks all four corners.
- If this isn't possible, swap the order of the horizontal and vertical checks
- If this also isn't possible, introduce some other logically equivalent change of the function (but they should not be identical)
</task-specific-js-focus>
"""

    elif "language=javascript" in lowered_context and "task=zic_zac_zoe" in lowered_context:
        css_js_task_focus_instructions = """
<task-specific-js-focus>
For zic_zac_zoe board rendering implementations, add an logically equivalent change related to indexing. Prefer one of the distractors in this order:
- If the user loops over a 2D matrix (e.g., the 2D 'board' based on rows and columns) and then converts it into a 1D matrix index (access 'cells' via 5*i+j), swap the approach: loop over the 1D list (cells) and map it into a 2D matrix indices (board). The vice versa also applies
- Make sure the style is EXACTLY the same between the two versions, including comments, indentation, and newlines. Try to use a more conventional style for both.
- If this 2D vs 1D change is not possible because the user has not implemented the function this way, introduce some other logically equivalent change of the function (but they should not be identical)
</task-specific-js-focus>
"""

    if generate_both_real_and_distractor:
        task_and_format = """
<task>
Generate TWO versions of this code block in a single, consistent style (same formatting, comments, indentation, naming conventions).
1. real_code: A faithful reproduction of the given code, in the exact style you will use for both outputs.
2. distractor_code: Same as real_code except introduce noticeable but logically equivalent differences (so someone who did not implement this might not spot it).

By generating both in one response, keep style identical between the two; only the intended logical-equivalence change should differ. Do not add or remove comments, change spacing, or introduce other stylistic differences between real_code and distractor_code.
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
  "real_code": "FAITHFUL_REPRODUCTION_IN_YOUR_STYLE",
  "distractor_code": "SAME_BUT_WITH_ONE_LOGICAL_EQUIVALENCE_CHANGE"
}}
</format>
"""
    else:
        task_and_format = """
<task>
Generate a distractor for this code block.
- Introduce one noticeable but logically equivalent difference such that someone who did not actually implement this code themselves may not realize the difference
- Do not add obvious stylistic differences or artifacts. For example, if the original code block did not have comments, you should not add comments to the distractor block. If the original code block did have comments, you should preserve them.
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
    prompt = task_and_format
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

            if generate_both_real_and_distractor:
                real_candidate = output.get("real_code", None)
                candidate = output.get("distractor_code", None)
                if not isinstance(real_candidate, str) or not isinstance(candidate, str):
                    _code_compare_debug_log(
                        f"[distractor] attempt={num_tries + 1} invalid output types"
                    )
                    continue
                candidate_line_count = _count_code_lines(candidate)
                line_diff = abs(candidate_line_count - code_line_count)
                if line_diff <= max_line_diff:
                    _code_compare_debug_log(f"[distractor] success on attempt={num_tries + 1} (both real+distractor)")
                    return (real_candidate.strip(), candidate.strip())
                _code_compare_debug_log(
                    f"[distractor] attempt={num_tries + 1} invalid/size-mismatched output diff={line_diff}"
                )
            else:
                candidate = output.get("code", None)
                if not isinstance(candidate, str):
                    _code_compare_debug_log(
                        f"[distractor] attempt={num_tries + 1} invalid output type={type(candidate).__name__}"
                    )
                    continue

                candidate_line_count = _count_code_lines(candidate)
                line_diff = abs(candidate_line_count - code_line_count)
                if line_diff <= max_line_diff:
                    _code_compare_debug_log(f"[distractor] success on attempt={num_tries + 1}")
                    return candidate
                _code_compare_debug_log(
                    f"[distractor] attempt={num_tries + 1} invalid/size-mismatched output diff={line_diff}"
                )
        except Exception as e:
            _code_compare_debug_log(f"[distractor] attempt={num_tries + 1} failed: {e}")
            continue
    _code_compare_debug_log("[distractor] exhausted attempts, returning empty string")
    return ""


def generate_single_code_compare_question(
    submission_code: Dict[str, str],
    language: str,
    include_explanation: bool = True,
    project_name: Optional[str] = None,
    selection_context: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, str]]]:
    """
    Generate one code-compare question for a specific language family.
    Supported languages: html, css, js/javascript.
    project_name is passed through for task-specific HTML sampling (e.g. zic_zac_zoe).
    """
    normalized = (language or "").strip().lower()
    normalized_project = (project_name or "").strip().lower()
    if not include_explanation:
        _code_compare_skip_log(normalized or "unknown", "include_explanation_disabled")
        return None

    js_code, html_code, css_code = _collect_code_by_language(submission_code)

    # For HTML, use only the direct pair generator; no sample-based fallback.
    if normalized == "html":
        if not html_code or not html_code.strip():
            _code_compare_skip_log("html", "no_html_content")
            return (None, None)
        mapped_requirement = REQUIREMENT_TARGET_MAP.get(normalized_project, {}).get("html", "")
        starter_html = ""
        if isinstance(selection_context, dict):
            starter_html = str((selection_context.get("starter_code") or {}).get("html", "") or "")
        html_pair = _generate_html_compare_pair_direct(
            task_name=normalized_project,
            requirement_text=mapped_requirement,
            starter_html=starter_html,
            user_html=html_code,
            user_js=js_code or "",
        )
        if html_pair and html_pair.get("status") == "selected":
            real_html = str(html_pair.get("real_snippet", "")).strip()
            real_js = str(html_pair.get("real_snippet_js", "")).strip()
            question = _build_code_compare_question_from_pair(
                question_name="identify_own_html_component",
                code_kind_label="HTML component",
                code_language="html",
                original_code=real_html,
                distractor_code=str(html_pair.get("distractor_snippet", "")).strip(),
                original_code_js=real_js or None,
                distractor_code_js=str(html_pair.get("distractor_snippet_js", "")).strip() or None,
            )
            real_block = None
            if question and real_js:
                real_block = {"html_snippet": real_html, "html_snippet_js": real_js}
            return (question, real_block)
        reason = str(html_pair.get("reason", "")).strip() if html_pair else "no pair"
        _code_compare_debug_log(f"[code-compare] html direct abstain/fail: {reason or 'none'}")
        _code_compare_skip_log("html", "direct_abstain_or_fail", reason or "none")
        return (None, None)

    use_requirement_selector = (
        normalized_project in REQUIREMENT_AWARE_COMPARE_TASKS
        and isinstance(selection_context, dict)
    )
    if use_requirement_selector and normalized != "html":
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
                q = _build_code_compare_question(
                    question_name=question_name,
                    code_kind_label=code_kind_label,
                    code_language=code_language,
                    original_code=selected_code,
                    full_context_code=css_code if normalized == "css" else None,
                    task_name=normalized_project,
                )
                # Return same block for mechanism/change questions so they use the same snippet.
                snippet_block = {"snippet_label": selected_name, "snippet_code": selected_code}
                return (q, snippet_block)
            _code_compare_debug_log(
                f"[selector] abstain language={normalized}: selected target could not be resolved in user code"
            )
            _code_compare_skip_log(
                normalized,
                "selector_target_unresolvable",
                f"target_kind={selection.get('target_kind')} target_value={selection.get('target_value')}",
            )
            return (None, None)
        reason = selection.get("reason") if isinstance(selection, dict) else "selector_abstain"
        _code_compare_debug_log(f"[selector] abstain language={normalized} reason={reason}")
        _code_compare_skip_log(normalized, "selector_abstain", f"reason={reason}")
        return (None, None)

    if normalized == "css":
        if not css_code or not css_code.strip():
            _code_compare_debug_log("[code-compare] css single compare skipped: no CSS content")
            _code_compare_skip_log("css", "no_css_content")
            return (None, None)
        q = _build_code_compare_question(
            question_name="identify_own_css_block",
            code_kind_label="CSS stylesheet",
            code_language="css",
            original_code=css_code,
            full_context_code=None,
            task_name=normalized_project,
        )
        return (q, None)

    if normalized in ("js", "javascript"):
        functions_map = _parse_javascript_functions(js_code)
        if len(functions_map) == 0:
            _code_compare_debug_log("[code-compare] js single compare skipped: no functions")
            _code_compare_skip_log("javascript", "no_functions_found")
            return (None, None)

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
                return (None, None)
            sampled_function_name = random.choice(list(fallback_functions.keys()))
            sampled_function_code = fallback_functions[sampled_function_name]
            sampled_line_count = _count_code_lines(sampled_function_code)
            _code_compare_debug_log(
                f"[code-compare] js single compare sampled fallback function='{sampled_function_name}' lines={sampled_line_count} (no <= {MAX_CODE_COMPARE_BLOCK_LINES} candidates)"
            )

        q = _build_code_compare_question(
            question_name="identify_own_js_function",
            code_kind_label=f"JavaScript function {sampled_function_name}()",
            code_language="javascript",
            original_code=sampled_function_code,
            task_name=normalized_project,
        )
        return (q, None)

    _code_compare_debug_log(f"[code-compare] unsupported single compare language='{language}'")
    _code_compare_skip_log(normalized or "unknown", "unsupported_language", f"input={language}")
    return (None, None)


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

    _code_compare_debug_log(f"[code-compare] building question={question_name} language={code_language}")
    is_css = (code_language or "").strip().lower() == "css"
    result = generate_distractor_code_block_logical_equivalence(
        original_code,
        context_label=f"question={question_name} language={code_language} task={(task_name or '').strip().lower()}",
        full_context=full_context_code if is_css else None,
    )

    if isinstance(result, tuple):
        original_code, distractor_code = result[0], result[1]
    else:
        distractor_code = result
    if not distractor_code or not distractor_code.strip():
        _code_compare_debug_log(
            f"[code-compare] skip question={question_name} language={code_language}: empty distractor"
        )
        _code_compare_skip_log(code_language, "empty_distractor_code", f"question={question_name}")
        return None
    if not original_code or not original_code.strip():
        _code_compare_debug_log(
            f"[code-compare] skip question={question_name} language={code_language}: empty original (from model pair)"
        )
        _code_compare_skip_log(code_language, "empty_original_code_from_pair", f"question={question_name}")
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
    original_code_js: Optional[str] = None,
    distractor_code_js: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Build compare question from pre-generated real/distractor pair. Optional JS blocks for HTML+JS pairs."""
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
    has_js = bool(
        (original_code_js or "").strip() and (distractor_code_js or "").strip()
    )
    left_html = original_code if original_on_left else distractor_code
    right_html = distractor_code if original_on_left else original_code
    left_js = (original_code_js or "").strip() if original_on_left else (distractor_code_js or "").strip()
    right_js = (distractor_code_js or "").strip() if original_on_left else (original_code_js or "").strip()
    answer_index = 1 if original_on_left else 2
    language_display = {
        "javascript": "JS",
        "html": "HTML",
        "css": "CSS",
    }.get(code_language.lower(), code_language.upper())
    if has_js:
        block_label = "pairs of code blocks (HTML + JavaScript)"
        question_text = (
            f"Exactly one of these two {block_label} is from your project. "
            f"Which one is yours? The 🔶 symbol indicates line changes.\n\n"
            f"Left block:\n```html\n{left_html}\n```\n```javascript\n{left_js}\n```\n\n"
            f"Right block:\n```html\n{right_html}\n```\n```javascript\n{right_js}\n```"
        )
    else:
        block_label = "stylesheets" if code_language.lower() == "css" else "code blocks"
        question_text = (
            f"Exactly one of these two {language_display} {block_label} is from your project. "
            f"Which one is yours? The 🔶 symbol indicates line changes.\n\n"
            f"Left block:\n```{code_language}\n{left_html}\n```\n\n"
            f"Right block:\n```{code_language}\n{right_html}\n```"
        )
    return {
        "question_name": question_name,
        "question": question_text,
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
        pass  # esprima failed, try fallback

    # Fall back to regex-based parsing
    try:
        functions_map = parse_with_regex_fallback()
        if functions_map:
            return functions_map
    except Exception as e:
        pass  # regex fallback failed

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
