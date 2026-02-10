"""
Authentication API: signup, login, validate token, password reset.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database.config import get_db
from database.sqlalchemy_models import User, PasswordResetToken
from database.models import (
    UserCreate,
    PasswordResetRequest,
    PasswordResetConfirm,
    PasswordResetTokenCreate,
)
from utils.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    verify_token,
    generate_reset_token,
    send_password_reset_email,
)

router = APIRouter(tags=["Authentication"])


@router.post("/signup")
async def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    """Create a new user account."""
    try:
        existing_user = db.query(User).filter(
            or_(User.username == user_data.username, User.email == user_data.email)
        ).first()
        if existing_user:
            if existing_user.username == user_data.username:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        hashed_password = get_password_hash(user_data.password)
        db_user = User(
            username=user_data.username,
            email=user_data.email,
            password=hashed_password,
            settings=user_data.settings or {},
            can_view_submissions=user_data.can_view_submissions,
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        access_token = create_access_token(data={"sub": str(db_user.id)})
        return {
            "message": "User created successfully",
            "user": {
                "id": db_user.id,
                "username": db_user.username,
                "email": db_user.email,
                "settings": db_user.settings or {},
                "can_view_submissions": db_user.can_view_submissions,
                "created_at": db_user.created_at,
            },
            "access_token": access_token,
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error creating user: {str(e)}")


@router.post("/login")
async def login(credentials: dict, db: Session = Depends(get_db)):
    """Authenticate user and return access token."""
    try:
        username_or_email = credentials.get("username_or_email")
        password = credentials.get("password")
        if not username_or_email or not password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username/email and password are required")
        user = db.query(User).filter(
            or_(User.username == username_or_email, User.email == username_or_email)
        ).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Username or email not found")
        if not verify_password(password, user.password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")
        access_token = create_access_token(data={"sub": str(user.id)})
        return {
            "message": "Login successful",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "settings": user.settings or {},
                "can_view_submissions": user.can_view_submissions,
                "created_at": user.created_at,
            },
            "access_token": access_token,
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error during login: {str(e)}")


@router.get("/auth/validate")
async def validate_auth_token(request: Request, db: Session = Depends(get_db)):
    """Validate an authentication token and return the associated user."""
    try:
        auth_header = request.headers.get("Authorization")
        token: Optional[str] = None
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        if not token:
            token = request.query_params.get("token")
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")
        payload = verify_token(token)
        if not payload or "sub" not in payload:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
        user_id = payload.get("sub")
        try:
            user_id_int = int(user_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
        user = db.query(User).filter(User.id == user_id_int).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return {
            "valid": True,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "settings": user.settings or {},
                "can_view_submissions": user.can_view_submissions,
                "created_at": user.created_at,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error validating token: {str(e)}")


@router.post("/send-password-reset")
async def send_password_reset(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """Send password reset email to user."""
    try:
        username_or_email = request.username_or_email
        user = db.query(User).filter(
            or_(User.username == username_or_email, User.email == username_or_email)
        ).first()
        if not user:
            return JSONResponse(status_code=404, content={"detail": "No account found with that username or email address"})
        reset_token = generate_reset_token()
        expires_at = datetime.utcnow() + timedelta(minutes=30)
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,
        ).update({"used": True})
        reset_token_data = PasswordResetTokenCreate(
            user_id=user.id,
            token=reset_token,
            expires_at=expires_at,
            used=False,
        )
        reset_token_record = PasswordResetToken(**reset_token_data.model_dump())
        db.add(reset_token_record)
        db.commit()
        email_sent = send_password_reset_email(user.email, user.username, reset_token)
        if email_sent:
            return {"message": "Password reset email sent successfully", "user_exists": True}
        return {"message": "Password reset email could not be sent, but reset token generated", "reset_token": reset_token, "user_exists": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error sending password reset: {str(e)}")


@router.get("/validate-reset-token")
async def validate_reset_token(token: str, db: Session = Depends(get_db)):
    """Validate reset token and return username if valid."""
    try:
        reset_token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token == token,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > datetime.utcnow(),
        ).first()
        if not reset_token_record:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")
        user = db.query(User).filter(User.id == reset_token_record.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")
        return {"valid": True, "username": user.username, "expires_at": reset_token_record.expires_at.isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error validating token: {str(e)}")


@router.post("/reset-password")
async def reset_password(request: PasswordResetConfirm, db: Session = Depends(get_db)):
    """Reset user password using reset token."""
    try:
        token = request.token
        new_password = request.new_password
        reset_token_record = db.query(PasswordResetToken).filter(
            PasswordResetToken.token == token,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > datetime.utcnow(),
        ).first()
        if not reset_token_record:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")
        user = db.query(User).filter(User.id == reset_token_record.user_id).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")
        hashed_password = get_password_hash(new_password)
        user.password = hashed_password
        user.updated_at = datetime.utcnow()
        reset_token_record.used = True
        db.commit()
        return {"message": "Password reset successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error resetting password: {str(e)}")
