"""
Submissions API: create/list submissions, moderation, feedback.
"""
import json
import os
import re
from collections import defaultdict
from datetime import datetime
from typing import Optional, List, Dict, Any

import openai
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from sqlalchemy.orm import aliased

from database.config import get_db
from database.sqlalchemy_models import User, Project, Submission, SubmissionFeedback
from database.models import (
    SubmissionCreate,
    SubmissionFeedbackCreate,
    SubmissionFeedback as SubmissionFeedbackModel,
    ModerationCheckRequest,
    SubmissionRequest,
    SubmissionFeedbackRequest,
)
from database.crud import SubmissionCRUD, SubmissionFeedbackCRUD

from utils.task_helpers import (
    resolve_project_from_task_id,
    build_rating_summary,
)

router = APIRouter(prefix="/api", tags=["Submissions"])


@router.post("/submissions/check-moderation")
async def check_moderation(payload: ModerationCheckRequest):
    """Check if project title, description, and image are appropriate using OpenAI moderation API."""
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return JSONResponse(
                status_code=500,
                content={"error": "OpenAI API key not configured", "is_appropriate": False},
            )
        client = openai.OpenAI(api_key=api_key)
        moderation_inputs = []
        if payload.title:
            moderation_inputs.append({"type": "text", "text": payload.title})
        if payload.description:
            moderation_inputs.append({"type": "text", "text": payload.description})
        if payload.image:
            image_url = payload.image
            if not image_url.startswith("http://") and not image_url.startswith("https://"):
                if not image_url.startswith("data:"):
                    image_url = f"data:image/png;base64,{image_url}"
            moderation_inputs.append({"type": "image_url", "image_url": {"url": image_url}})
        if not moderation_inputs:
            return JSONResponse(
                status_code=400,
                content={"error": "No content provided for moderation", "is_appropriate": False},
            )
        try:
            response = client.moderations.create(
                model="omni-moderation-latest",
                input=moderation_inputs,
            )
            is_appropriate = True
            if hasattr(response, "results") and response.results:
                for result in response.results:
                    if hasattr(result, "flagged") and result.flagged:
                        is_appropriate = False
                        break
            return {"is_appropriate": is_appropriate, "error": None}
        except Exception as api_error:
            print(f"Error calling OpenAI moderation API: {api_error}")
            return JSONResponse(
                status_code=500,
                content={"error": f"Moderation API error: {str(api_error)}", "is_appropriate": False},
            )
    except Exception as e:
        print(f"Error in moderation check: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to check moderation: {str(e)}", "is_appropriate": False},
        )


