"""
Users API: update user settings.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.config import get_db
from database.sqlalchemy_models import User

router = APIRouter(prefix="/api", tags=["Users"])


@router.put("/users/{user_id}/settings")
async def update_user_settings(
    user_id: int,
    request: dict,
    db: Session = Depends(get_db),
):
    """Update user settings. Merges with existing settings."""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        new_settings = request.get("settings", {})
        if not isinstance(new_settings, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Settings must be a dictionary")
        current_settings = user.settings or {}
        updated_settings = {**current_settings, **new_settings}
        user.settings = updated_settings
        db.commit()
        db.refresh(user)
        return {"message": "Settings updated successfully", "settings": user.settings}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error updating settings: {str(e)}")
