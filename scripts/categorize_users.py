#!/usr/bin/env python3
"""
Script to categorize users based on their study progress.

Categories:
- completed: completed the study (pre-test + 3 required tasks + post-test)
- three_tasks: has completed three required tasks, needs to do the post test
- two_tasks: has completed two required tasks, needs to do the 3rd + post test
- one_task: has completed one required task, needs to do the 2nd + 3rd + post test
- pre_test: has only done the pre-test
- not_started: hasn't started anything

Note: Only counts the post-test required tasks (connect_four, snake, platformer).
Other tasks and tutorial/playground tasks are excluded.

Usage:
    python scripts/categorize_users.py

The script will:
1. Connect to the database (using DATABASE_URL from backend/.env)
2. Categorize all users based on their progress
3. Print results to console
4. Export results to user_categorization.csv in the project root
"""

import sys
import os
from pathlib import Path
from collections import defaultdict

# Add the parent directory to the path so we can import from database
sys.path.append(str(Path(__file__).parent.parent))

from database import config, sqlalchemy_models
from database.sqlalchemy_models import (
    User, 
    Submission, 
    Project,
    SkillCheckAssignment,
    UserMCQASkillResponse,
    UserCodeSkillResponse,
    MCQAData,
    CodeData,
    ExperienceData,
    NasaTLIData
)
from sqlalchemy.orm import Session
from typing import Dict, List, Tuple, Optional

# Constants for skill check question IDs (matching backend/main.py)
SKILL_CHECK_QUESTION_IDS = {
    "pre_test": {
        "experience": list(range(1, 11)),  # IDs 1-10
        "frontend": list(range(119, 129)),  # IDs 119-128 (10 questions)
        "ux": list(range(1, 11)),        # IDs 1-10
    },
    "post_test": {
        "nasa_tli": list(range(1, 7)),    # IDs 1-6 (all nasa_tli questions)
        "frontend": list(range(129, 139)),  # IDs 129-138 (10 questions)
        "ux": list(range(11, 21)),        # IDs 11-20
    }
}


def get_all_users(db: Session) -> List[User]:
    """Get all users from the database."""
    return db.query(User).all()