@router.post("/submissions")
async def create_submission(payload: SubmissionRequest, db: Session = Depends(get_db)):
    try:
        from database.sqlalchemy_models import SubmissionQuestion

        user = db.query(User).filter(User.id == payload.user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        project = None
        if payload.task_id:
            project = resolve_project_from_task_id(db, payload.task_id)
        if project is None and payload.project_id is not None:
            project = db.query(Project).filter(Project.id == payload.project_id).first()

        if project is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})

        code_payload = {}
        for key, value in (payload.code or {}).items():
            try:
                code_payload[str(key)] = "" if value is None else str(value)
            except Exception:
                code_payload[str(key)] = ""

        if not code_payload:
            return JSONResponse(status_code=400, content={"error": "Submission code payload cannot be empty"})

        submission_create = SubmissionCreate(
            user_id=user.id,
            project_id=project.id,
            code=code_payload,
            title=payload.title.strip(),
            description=(payload.description or "").strip() or None,
            image=payload.image,
        )
        submission_record = SubmissionCRUD.create(db, submission_create)

        if payload.submission_answers:
            for question_name, user_answer in payload.submission_answers.items():
                question = db.query(SubmissionQuestion).filter(
                    SubmissionQuestion.user_id == payload.user_id,
                    SubmissionQuestion.project_id == project.id,
                    SubmissionQuestion.question_name == question_name,
                ).order_by(SubmissionQuestion.created_at.desc()).first()

                if question:
                    parsed_user_answer = user_answer
                    if question.question_type == "multi_select":
                        if isinstance(user_answer, str):
                            try:
                                parsed_user_answer = json.loads(user_answer)
                            except Exception:
                                parsed_user_answer = user_answer
                        elif not isinstance(user_answer, list):
                            parsed_user_answer = []
                    else:
                        parsed_user_answer = str(user_answer) if user_answer else None

                    question.user_answer = parsed_user_answer

                    if question_name and question_name.startswith("self_report"):
                        try:
                            user_answer_str = str(parsed_user_answer) if parsed_user_answer else ""
                            match = re.match(r"^(\d+)", user_answer_str.strip())
                            if match:
                                score_value = int(match.group(1))
                                if 1 <= score_value <= 5:
                                    question.score = float(score_value)
                                else:
                                    question.score = None
                            else:
                                question.score = None
                        except Exception:
                            question.score = None

                    elif question.question_type == "multi_select" and question.answer is not None:
                        try:
                            correct_answers = question.answer
                            if isinstance(correct_answers, str):
                                if correct_answers.strip().startswith("{") and correct_answers.strip().endswith("}"):
                                    array_str = correct_answers.strip()[1:-1]
                                    correct_answers = [int(x.strip()) for x in array_str.split(",") if x.strip()]
                                else:
                                    correct_answers = json.loads(correct_answers)
                            if not isinstance(correct_answers, list):
                                correct_answers = []
                            user_selected = parsed_user_answer if isinstance(parsed_user_answer, list) else []
                            if len(correct_answers) == len(user_selected) and len(correct_answers) > 0:
                                matches = sum(1 for i in range(len(correct_answers)) if correct_answers[i] == user_selected[i])
                                question.score = matches / len(correct_answers)
                            else:
                                question.score = 0.0
                        except Exception:
                            question.score = None

                    elif question.question_type == "mcqa" and question.answer is not None:
                        try:
                            correct_answer = question.answer
                            if isinstance(correct_answer, str):
                                correct_answer = int(correct_answer.strip())
                            elif not isinstance(correct_answer, (int, float)):
                                correct_answer = None
                            if correct_answer is not None:
                                user_answer_str = str(parsed_user_answer) if parsed_user_answer else ""
                                match = re.match(r"^(\d+)", user_answer_str.strip())
                                if match:
                                    user_answer_idx = int(match.group(1))
                                    question.score = 1.0 if user_answer_idx == correct_answer else 0.0
                                else:
                                    question.score = None
                            else:
                                question.score = None
                        except Exception:
                            question.score = None

                    db.flush()

            db.commit()

        return {"success": True, "submissionId": submission_record.id}
    except Exception as e:
        print(f"Error creating submission: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to create submission"})


