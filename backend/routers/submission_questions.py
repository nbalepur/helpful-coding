"""
Submission questions API: generate and save tutorial/submission questions.
"""
import asyncio
import json
import random
import re
from typing import Dict, Any, List, Optional

import litellm
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from database.config import get_db
from database.sqlalchemy_models import User, Project, SubmissionQuestion
from database.models import GenerateSubmissionQuestionsRequest, SaveTutorialSubmissionQuestionsRequest
from database.crud import ProjectCRUD
from database.models import ProjectCreate

router = APIRouter(prefix="/api", tags=["Submission Questions"])


def generate_distractor_functions(function_names: list) -> list:
    """Generate plausible function names that don't exist in the code."""
    random_model = random.choice([
        "openai/gpt-5.1-2025-11-13",
        "anthropic/claude-sonnet-4-5-20250929",
        "gemini/gemini-3-pro-preview",
    ])
    backup_model = "gemini/gemini-3-pro-preview"
    prompt = """
<task>
You are an expert at generating function names that do not exist in a user's code but plausibly could.
Given a list of function names, generate exactly five function names that mimic the style of the existing function names, but do not actually exist.
</task>
Here are the existing function names:
<function_names>
{function_names}
</function_names>
<format>
Generate your output as a JSON with the key "fake_function_names" and the value being an array of exactly five function names as strings:
{{
    "fake_function_names": ["function_name_1", "function_name_2", "function_name_3", "function_name_4", "function_name_5"]
}}
Do not generate anything else.
</format>
""".format(
        function_names=function_names
    ).strip()
    for num_tries in range(3):
        response = litellm.completion(
            model=random_model if num_tries == 0 else backup_model,
            messages=[{"role": "user", "content": prompt}],
        )
        output = response.choices[0].message.content.replace("`", "").replace("json", "").strip()
        if "{" in output and "}" in output:
            output = output[output.index("{") : output.rindex("}") + 1].strip()
        out = json.loads(output)
        if isinstance(out.get("fake_function_names"), list) and len(out.get("fake_function_names", [])) == 5:
            return out["fake_function_names"]
    return []


def generate_ui_features(html_code: str, css_code: str, js_code: str) -> tuple:
    """Generate real and fake UI features for submission questions."""
    question_generation_model = "openai/gpt-5.2-2025-12-11"
    prompt = """
<task>
Given the user's HTML, CSS, and JavaScript code, generate five features that exist and five that do not but plausibly could.
</task>
<html>{html}</html>
<css>{css}</css>
<javascript>{js}</javascript>
<format>
{{ "real_features": ["...", ...], "fake_features": ["...", ...] }}
</format>
""".format(
        html=html_code, css=css_code, js=js_code
    ).strip()
    for _ in range(3):
        response = litellm.completion(
            model=question_generation_model,
            messages=[{"role": "user", "content": prompt}],
        )
        output = response.choices[0].message.content.replace("`", "").replace("json", "").strip()
        if "{" in output and "}" in output:
            output = output[output.index("{") : output.rindex("}") + 1].strip()
        out = json.loads(output)
        if (
            isinstance(out.get("real_features"), list)
            and isinstance(out.get("fake_features"), list)
            and len(out.get("real_features", [])) == 5
            and len(out.get("fake_features", [])) == 5
        ):
            return out["real_features"], out["fake_features"]
    return [], []


def generate_ui_questions(submission_code: Dict[str, str]) -> List[Dict[str, Any]]:
    """Build UI feature multi_select questions from submission code."""
    MAX_FEATURES_TO_SHOW = 4
    questions = []
    js_code = html_code = css_code = ""
    for filename, code_content in submission_code.items():
        if filename.endswith(".js") or filename.endswith(".javascript"):
            js_code += code_content + "\n\n"
        elif filename.endswith(".html"):
            html_code += code_content + "\n\n"
        elif filename.endswith(".css"):
            css_code += code_content + "\n\n"
    real_features, fake_features = generate_ui_features(html_code, css_code, js_code)
    if not real_features or not fake_features:
        return []
    all_features = real_features + fake_features
    random.shuffle(all_features)
    all_features = all_features[:MAX_FEATURES_TO_SHOW]
    questions.append({
        "question_name": "ui_features_distractors",
        "question": "Which of the following features exist in your website? It is possible that all of these or none of these exist.",
        "question_type": "multi_select",
        "choices": list(all_features),
        "answer": [1 if x in real_features else 0 for x in all_features],
    })
    return questions