def check_phase_completion(user_id: int, phase: str, assignment: Optional[SkillCheckAssignment], db: Session) -> bool:
    """
    Check if a user has completed all questions for a given phase.
    Simplified version that doesn't require importing from main.py.
    """
    if not assignment:
        return False
    
    config_key = "pre_test" if phase == "pre-test" else "post_test"
    question_ids_config = SKILL_CHECK_QUESTION_IDS[config_key]
    
    expected_question_ids = set()
    
    if phase == "pre-test":
        # Experience questions
        experience_questions = db.query(ExperienceData).filter(
            ExperienceData.id.in_(question_ids_config["experience"])
        ).all()
        for q in experience_questions:
            expected_question_ids.add(f"exp_{q.id}")
        
        # Frontend questions from assignment
        if assignment.frontend_pre_test:
            frontend_names = [name for name in assignment.frontend_pre_test if name]
            frontend_questions = db.query(MCQAData).filter(
                MCQAData.type == "frontend",
                MCQAData.name.in_(frontend_names)
            ).all() if frontend_names else []
            for q in frontend_questions:
                question_id = f"frontend_{q.name}" if q.name else f"frontend_{q.id}"
                expected_question_ids.add(question_id)
        
        # Sanity frontend if assigned to pre-test
        if assignment.sanity_frontend_phase == "pre-test":
            sanity_frontend_q = db.query(MCQAData).filter(
                MCQAData.type == "frontend",
                MCQAData.name == "sanity_frontend"
            ).first()
            if sanity_frontend_q:
                expected_question_ids.add("frontend_sanity_frontend")
        
        # UX questions from assignment
        if assignment.ux_pre_test:
            ux_names = [name for name in assignment.ux_pre_test if name]
            ux_questions = db.query(MCQAData).filter(
                MCQAData.type == "ux",
                MCQAData.name.in_(ux_names)
            ).all() if ux_names else []
            for q in ux_questions:
                question_id = f"ux_{q.name}" if q.name else f"ux_{q.id}"
                expected_question_ids.add(question_id)
        
        # Sanity UX if assigned to pre-test
        if assignment.sanity_ux_phase == "pre-test":
            sanity_ux_q = db.query(MCQAData).filter(
                MCQAData.type == "ux",
                MCQAData.name == "sanity_ux"
            ).first()
            if sanity_ux_q:
                expected_question_ids.add("ux_sanity_ux")
        
        # Code normal questions
        if assignment.code_pre_test:
            code_normal_names = [name for name in assignment.code_pre_test if name]
            code_questions = db.query(CodeData).filter(
                CodeData.task_name.in_(code_normal_names)
            ).all()
            for task_name in code_normal_names:
                if any(q.task_name == task_name for q in code_questions):
                    expected_question_ids.add(f"code_normal_{task_name}")
        
        # Code debug questions
        if assignment.debug_pre_test:
            code_debug_names = [name for name in assignment.debug_pre_test if name]
            code_questions = db.query(CodeData).filter(
                CodeData.task_name.in_(code_debug_names)
            ).all()
            for task_name in code_debug_names:
                if any(q.task_name == task_name for q in code_questions):
                    expected_question_ids.add(f"code_debug_{task_name}")
    
    else:  # post-test
        # NASA TLI questions
        nasa_questions = db.query(NasaTLIData).filter(
            NasaTLIData.id.in_(question_ids_config["nasa_tli"])
        ).all()
        for q in nasa_questions:
            expected_question_ids.add(f"nasa_{q.id}")
        
        # Frontend questions from assignment
        if assignment.frontend_post_test:
            frontend_names = [name for name in assignment.frontend_post_test if name]
            frontend_questions = db.query(MCQAData).filter(
                MCQAData.type == "frontend",
                MCQAData.name.in_(frontend_names)
            ).all() if frontend_names else []
            for q in frontend_questions:
                question_id = f"frontend_{q.name}" if q.name else f"frontend_{q.id}"
                expected_question_ids.add(question_id)
        
        # Sanity frontend if assigned to post-test
        if assignment.sanity_frontend_phase == "post-test":
            sanity_frontend_q = db.query(MCQAData).filter(
                MCQAData.type == "frontend",
                MCQAData.name == "sanity_frontend"
            ).first()
            if sanity_frontend_q:
                expected_question_ids.add("frontend_sanity_frontend")
        
        # UX questions from assignment
        if assignment.ux_post_test:
            ux_names = [name for name in assignment.ux_post_test if name]
            ux_questions = db.query(MCQAData).filter(
                MCQAData.type == "ux",
                MCQAData.name.in_(ux_names)
            ).all() if ux_names else []
            for q in ux_questions:
                question_id = f"ux_{q.name}" if q.name else f"ux_{q.id}"
                expected_question_ids.add(question_id)
        
        # Sanity UX if assigned to post-test
        if assignment.sanity_ux_phase == "post-test":
            sanity_ux_q = db.query(MCQAData).filter(
                MCQAData.type == "ux",
                MCQAData.name == "sanity_ux"
            ).first()
            if sanity_ux_q:
                expected_question_ids.add("ux_sanity_ux")
        
        # Code normal questions
        if assignment.code_post_test:
            code_normal_names = [name for name in assignment.code_post_test if name]
            code_questions = db.query(CodeData).filter(
                CodeData.task_name.in_(code_normal_names)
            ).all()
            for task_name in code_normal_names:
                if any(q.task_name == task_name for q in code_questions):
                    expected_question_ids.add(f"code_normal_{task_name}")
        
        # Code debug questions
        if assignment.debug_post_test:
            code_debug_names = [name for name in assignment.debug_post_test if name]
            code_questions = db.query(CodeData).filter(
                CodeData.task_name.in_(code_debug_names)
            ).all()
            for task_name in code_debug_names:
                if any(q.task_name == task_name for q in code_questions):
                    expected_question_ids.add(f"code_debug_{task_name}")
    
    # Get all responses for this user and phase
    mcqa_responses = db.query(UserMCQASkillResponse).filter(
        UserMCQASkillResponse.user_id == user_id,
        UserMCQASkillResponse.phase == phase
    ).all()
    
    code_responses = db.query(UserCodeSkillResponse).filter(
        UserCodeSkillResponse.user_id == user_id,
        UserCodeSkillResponse.phase == phase,
        UserCodeSkillResponse.state.in_(['passed', 'reported'])
    ).all()
    
    # Track answered questions
    answered_mcqa_ids = {resp.question_id for resp in mcqa_responses}
    answered_code_ids = {resp.question_id for resp in code_responses}
    all_answered_ids = answered_mcqa_ids | answered_code_ids
    
    # Check if all expected questions are answered
    return expected_question_ids.issubset(all_answered_ids)


def get_user_test_completion(user_id: int, db: Session) -> Tuple[bool, bool]:
    """
    Get pre-test and post-test completion status for a user.
    Returns (pre_test_completed, post_test_completed)
    """
    try:
        assignment = (
            db.query(SkillCheckAssignment)
            .filter(SkillCheckAssignment.user_id == user_id)
            .first()
        )
        
        pre_test_completed = check_phase_completion(user_id, "pre-test", assignment, db)
        post_test_completed = check_phase_completion(user_id, "post-test", assignment, db)
        
        return (pre_test_completed, post_test_completed)
    except Exception as e:
        print(f"Warning: Error checking test completion for user {user_id}: {e}")
        return (False, False)