@router.get("/submissions")
async def list_submissions(
    project_id: Optional[int] = Query(default=None, alias="projectId"),
    task_id: Optional[str] = Query(default=None, alias="taskId"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    voter_id: Optional[int] = Query(default=None, alias="voterId"),
    filter_unseen: Optional[str] = Query(default=None, alias="filterUnseen"),
    filter_saved: Optional[str] = Query(default=None, alias="filterSaved"),
    filter_not_reported: Optional[str] = Query(default=None, alias="filterNotReported"),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(Submission)
        project = None
        if task_id:
            project = resolve_project_from_task_id(db, task_id)
        elif project_id is not None:
            project = db.query(Project).filter(Project.id == project_id).first()

        if project:
            query = query.filter(Submission.project_id == project.id)
        elif project_id is not None:
            query = query.filter(Submission.project_id == project_id)

        filter_unseen_bool = filter_unseen is not None and str(filter_unseen).lower() == "true"
        filter_saved_bool = filter_saved is not None and str(filter_saved).lower() == "true"
        filter_not_reported_bool = filter_not_reported is not None and str(filter_not_reported).lower() == "true"

        if voter_id is not None and (filter_unseen_bool or filter_saved_bool or filter_not_reported_bool):
            feedback_alias = aliased(SubmissionFeedback)
            most_recent_time_subq = (
                db.query(
                    SubmissionFeedback.submission_id,
                    func.max(SubmissionFeedback.created_at).label("max_created_at"),
                )
                .filter(SubmissionFeedback.voter_id == voter_id)
                .group_by(SubmissionFeedback.submission_id)
                .subquery()
            )
            most_recent_feedback_subq = (
                db.query(
                    feedback_alias.submission_id,
                    feedback_alias.is_saved,
                    feedback_alias.is_reported,
                )
                .join(
                    most_recent_time_subq,
                    (feedback_alias.submission_id == most_recent_time_subq.c.submission_id)
                    & (feedback_alias.created_at == most_recent_time_subq.c.max_created_at)
                    & (feedback_alias.voter_id == voter_id),
                )
                .subquery()
            )
            filter_conditions = []
            query = query.outerjoin(
                most_recent_feedback_subq,
                Submission.id == most_recent_feedback_subq.c.submission_id,
            )
            if filter_unseen_bool:
                filter_conditions.append(most_recent_feedback_subq.c.submission_id.is_(None))
            if filter_saved_bool:
                filter_conditions.append(most_recent_feedback_subq.c.is_saved == True)
            if filter_not_reported_bool:
                filter_conditions.append(
                    (most_recent_feedback_subq.c.submission_id.is_(None))
                    | (most_recent_feedback_subq.c.is_reported == False)
                )
            if filter_conditions:
                query = query.filter(and_(*filter_conditions))

        all_submissions = query.order_by(Submission.created_at.desc()).all()
        most_recent_by_user: Dict[int, Submission] = {}
        for submission in all_submissions:
            uid = submission.user_id
            if uid not in most_recent_by_user:
                most_recent_by_user[uid] = submission
            else:
                existing = most_recent_by_user[uid]
                if submission.created_at and existing.created_at and submission.created_at > existing.created_at:
                    most_recent_by_user[uid] = submission

        submissions = list(most_recent_by_user.values())
        min_date = datetime(1970, 1, 1)
        submissions.sort(key=lambda s: s.created_at if s.created_at else min_date, reverse=True)
        submissions = submissions[skip : skip + limit]

        submission_ids = [s.id for s in submissions]
        feedback_summaries: Dict[int, Dict[str, Any]] = {}
        if submission_ids:
            feedback_entries = (
                db.query(SubmissionFeedback)
                .filter(SubmissionFeedback.submission_id.in_(submission_ids))
                .order_by(SubmissionFeedback.created_at.desc())
                .all()
            )
            feedback_by_submission: Dict[int, List] = defaultdict(list)
            for entry in feedback_entries:
                feedback_by_submission[entry.submission_id].append(entry)
            for sid, entries in feedback_by_submission.items():
                feedback_summaries[sid] = build_rating_summary(entries)

        response = []
        for submission in submissions:
            rating_summary = feedback_summaries.get(submission.id, {"average": None, "count": 0, "perMetric": {}})
            response.append({
                "id": submission.id,
                "title": submission.title,
                "description": submission.description,
                "image": submission.image,
                "projectId": submission.project_id,
                "userId": submission.user_id,
                "createdAt": submission.created_at.isoformat() if submission.created_at else None,
                "updatedAt": submission.updated_at.isoformat() if submission.updated_at else None,
                "ratingSummary": rating_summary,
            })
        return {"items": response, "count": len(response), "hasMore": len(response) == limit}
    except Exception as e:
        print(f"Error listing submissions: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to list submissions"})


@router.get("/submissions/{submission_id}")
async def get_submission_detail(submission_id: int, db: Session = Depends(get_db)):
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return JSONResponse(status_code=404, content={"error": "Submission not found"})
        return {
            "id": submission.id,
            "title": submission.title,
            "description": submission.description,
            "image": submission.image,
            "projectId": submission.project_id,
            "userId": submission.user_id,
            "createdAt": submission.created_at.isoformat() if submission.created_at else None,
            "updatedAt": submission.updated_at.isoformat() if submission.updated_at else None,
            "code": submission.code or {},
            "ratingSummary": build_rating_summary(
                db.query(SubmissionFeedback)
                .filter(SubmissionFeedback.submission_id == submission_id)
                .order_by(SubmissionFeedback.created_at.desc())
                .all()
            ),
        }
    except Exception as e:
        print(f"Error fetching submission detail: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to fetch submission"})


@router.post("/submissions/{submission_id}/feedback")
async def submit_submission_feedback(
    submission_id: int,
    payload: SubmissionFeedbackRequest,
    db: Session = Depends(get_db),
):
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return JSONResponse(status_code=404, content={"error": "Submission not found"})
        normalized_scores = {}
        for key, value in (payload.scores or {}).items():
            try:
                numeric_value = int(value)
            except (TypeError, ValueError):
                numeric_value = 0
            normalized_scores[str(key)] = max(1, min(5, numeric_value))
        normalized_comment = (payload.comment or "").strip() or None
        normalized_report_type = (payload.report_type or "").strip() or None if payload.report_type else None
        normalized_report_rationale = (payload.report_rationale or "").strip() or None if payload.report_rationale else None
        feedback_create = SubmissionFeedbackCreate(
            submission_id=submission.id,
            project_id=submission.project_id,
            voter_id=payload.voter_id,
            scores=normalized_scores,
            comment=normalized_comment,
            is_saved=payload.is_saved if payload.is_saved is not None else False,
            is_reported=payload.is_reported if payload.is_reported is not None else False,
            report_type=normalized_report_type,
            report_rationale=normalized_report_rationale,
        )
        feedback_record = SubmissionFeedbackCRUD.create(db, feedback_create)
        return SubmissionFeedbackModel.from_orm(feedback_record)
    except Exception as e:
        print(f"Error submitting submission feedback: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to submit feedback"})