def _parse_javascript_functions(js_code: str) -> Dict[str, str]:
    """Parse JavaScript code to extract functions and their definitions. Uses esprima with regex fallback."""
    import esprima

    functions_map = {}
    if not js_code:
        return functions_map

    def extract_function_code(node):
        if hasattr(node, "range") and node.range:
            start, end = node.range
            return js_code[start:end]
        return None

    def parse_with_esprima():
        result = {}
        try:
            tree = esprima.parseScript(js_code, loc=True, range=True, tolerant=True)
        except Exception:
            try:
                tree = esprima.parseModule(js_code, loc=True, range=True, tolerant=True)
            except Exception:
                return result
        for node in tree.body:
            if node.type == "FunctionDeclaration":
                if hasattr(node, "id") and node.id:
                    func_name = node.id.name
                    func_code = extract_function_code(node)
                    if func_code:
                        result[func_name] = func_code
            elif node.type == "VariableDeclaration":
                for decl in node.declarations:
                    if hasattr(decl, "id") and hasattr(decl, "init") and decl.init:
                        var_name = decl.id.name if hasattr(decl.id, "name") else None
                        init = decl.init
                        if init.type == "ArrowFunctionExpression" or init.type == "FunctionExpression":
                            if var_name:
                                func_code = extract_function_code(decl)
                                if func_code:
                                    result[var_name] = func_code
        return result

    def parse_with_regex_fallback():
        result = {}
        pattern1 = r"function\s+(\w+)\s*\([^)]*\)\s*\{"
        for match in re.finditer(pattern1, js_code):
            func_name = match.group(1)
            start = match.start()
            brace_count = 0
            i = start
            while i < len(js_code):
                char = js_code[i]
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        result[func_name] = js_code[start : i + 1]
                        break
                i += 1
        pattern2 = r"(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{"
        for match in re.finditer(pattern2, js_code):
            func_name = match.group(1)
            start = match.start()
            arrow_pos = js_code.find("=>", start)
            if arrow_pos == -1:
                continue
            i = js_code.find("{", arrow_pos)
            if i == -1:
                continue
            brace_count = 0
            while i < len(js_code):
                char = js_code[i]
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        result[func_name] = js_code[start : i + 1]
                        break
                i += 1
        return result

    try:
        functions_map = parse_with_esprima()
        if functions_map:
            return functions_map
    except Exception as e:
        print(f"Error parsing JavaScript with esprima: {e}")
    try:
        functions_map = parse_with_regex_fallback()
        if functions_map:
            return functions_map
    except Exception as e:
        print(f"Error parsing JavaScript with regex fallback: {e}")
    return functions_map


def generate_js_questions(submission_code: Dict[str, str]) -> List[Dict[str, Any]]:
    """Generate function-name multi_select questions from JS code."""
    MAX_FUNCTION_NAMES_TO_SHOW = 4
    questions = []
    js_code = ""
    for filename, code_content in submission_code.items():
        if filename.endswith(".js") or filename.endswith(".javascript"):
            js_code += code_content + "\n\n"
    functions_map = _parse_javascript_functions(js_code)
    if not functions_map:
        return []
    real_function_names = list(functions_map.keys())
    fake_function_names = generate_distractor_functions(real_function_names)
    if len(fake_function_names) > len(real_function_names):
        random.shuffle(fake_function_names)
        fake_function_names = fake_function_names[: len(real_function_names)]
    if len(real_function_names) > len(fake_function_names):
        random.shuffle(real_function_names)
        real_function_names = real_function_names[: len(fake_function_names)]
    all_function_names_to_show = real_function_names + fake_function_names
    if len(all_function_names_to_show) > MAX_FUNCTION_NAMES_TO_SHOW:
        random.shuffle(all_function_names_to_show)
        all_function_names_to_show = all_function_names_to_show[:MAX_FUNCTION_NAMES_TO_SHOW]
    function_name_choices = [x + "()" for x in all_function_names_to_show]
    if function_name_choices:
        questions.append({
            "question_name": "function_names_distractors",
            "question": "Which of the following JavaScript functions exist in your code? It is possible that all of these or none of these exist.",
            "question_type": "multi_select",
            "choices": function_name_choices,
            "answer": [0 if name in fake_function_names else 1 for name in all_function_names_to_show],
        })
    return questions


