import os
import json
import time
from typing import List, Optional, Dict, Any, Literal, Generator
from openai import OpenAI
from pydantic import BaseModel
from difflib import unified_diff

# --------------------
# Pydantic Schemas
# --------------------

class RestateModel(BaseModel):
    restate: str

class StepsModel(BaseModel):
    steps: List[str]

class PlanOneModel(BaseModel):
    signpost: str
    target_files: List[Literal["html", "css", "js"]]

class ExecuteModel(BaseModel):
    html: str
    css: str
    js: str

class SummaryModel(BaseModel):
    summary: str

class SuggestionsModel(BaseModel):
    suggestions: List[str]

class OpenAIAgent:
    """AI Agent for interactive coding assistance."""
    
    def __init__(self, model_name: str = "gpt-4o", client: Optional[OpenAI] = None):
        self.client = client if client else OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model_name = model_name
        self.max_tokens = 32768
        self.temperature = 0.3
        self.seed = 42
        self.trace_messages: List[Dict[str, Any]] = []
        
        # Core system guidance
        self.AGENT_SYSTEM = (
            "You are a Cursor-like coding copilot. You think before acting, plan then execute, "
            "and keep a full running trace for yourself by appending your own outputs as assistant messages. "
            "When asked for JSON, output exactly one valid JSON object with the requested keys, no markdown, no prose, no code fences. "
            "Never include explanations outside JSON when JSON is requested. Be concise and high-signal. "
            "Follow these invariants: preserve file formatting/indentation; make idempotent edits; keep reasoning terse; "
            "separate planning from editing; and prefer minimal diffs to achieve goals. "
            "For descriptions, use an enthusiastic, conversational, and friendly tone to encourage the user. "
        )
        
        # Step-specific system prompts
        self.SYSTEM_RESTATE = (
            "Task: In a single brief sentence, restate the user's intent succinctly. You should say 'The user...' when describing the user's request, and use 'I' when describing actions that you want to perform. "
            "Output JSON: {\"restate\": string}."
        )
        self.SYSTEM_STEPS = (
            "Task: Plan. Generate the smallest possible sequence of concrete steps that can achieve the goal by the user's query. To make the overall plan shorter, feel free to combine multiple steps into one when relevant (e.g. 'Draft the initial HTML page' versus 'Make an HTML header' -> 'Make an HTML body' -> 'Make an HTML footer'). Each step should read as a single-sentence command that outlines exactly what components, scripts, or styles the system should add or modify. "
            "Output JSON: {\"steps\": [string, ...]}"
        )
        self.SYSTEM_PLAN_ONE = (
            "Task: For the current step, describe the exact changes you'll make to which file(s). This should be written in first person and describe very briefly what you're about to do. This can be extremely concise since the user already sees the entire plan (e.g. 'Now I'll change the .check-icon height'); this signpost should be less than ten words. Also return the files that you need to modify in order to achieve this. \n"
            "Output JSON: {\"signpost\": string, \"target_files\": [\"html\", \"css\", \"js\"]}"
        )
        self.SYSTEM_EXECUTE = (
            "Task: Apply the current step to the provided files. You will receive 'target_files' indicating which files need changes. For files in target_files, return the complete modified content. For files NOT in target_files, return an empty string. The edits should be minimal diffs, changing absolutely as little as possible to achieve the user's goal. Do not modify more than what you need to.\n"
            "Output JSON: {\"html\": string (complete HTML or empty), \"css\": string (complete CSS or empty), \"js\": string (complete JS or empty)}"
        )
        self.SYSTEM_SUMMARY = (
            "Task: Give a one-sentence summary of the changes that you made. If there was something you were unable to do, tell the user. Use first-person and be succinct. \n"
            "Output JSON: {\"summary\": string}"
        )
        self.SYSTEM_SUGGESTIONS = (
            "Task: Based on the work completed and the current state of the files, generate three concrete, actionable suggestions for what could be done next. These should be follow-up actions that would enhance or improve the website. Be specific and consider actions like: adding features, improving design, enhancing functionality, fixing edge cases, or adding polish. Be extremely creative and diverse. They should be very concise, no more than ten words each.\n"
            "Output JSON: {\"suggestions\": [string, ...]}"
        )
    
    def _append(self, role: str, content: str) -> None:
        """Append message to trace."""
        self.trace_messages.append({"role": role, "content": content})
    
    def _call_openai_json(self, messages: List[Dict[str, Any]], *, max_attempts: int = 3, schema: Optional[Any] = None, schema_name: Optional[str] = None) -> str:
        """Call OpenAI with JSON constraint; retry on errors."""
        last_err = None
        for attempt in range(1, max_attempts + 1):
            try:
                if schema is not None:
                    try:
                        if isinstance(schema, type) and issubclass(schema, BaseModel):
                            schema_dict = schema.model_json_schema() if hasattr(schema, 'model_json_schema') else schema.schema()
                        else:
                            schema_dict = schema
                    except Exception:
                        schema_dict = schema
                    
                    response = self.client.chat.completions.create(
                        model=self.model_name,
                        messages=messages,
                        max_tokens=self.max_tokens,
                        temperature=self.temperature,
                        seed=self.seed,
                        response_format={
                            "type": "json_schema",
                            "json_schema": {
                                "name": schema_name or "schema",
                                "schema": schema_dict,
                                "strict": True,
                            },
                        },
                    )
                else:
                    response = self.client.chat.completions.create(
                        model=self.model_name,
                        messages=messages,
                        max_tokens=self.max_tokens,
                        temperature=self.temperature,
                        seed=self.seed,
                        response_format={"type": "json_object"},
                    )
                return response.choices[0].message.content.strip()
            except Exception as e:
                last_err = e
                if attempt == max_attempts:
                    break
                time.sleep(0.7)
        
        # Fallback without response_format
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            seed=self.seed,
        )
        return response.choices[0].message.content.strip()
    
    def _json_with_retry(self, system_prompt: str, user_payload: Dict[str, Any], required_keys: List[str], *, max_attempts: int = 4, schema: Optional[Any] = None, schema_name: Optional[str] = None) -> Dict[str, Any]:
        """Enforce strict JSON parsing with repair prompts."""
        self._append("system", system_prompt)
        self._append("user", json.dumps(user_payload))
        
        for attempt in range(1, max_attempts + 1):
            text = self._call_openai_json(self.trace_messages, max_attempts=2, schema=schema, schema_name=schema_name)
            try:
                data = json.loads(text)
            except Exception as e:
                if attempt == max_attempts:
                    raise
                self._append(
                    "user",
                    json.dumps({
                        "error": f"Invalid JSON on attempt {attempt}: {str(e)}",
                        "instruction": "Re-output a single valid JSON object only, matching the required keys.",
                        "required_keys": required_keys,
                    })
                )
                continue
            
            missing = [k for k in required_keys if k not in data]
            if missing:
                if attempt == max_attempts:
                    raise ValueError(f"JSON missing required keys after {attempt} attempts: {missing}")
                self._append(
                    "user",
                    json.dumps({
                        "error": f"Missing keys: {missing}",
                        "instruction": "Return JSON including ALL required keys exactly.",
                        "required_keys": required_keys,
                    })
                )
                continue
            
            return data
        
        raise RuntimeError("JSON retry loop exhausted unexpectedly")
    
    # states
    # 1) send a chat message
    # 2) send a file to edit
    # 3) send the result of a finished file edit
    # 4) send a summary of the changes
    # 5) send a list of suggestions for what to do next

    def agent_workflow_stream(self, prompt: str, files: dict) -> Generator[Dict[str, Any], None, None]:
        """Stream agent workflow state transitions for incremental UI updates."""

        print(f"\n🤖 Agent workflow started: {prompt[:60]}...")

        # Reset trace for this run
        self.trace_messages = []
        self._append("system", self.AGENT_SYSTEM)

        initial_payload = {
            "task": prompt,
            "files": {
                "html": files.get("html", ""),
                "css": files.get("css", ""),
                "js": files.get("js", ""),
            },
        }
        self._append("user", json.dumps(initial_payload))

        # 1) Restate query
        print("📝 Step 1/5: Restating query...")
        restate_json = self._json_with_retry(
            self.SYSTEM_RESTATE,
            {"task": prompt},
            required_keys=["restate"],
            schema=RestateModel,
            schema_name="restatement",
        )
        restate_text = restate_json.get("restate", "")
        yield {"state": "restate", "data": {"restate": restate_text}}

        # 2) Generate steps
        steps_json = self._json_with_retry(
            self.SYSTEM_STEPS,
            {
                "task": prompt,
                "constraints": [
                    "Preserve formatting/indentation",
                    "Minimal necessary changes",
                    "Produce runnable code",
                ],
            },
            required_keys=["steps"],
            schema=StepsModel,
            schema_name="plan_steps",
        )
        steps = steps_json.get("steps", []) or []
        print(f"✅ Restated: {restate_text[:80]}...")
        print(f"📋 Step 2/5: Generating {len(steps)} steps...")
        yield {"state": "plan", "data": {"steps": steps}}

        # 3) For each step: plan and execute
        print(f"⚙️  Step 3/5: Executing {len(steps)} steps...")
        current_files = {
            "html": files.get("html", ""),
            "css": files.get("css", ""),
            "js": files.get("js", ""),
        }
        per_step: List[Dict[str, Any]] = []

        for idx, step in enumerate(steps, start=1):
            print(f"  → Step {idx}/{len(steps)}: {step[:50]}...")
            plan_json = self._json_with_retry(
                self.SYSTEM_PLAN_ONE,
                {
                    "task": prompt,
                    "all_steps": steps,
                    "current_step_index": idx,
                    "current_step": step,
                    "files": current_files,
                },
                required_keys=["signpost", "target_files"],
                schema=PlanOneModel,
                schema_name="plan_one_step",
            )

            target_files = plan_json.get("target_files", [])
            signpost_text = plan_json.get("signpost", "")
            yield {
                "state": "signpost",
                "data": {
                    "index": idx,
                    "total": len(steps),
                    "step": step,
                    "signpost": signpost_text,
                    "target_files": target_files,
                },
            }

            before_files = {
                k: current_files.get(k, "")
                for k in target_files
            }

            exec_json = self._json_with_retry(
                self.SYSTEM_EXECUTE,
                {
                    "task": prompt,
                    "all_steps": steps,
                    "current_step_index": idx,
                    "current_step": step,
                    "plan": plan_json.get("signpost", ""),
                    "target_files": plan_json.get("target_files", []),
                    "files": current_files,
                },
                required_keys=["html", "css", "js"],
                schema=ExecuteModel,
                schema_name="execute_step",
            )

            updated_files = exec_json
            diff_stats: Dict[str, Dict[str, int]] = {}

            for k in ("html", "css", "js"):
                if (
                    k in target_files
                    and isinstance(updated_files.get(k), str)
                    and updated_files[k]
                ):
                    prev = before_files.get(k, "")
                    new_content = updated_files[k]
                    additions = deletions = 0
                    try:
                        prev_lines = prev.splitlines()
                        new_lines = new_content.splitlines()
                        for line in unified_diff(prev_lines, new_lines, lineterm=""):
                            if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
                                continue
                            if line.startswith("+"):
                                additions += 1
                            elif line.startswith("-"):
                                deletions += 1
                    except Exception:
                        additions = deletions = 0

                    diff_stats[k] = {
                        "additions": additions,
                        "deletions": deletions,
                    }

                    current_files[k] = updated_files[k]

            updated_file_payload = {
                k: updated_files[k]
                for k in ("html", "css", "js")
                if k in target_files and updated_files.get(k)
            }

            per_step.append(
                {
                    "step": step,
                    "plan": plan_json.get("signpost", ""),
                    "target_files": target_files,
                    "updated_files": updated_file_payload,
                    "diff_stats": diff_stats,
                }
            )

            yield {
                "state": "tool_result",
                "data": {
                    "index": idx,
                    "total": len(steps),
                    "target_files": target_files,
                    "diff_stats": diff_stats,
                },
            }

            updated_count = sum(
                1
                for k in ("html", "css", "js")
                if k in target_files and updated_files.get(k)
            )
            print(f"    ✓ Updated {updated_count} file(s)")

        # 4) Summarize
        print("📊 Step 4/5: Summarizing changes...")
        summary_json = self._json_with_retry(
            self.SYSTEM_SUMMARY,
            {
                "task": prompt,
                "final_files": current_files,
                "steps": steps,
                "per_step": per_step,
                "restate": restate_text,
            },
            required_keys=["summary"],
            schema=SummaryModel,
            schema_name="summary",
        )
        summary_text = summary_json.get("summary", "")
        print(f"✅ Summary: {summary_text[:80]}...")
        yield {"state": "summary", "data": {"summary": summary_text}}

        # 5) Generate follow-up suggestions
        print("💡 Step 5/5: Generating suggestions...")
        suggestions_json = self._json_with_retry(
            self.SYSTEM_SUGGESTIONS,
            {
                "task": prompt,
                "final_files": current_files,
                "steps": steps,
                "per_step": per_step,
                "summary": summary_text,
                "original_query": restate_text,
            },
            required_keys=["suggestions"],
            schema=SuggestionsModel,
            schema_name="suggestions",
        )
        suggestions = suggestions_json.get("suggestions", [])
        cleaned_suggestions = []
        seen = set()
        for suggestion in suggestions:
            if not isinstance(suggestion, str):
                continue
            text = suggestion.replace('.', '').strip()
            if not text:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned_suggestions.append(text)
        suggestions = sorted(cleaned_suggestions, key=lambda s: s.casefold())
        print(f"✅ Generated {len(suggestions)} suggestions")
        yield {"state": "suggestions", "data": {"suggestions": suggestions}}

        final_payload = {
            "restate": restate_text,
            "steps": steps,
            "per_step": per_step,
            "final_files": current_files,
            "summary": summary_text,
            "suggestions": suggestions,
        }

        print("🎉 Agent workflow complete!\n")
        yield {"state": "complete", "data": final_payload}

    def agent_workflow(self, prompt: str, files: dict) -> Dict[str, Any]:
        """Main agentic workflow returning structured output."""
        final_payload: Optional[Dict[str, Any]] = None

        for chunk in self.agent_workflow_stream(prompt, files):
            if chunk.get("state") == "complete":
                final_payload = chunk.get("data", {})

        if final_payload is None:
            raise RuntimeError("Agent workflow stream did not produce a final payload.")

        return final_payload
    
    def parse_files(self, files: Dict[str, str]) -> str:
        """Combine html, css, and js into a single renderable HTML page."""
        html = files.get('html', '').strip()
        css = files.get('css', '').strip()
        js = files.get('js', '').strip()
        
        if '<html' in html or '<body' in html or '<!DOCTYPE' in html:
            import re
            body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
            if body_match:
                html = body_match.group(1)
        
        result = '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
        result += '    <meta charset="UTF-8">\n'
        result += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        result += '    <title>Page</title>\n'
        
        if css:
            result += '    <style>\n'
            for line in css.split('\n'):
                result += f'        {line}\n'
            result += '    </style>\n'
        
        result += '</head>\n<body>\n'
        
        if html:
            result += f'{html}\n'
        
        if js:
            result += '    <script>\n'
            for line in js.split('\n'):
                result += f'        {line}\n'
            result += '    </script>\n'
        
        result += '</body>\n</html>'
        return result