@router.get("/submissions/{submission_id}/feedback")
async def get_submission_feedback(
    submission_id: int,
    voter_id: Optional[int] = Query(default=None, alias="voterId"),
    db: Session = Depends(get_db),
):
    try:
        submission = db.query(Submission).filter(Submission.id == submission_id).first()
        if not submission:
            return JSONResponse(status_code=404, content={"error": "Submission not found"})
        if voter_id is not None:
            feedback = SubmissionFeedbackCRUD.get_by_submission_and_voter(db, submission_id, voter_id)
            if not feedback:
                return JSONResponse(status_code=404, content={"error": "Feedback not found"})
            return SubmissionFeedbackModel.from_orm(feedback)
        feedback_entries = (
            db.query(SubmissionFeedback)
            .filter(SubmissionFeedback.submission_id == submission_id)
            .order_by(SubmissionFeedback.created_at.desc())
            .all()
        )
        return [SubmissionFeedbackModel.from_orm(entry) for entry in feedback_entries]
    except Exception as e:
        print(f"Error fetching submission feedback: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to fetch feedback"})


@router.get("/users/{user_id}/submission-feedback")
async def list_user_submission_feedback(
    user_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        feedback_entries = SubmissionFeedbackCRUD.get_by_voter(db, user_id, skip=skip, limit=limit)
        return [SubmissionFeedbackModel.from_orm(entry) for entry in feedback_entries]
    except Exception as e:
        print(f"Error listing user submission feedback: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to list submission feedback"})


@router.get("/users/{user_id}/submissions")
async def list_user_submissions(
    user_id: int,
    project_id: Optional[int] = Query(default=None, alias="projectId"),
    db: Session = Depends(get_db),
):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        query = db.query(Submission).filter(Submission.user_id == user_id)
        if project_id is not None:
            query = query.filter(Submission.project_id == project_id)
        all_submissions = query.order_by(Submission.created_at.desc()).all()
        most_recent_by_project: Dict[int, Submission] = {}
        for submission in all_submissions:
            if submission.project_id not in most_recent_by_project:
                most_recent_by_project[submission.project_id] = submission
        response = []
        for submission in most_recent_by_project.values():
            feedback_entries = (
                db.query(SubmissionFeedback)
                .filter(SubmissionFeedback.submission_id == submission.id)
                .order_by(SubmissionFeedback.created_at.desc())
                .all()
            )
            rating_summary = build_rating_summary(feedback_entries)
            response.append({
                "id": submission.id,
                "title": submission.title,
                "description": submission.description,
                "image": submission.image,
                "projectId": submission.project_id,
                "userId": submission.user_id,
                "createdAt": submission.created_at.isoformat() if submission.created_at else None,
                "updatedAt": submission.updated_at.isoformat() if submission.updated_at else None,
                "code": submission.code or {},
                "ratingSummary": rating_summary,
            })
        response.sort(key=lambda x: x["createdAt"] or "", reverse=True)
        return {"items": response, "count": len(response)}
    except Exception as e:
        print(f"Error listing user submissions: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to list user submissions"})


@router.get("/users/{user_id}/submissions/check")
async def check_user_submission(
    user_id: int,
    project_id: Optional[int] = Query(default=None, alias="projectId"),
    task_id: Optional[str] = Query(default=None, alias="taskId"),
    db: Session = Depends(get_db),
):
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        project = None
        if task_id:
            project = resolve_project_from_task_id(db, task_id)
        elif project_id is not None:
            project = db.query(Project).filter(Project.id == project_id).first()
        if project is None:
            return JSONResponse(status_code=404, content={"error": "Project not found"})
        existing_submission = (
            db.query(Submission)
            .filter(
                Submission.user_id == user_id,
                Submission.project_id == project.id,
            )
            .order_by(Submission.created_at.desc())
            .first()
        )
        if existing_submission:
            return {
                "exists": True,
                "submission": {
                    "id": existing_submission.id,
                    "title": existing_submission.title,
                    "description": existing_submission.description,
                    "createdAt": existing_submission.created_at.isoformat() if existing_submission.created_at else None,
                },
            }
        return {"exists": False, "submission": None}
    except Exception as e:
        print(f"Error checking user submission: {e}")
        return JSONResponse(status_code=500, content={"error": "Failed to check user submission"})