async def _generate_submission_questions(
    submission_title: str,
    submission_description: str,
    submission_code: Dict[str, str],
    project_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Generate submission questions (self-report + code-based + optional sanity check)."""
    ALWAYS_ATTENTION_CHECK_TASKS = {"snake", "platformer"}
    questions = []
    self_report_options = [
        "1 - Strongly disagree",
        "2 - Disagree",
        "3 - Neither agree nor disagree",
        "4 - Agree",
        "5 - Strongly agree",
    ]
    questions.extend([
        {"question_name": "self_report_understanding", "question": "I understand how my code works.", "question_type": "mcqa", "choices": self_report_options, "answer": ""},
        {"question_name": "self_report_review", "question": "I read and reviewed all of the AI-generated code.", "question_type": "mcqa", "choices": self_report_options, "answer": ""},
        {"question_name": "self_report_explain", "question": "I could explain how my code works to someone else while looking at it.", "question_type": "mcqa", "choices": self_report_options, "answer": ""},
        {"question_name": "self_report_modify", "question": "I could easily add new features to my code without using AI tools.", "question_type": "mcqa", "choices": self_report_options, "answer": ""},
    ])
    num_self_report_questions = len(questions)
    code_questions, ui_questions = await asyncio.gather(
        asyncio.to_thread(generate_js_questions, submission_code),
        asyncio.to_thread(generate_ui_questions, submission_code),
    )
    questions.extend(ui_questions)
    questions.extend(code_questions)
    should_add_sanity_check = project_name and project_name in ALWAYS_ATTENTION_CHECK_TASKS
    if should_add_sanity_check:
        position_to_insert = random.randint(0, num_self_report_questions)
        choice_to_select = random.choice(self_report_options)
        sanity_question = {
            "question_name": "sanity_check",
            "question": f'Attention Check: Please select "{choice_to_select}" as your answer',
            "question_type": "mcqa",
            "choices": self_report_options,
            "answer": self_report_options.index(choice_to_select) + 1,
        }
        questions.insert(position_to_insert, sanity_question)
    # Free response question
    questions.append({
        "question_name": "feedback_comments",
        "question": "Any other comments or feedback?",
        "question_type": "free_response",
    })
    return questions


@router.post("/submission-questions/generate")
async def generate_submission_questions(
    payload: GenerateSubmissionQuestionsRequest,
    db: Session = Depends(get_db),
):
    try:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        project = db.query(Project).filter(Project.id == payload.project_id).first()
        if not project:
            return JSONResponse(status_code=404, content={"error": "Project not found"})

        generated_questions = await _generate_submission_questions(
            submission_title=payload.submission_title,
            submission_description=payload.submission_description,
            submission_code=payload.submission_code,
            project_name=project.name.lower() if project.name else None,
        )
        created_questions = []
        for question_data in generated_questions:
            question_record = SubmissionQuestion(
                user_id=payload.user_id,
                project_id=payload.project_id,
                question_name=question_data["question_name"],
                question=question_data["question"],
                question_type=question_data["question_type"],
                choices=question_data.get("choices"),
                answer=question_data.get("answer"),
                user_answer=None,
                score=None,
            )
            db.add(question_record)
            db.flush()
            created_questions.append({
                "id": question_record.id,
                "question_name": question_record.question_name,
                "question": question_record.question,
                "question_type": question_record.question_type,
                "choices": question_record.choices,
                "answer": question_record.answer,
            })
        db.commit()
        return {"success": True, "questions": created_questions, "count": len(created_questions)}
    except Exception as e:
        db.rollback()
        print(f"Error generating submission questions: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate submission questions: {str(e)}"},
        )


@router.post("/submission-questions/save-tutorial")
async def save_tutorial_submission_questions(
    payload: SaveTutorialSubmissionQuestionsRequest,
    db: Session = Depends(get_db),
):
    try:
        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        tutorial_project = db.query(Project).filter(func.lower(Project.name) == "tutorial").first()
        if not tutorial_project:
            tutorial_project = ProjectCRUD.create(
                db,
                ProjectCreate(
                    name="Tutorial",
                    description="Tutorial task",
                    files=None,
                ),
            )
        saved_questions = []
        for question_data in payload.questions:
            question_name = question_data.get("question_name") or question_data.get("id", "")
            question_text = question_data.get("question", "")
            question_type = question_data.get("question_type", "free_response")
            choices = question_data.get("choices")
            answer = question_data.get("answer")
            existing_question = (
                db.query(SubmissionQuestion)
                .filter(
                    SubmissionQuestion.user_id == payload.user_id,
                    SubmissionQuestion.project_id == tutorial_project.id,
                    SubmissionQuestion.question_name == question_name,
                )
                .order_by(SubmissionQuestion.created_at.desc())
                .first()
            )
            if existing_question:
                question_record = existing_question
            else:
                question_record = SubmissionQuestion(
                    user_id=payload.user_id,
                    project_id=tutorial_project.id,
                    question_name=question_name,
                    question=question_text,
                    question_type=question_type,
                    choices=choices,
                    answer=answer,
                    user_answer=None,
                    score=None,
                )
                db.add(question_record)
                db.flush()
            if question_name in payload.answers:
                user_answer = payload.answers[question_name]
                parsed_user_answer = user_answer
                if question_type == "multi_select":
                    if isinstance(user_answer, str):
                        try:
                            parsed_user_answer = json.loads(user_answer)
                        except Exception:
                            parsed_user_answer = user_answer
                    elif not isinstance(user_answer, list):
                        parsed_user_answer = []
                    question_record.user_answer = json.dumps(parsed_user_answer) if parsed_user_answer else None
                else:
                    parsed_user_answer = str(user_answer) if user_answer else None
                    question_record.user_answer = parsed_user_answer
                if question_name and question_name.startswith("self_report"):
                    try:
                        user_answer_str = str(parsed_user_answer) if parsed_user_answer else ""
                        match = re.match(r"^(\d+)", user_answer_str.strip())
                        if match:
                            score_value = int(match.group(1))
                            question_record.score = float(score_value) if 1 <= score_value <= 5 else None
                        else:
                            question_record.score = None
                    except Exception:
                        question_record.score = None
                elif question_type == "multi_select" and answer:
                    try:
                        correct_answer = json.loads(answer) if isinstance(answer, str) else answer
                        if isinstance(correct_answer, list) and isinstance(parsed_user_answer, list):
                            if len(correct_answer) == len(parsed_user_answer):
                                matches = sum(1 for i in range(len(correct_answer)) if correct_answer[i] == parsed_user_answer[i])
                                question_record.score = float(matches) / len(correct_answer) if len(correct_answer) > 0 else 0.0
                            else:
                                question_record.score = None
                        else:
                            question_record.score = None
                    except Exception:
                        question_record.score = None
                elif question_type == "mcqa" and answer:
                    try:
                        correct_answer = int(answer) if isinstance(answer, (int, str)) and str(answer).isdigit() else None
                        user_answer_int = None
                        if isinstance(parsed_user_answer, str):
                            match = re.match(r"^(\d+)", parsed_user_answer.strip())
                            if match:
                                user_answer_int = int(match.group(1))
                        elif isinstance(parsed_user_answer, (int, float)):
                            user_answer_int = int(parsed_user_answer)
                        if correct_answer is not None and user_answer_int is not None:
                            question_record.score = 1.0 if correct_answer == user_answer_int else 0.0
                        else:
                            question_record.score = None
                    except Exception:
                        question_record.score = None
            saved_questions.append({
                "id": question_record.id,
                "question_name": question_record.question_name,
                "question": question_record.question,
                "question_type": question_record.question_type,
                "user_answer": question_record.user_answer,
                "score": question_record.score,
            })
        db.commit()
        return {"success": True, "questions": saved_questions, "count": len(saved_questions)}
    except Exception as e:
        db.rollback()
        print(f"Error saving tutorial submission questions: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to save tutorial submission questions"},
        )