def get_user_completed_tasks(user_id: int, db: Session) -> tuple[int, list[str]]:
    """
    Get the number and names of completed post-test required tasks for a user.
    Only counts the specific required tasks: connect_four, snake, platformer
    Tutorial/playground tasks are excluded.
    
    Returns:
        (count, list of completed task names)
    """
    # Post-test required tasks (matching POST_TEST_REQUIRED_TASKS from interface/app/config/tasks.ts)
    REQUIRED_TASK_NAMES = {'connect_four', 'snake', 'platformer'}
    
    # Get all submissions for the user
    submissions = db.query(Submission).filter(Submission.user_id == user_id).all()
    
    # Get unique project IDs from submissions
    completed_project_ids = {sub.project_id for sub in submissions}
    
    if not completed_project_ids:
        return (0, [])
    
    # Get all projects for these submissions
    projects = db.query(Project).filter(Project.id.in_(completed_project_ids)).all()
    
    # Filter to only count required tasks (exclude tutorial/playground)
    # Normalize task names for comparison (case-insensitive)
    required_task_names_lower = {name.lower() for name in REQUIRED_TASK_NAMES}
    completed_required_tasks = [
        p.name for p in projects 
        if p.name and p.name.lower() in required_task_names_lower
    ]
    
    return (len(completed_required_tasks), completed_required_tasks)


def categorize_user(
    pre_test_completed: bool,
    post_test_completed: bool,
    completed_tasks: int
) -> str:
    """
    Categorize a user based on their progress.
    """
    # Completed: pre-test + 3 tasks + post-test
    if pre_test_completed and post_test_completed and completed_tasks >= 3:
        return "completed"
    
    # Edge case: post-test completed but less than 3 tasks (shouldn't happen, but handle it)
    if post_test_completed and completed_tasks < 3:
        # If they completed post-test, they should have done pre-test and 3 tasks
        # But if data is inconsistent, treat as completed if they have post-test
        return "completed"
    
    # Three tasks: has completed 3+ tasks, needs post-test
    if pre_test_completed and completed_tasks >= 3 and not post_test_completed:
        return "three_tasks"
    
    # Two tasks: has completed 2 tasks, needs 3rd + post-test
    if pre_test_completed and completed_tasks == 2:
        return "two_tasks"
    
    # One task: has completed 1 task, needs 2nd + 3rd + post-test
    if pre_test_completed and completed_tasks == 1:
        return "one_task"
    
    # Pre-test: has only done pre-test
    if pre_test_completed and completed_tasks == 0:
        return "pre_test"
    
    # Not started: hasn't started anything
    return "not_started"


def main():
    """Main function to categorize all users."""
    db = next(config.get_db())
    
    try:
        users = get_all_users(db)
        print(f"Found {len(users)} users\n")
        
        categories = defaultdict(list)
        
        for user in users:
            pre_test_completed, post_test_completed = get_user_test_completion(user.id, db)
            completed_tasks_count, completed_task_names = get_user_completed_tasks(user.id, db)
            
            category = categorize_user(pre_test_completed, post_test_completed, completed_tasks_count)
            categories[category].append({
                "email": user.email,
                "username": user.username,
                "user_id": user.id,
                "pre_test": pre_test_completed,
                "post_test": post_test_completed,
                "completed_tasks": completed_tasks_count,
                "completed_task_names": sorted(completed_task_names)
            })
        
        # Print results organized by category
        print("=" * 80)
        print("USER CATEGORIZATION RESULTS")
        print("=" * 80)
        print()
        
        category_order = [
            "completed",
            "three_tasks",
            "two_tasks",
            "one_task",
            "pre_test",
            "not_started"
        ]
        
        for category in category_order:
            users_in_category = categories[category]
            print(f"\n{category.upper().replace('_', ' ')}: {len(users_in_category)} users")
            print("-" * 80)
            
            for user_info in users_in_category:
                print(f"  Email: {user_info['email']}")
                print(f"  Username: {user_info['username']}")
                print(f"  User ID: {user_info['user_id']}")
                print(f"  Pre-test: {'✓' if user_info['pre_test'] else '✗'}")
                print(f"  Post-test: {'✓' if user_info['post_test'] else '✗'}")
                print(f"  Completed tasks: {user_info['completed_tasks']}")
                if user_info['completed_task_names']:
                    print(f"  Task names: {', '.join(user_info['completed_task_names'])}")
                print()
        
        # Print summary
        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)
        total = sum(len(users) for users in categories.values())
        for category in category_order:
            count = len(categories[category])
            percentage = (count / total * 100) if total > 0 else 0
            print(f"  {category.replace('_', ' ').title()}: {count} ({percentage:.1f}%)")
        
        # Export to CSV
        import csv
        output_file = Path(__file__).parent.parent / "user_categorization.csv"
        with open(output_file, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['email', 'username', 'user_id', 'category', 'pre_test', 'post_test', 'completed_tasks', 'completed_task_names'])
            
            for category in category_order:
                for user_info in categories[category]:
                    writer.writerow([
                        user_info['email'],
                        user_info['username'],
                        user_info['user_id'],
                        category,
                        user_info['pre_test'],
                        user_info['post_test'],
                        user_info['completed_tasks'],
                        ', '.join(user_info['completed_task_names'])
                    ])
        
        print(f"\n✅ Results exported to: {output_file}")
        
    except Exception as e:
        import traceback
        print(f"❌ Error: {e}")
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
