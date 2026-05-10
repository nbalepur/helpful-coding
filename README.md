# <img src="interface/public/toast.png" alt="VibeJam" width="28" height="28" /> Welcome to VibeJam!

[![License: CC0 1.0](https://img.shields.io/badge/License-CC0%201.0-lightgrey.svg)](http://creativecommons.org/publicdomain/zero/1.0/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com/)

VibeJam is a platform for running user studies on agentic coding with zero local setup for participants.

Participants code in-browser with an AI assistant (web tasks or function tasks), and VibeJam logs rich human-AI interaction data for research.

---

## At a glance

- **Runs in browser:** no local IDE or install required for participants.
- **Built for research:** logs traces, accept/reject decisions, submissions, and follow-up answers.
- **Two task families:** website-building tasks and LeetCode-style function tasks.
- **Turnkey auth/onboarding:** signup, consent, password reset, autosave, tutorial flow.
- **Annotator support:** restricted users can review submissions and run hidden tests.

---

## 🎬 Video demo

[![Watch the VibeJam tutorial](https://img.youtube.com/vi/eJ2dppIxG60/maxresdefault.jpg)](https://www.youtube.com/watch?v=HQD2FS-qJ44)

*(Click the thumbnail to open YouTube. The same video also appears in-app under **Instructions**.)*

---

## 📑 Table of contents

- [Quick start](#quick-start)
- [Detailed features](#detailed-features)
- [Repository structure](#repository-structure)
- [Database](#database)
- [Customization](#customization)
- [Limitations](#limitations)
- [Citation](#citation)
- [License](#license)

---

## 🛠️ Quick start

### 1) Clone and install

```bash
git clone https://github.com/nbalepur/vibe-jam
cd vibe-jam
./scripts/setup.sh
```

`setup.sh` checks Python/Node/npm, creates a `helpful-coding` conda env (or uses venv), installs dependencies, and prompts for `.env` if missing.

### 2) Configure environment

```bash
cp example.env .env
# Edit .env: OPENAI_API_KEY, SECRET_KEY, DATABASE_URL, etc.
```

Optional manual sync for frontend env vars:

```bash
cd interface
npm run sync-env
cd ..
```

### 3) Create database + load tasks

```bash
cd database
./scripts/create.sh
./scripts/load.sh
cd ..
```

If you do not use a merged `data/tasks.json`:

```bash
./scripts/load.sh --reset --tasks-path ../data/web_tasks.json
./scripts/load.sh --tasks-path ../data/function_tasks.json
```

### 4) Start app

```bash
./scripts/start-all.sh
```

Or run services separately:

- `./scripts/start-backend.sh`
- `./scripts/start-frontend.sh`

Defaults:

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:4828
- **Health:** http://localhost:4828/health

### Environment variable groups

| Group | Key variables |
|---|---|
| **Required** | `OPENAI_API_KEY`, `SECRET_KEY`, `DATABASE_URL` (and `ASYNC_DATABASE_URL` for Postgres). |
| **URLs** | `BACKEND_URL`, `NEXT_PUBLIC_BACKEND_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_FRONTEND_URL`. |
| **Contact** | `FROM_CONTACT_EMAIL`, `FROM_CONTACT_NAME`. |
| **Execution/agent** | `RAPIDAPI_KEY` or `USE_LOCAL_EXECUTION`; `AIDER_MODEL`, `SUMMARY_MODEL`, `PLAN_MODEL`, `CHATBOT_MODEL`, `AIDER_MAX_INSTANCES`, `AIDER_IDLE_TIMEOUT`, `NEXT_PUBLIC_GIVE_UP_SECONDS`. |
| **Email/reset** | `BREVO_API_KEY`, `RESET_LINK_BASE_URL`. |

See `example.env` for complete documentation and optional values.

---

## 📖 Detailed features

### Platform architecture

- **Frontend:** Next.js app for browsing tasks, coding, preview/testing, chat, and submit flow.
- **Backend:** FastAPI routes for agent runs, code execution, auth, tasks, and submissions.
- **Storage:** PostgreSQL in production (SQLite supported for local dev).
- **Task source:** JSON task files loaded into DB, so task updates do not require frontend redeploys.

### Task types

- **Website tasks**
  - Participants edit `index.html`, `styles.css`, and `frontend.js`.
  - Live preview appears in the in-browser "My Preview" tab.
  - Task schema includes `name`, `title`, HTML `description`, `label`, examples, and starter files.

- **Function tasks**
  - Participants edit a Python `solution.py` and run tests.
  - Execution uses OneCompiler (RapidAPI) or optional local mode for development.
  - Supports public vs private tests using `is_public` on each test case.
  - Supports pass-all gating or timed "give up" (`NEXT_PUBLIC_GIVE_UP_SECONDS`).

- **Tutorials**
  - Includes separate web and function tutorials with dedicated onboarding content.
  - Web tutorial uses fixed frontend-defined submission questions.

### AI assistant behavior

The in-task assistant exposes three modes in a dropdown next to **AI Assistant**:

- **`agent`** — The only mode powered by [Aider](https://github.com/Aider-AI/aider). The backend builds a temporary workspace from the current files, Aider proposes edits and streams progress, and the backend parses and applies those edits in memory while streaming updates to the UI.
- **`chat`** — A direct LLM call with a chat system prompt. It answers questions about the task and code **without** editing files.
- **`plan`** — A direct LLM call with a planning system prompt. It produces a plan the participant can follow or turn into edits themselves; it does not modify files.

Requests to `/api/agent-execution/stream` carry `taskType`, and the backend routes to `execute_agent`, `execute_chat`, or `execute_plan` accordingly.

After **`agent`** runs, website tasks can show a short summary plus follow-up suggestions; function tasks can skip suggestions and show summary only. Model and concurrency settings are env-driven (`AIDER_MODEL`, `SUMMARY_MODEL`, `PLAN_MODEL`, `CHATBOT_MODEL`, `AIDER_MAX_INSTANCES`, `AIDER_IDLE_TIMEOUT`, etc.); `example.env` uses `gpt-4.1-2025-04-14` for the model keys there.

### Security and sandboxing

- **Function tasks:** OneCompiler runs code off-host. Local execution (`USE_LOCAL_EXECUTION`) is intended for development only.
- **Website tasks:** preview is isolated in a sandboxed iframe with CSP and JS sanitization (`window.parent` / `window.top` stripping).
- **Caveat:** HTML/CSS sanitization is minimal; sandbox + CSP are the primary controls.

### Submissions, questions, and ratings

- On submit, participants provide title + description, and code is saved.
- For website tasks, backend can generate code-aware follow-up questions (MCQ, multi-select, free response).
- Tutorial question set is fixed in `interface/app/constants/tutorialSubmissionQuestions.ts`.
- Optional peer rating is configurable via `interface/app/constants/submissionRatingCriteria.ts`.
- Annotator access can be enabled per user (`can_view_submissions=true`) to view submissions and hidden tests.

### Instructions and consent

- About page content comes from `public/instruction_assets/user_instructions.md`.
- Supports compensation info, contact info, and optional IRB consent form embedding.
- Contact values come from env: `FROM_CONTACT_EMAIL`, `FROM_CONTACT_NAME`.

---

## 📁 Repository structure

```text
├── backend/
│   ├── agent/                 # Aider integration, summaries, suggestion generation
│   ├── code_execution/        # OneCompiler, local runner, endpoint runner
│   ├── routers/               # auth, tasks, submissions, submission_questions, code, execution, users
│   ├── utils/                 # Auth helpers, task helpers
│   └── main.py
├── database/
│   ├── config.py              # DB URL + engine config
│   ├── sqlalchemy_models.py   # ORM models
│   ├── crud.py
│   ├── load_tasks.py
│   └── scripts/               # create.sh, load.sh, reset.sh, download.sh
├── interface/
│   ├── app/
│   │   ├── api/               # Next.js API routes
│   │   ├── browse/            # Task browser page
│   │   ├── vibe/              # In-task coding page
│   │   ├── components/
│   │   ├── constants/
│   │   ├── hooks/
│   │   └── utils/
│   └── public/                # instructions, assets, tutorial video, toast icon
├── data/
│   ├── web_tasks.json
│   ├── function_tasks.json
│   ├── web_tutorial.json
│   ├── function_tutorial.json
│   └── blank_site/
├── scripts/
│   ├── setup.sh
│   ├── start-all.sh
│   ├── start-backend.sh
│   ├── start-frontend.sh
│   └── sync-env.js
└── example.env
```

---

## 🗄️ Database

VibeJam uses PostgreSQL in production and SQLite for local development. Config is in `database/config.py`, and connection strings come from `.env`.

### Core tables

| Table | Purpose |
|---|---|
| `users` | Account, auth, permissions (`can_view_submissions`), settings JSON. |
| `projects` | Task definitions (`name`, `title`, `label`, files, examples, tests). |
| `code_logs` | Autosaved code snapshots + metadata. |
| `submissions` | Final submitted code + title/description/image. |
| `submission_feedback` | Ratings and review metadata for submissions. |
| `ai_suggestions` | User decisions on AI suggestions (accept/reject). |
| `ai_trace_logs` | Full agent trace per chat turn + summary/suggestions. |
| `submission_questions` | Post-submit questions and user answers. |
| `password_reset_tokens` | Expiring one-time password reset tokens. |

`projects` is the central task entity linked to behavioral data via logs, submissions, and traces.

### Database scripts

- `database/scripts/create.sh`: create tables (`Base.metadata.create_all`).
- `database/scripts/load.sh`: load/update tasks from JSON.
- `database/scripts/reset.sh`: drop + recreate all tables (destructive).
- `database/scripts/download.sh`: export/inspect data.

---

## ⚙️ Customization

### Tasks

- Edit task JSON in `data/web_tasks.json`, `data/function_tasks.json`, or merged `data/tasks.json`.
- Reload with `database/scripts/load.sh` (`--reset` to replace everything).
- Website tasks are typically labeled `open-ended`/`replication`; function tasks use `write_function`/`debug_function`.
- Add new labels in `interface/app/utils/taskLabels.ts`.

### Agent

- Summary/suggestion prompts: `backend/agent/generation.py`.
- Suggestion triggering behavior: `backend/agent/helpers.py`.
- Model/timeouts/concurrency: `backend/agent/instances.py` + related env vars.
- API surface: `backend/agent/api.py`.

### Submission questions and ratings

- Tutorial question set: `interface/app/constants/tutorialSubmissionQuestions.ts`.
- Self-report + code-generated questions: `backend/routers/submission_questions.py`.
- Rating dimensions + scales: `interface/app/constants/submissionRatingCriteria.ts`.

---

## ⚠️ Limitations

- Website tasks are static frontend-only (no participant backend server).
- External asset loading (CDNs/URLs) is constrained in preview sandbox.
- Participants cannot create arbitrary new files during tasks.
- Repo-level tasks (SWE-bench style, multi-file patching across repos) are not yet supported.
- Security model depends on iframe sandboxing (web tasks) and remote execution (function tasks).

---

## 📝 Citation

If you use VibeJam in research, please cite:

```bibtex
@software{balepur2026vibejam,
  author = {Nishant Balepur and Connor Baumler and Valerie Chen and Eunsol Choi and Rachel Rudinger and Jordan Lee Boyd-Graber},
  title = {VibeJam: An Open Platform for User Studies on Agentic Vibe Coding},
  year = {2026},
  publisher = {GitHub},
  url = {https://github.com/nbalepur/vibe-jam},
}
```

---

## 📄 License

See [LICENSE](LICENSE).

---

**Thanks for checking out VibeJam and happy vibe-coding! 🍞🪼🧑‍💻🎉**
