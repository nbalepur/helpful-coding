"""
Authentication utilities for password hashing and verification.
"""
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import os
import secrets
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# JWT settings
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# Email settings
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@helpfulcoding.com")
FROM_NAME = os.getenv("FROM_NAME", "Helpful Coding")
RESET_LINK_BASE_URL = os.getenv("RESET_LINK_BASE_URL")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def generate_reset_token() -> str:
    """Generate a secure random token for password reset."""
    return secrets.token_urlsafe(32)


def send_password_reset_email(email: str, username: str, reset_token: str) -> bool:
    """Send password reset email to user using Brevo API."""
    try:
        # Create reset link (token contains user_id, so username not needed in URL)
        reset_link = f"{RESET_LINK_BASE_URL}?token={reset_token}"
        
        # Check if Brevo API key is configured
        if not BREVO_API_KEY:
            # In development, just print the reset link
            print(f"🔗 Password reset link for {email}: {reset_link}")
            print("📧 To enable email sending, set BREVO_API_KEY in your .env file")
            return True
        
        # Configure Brevo API
        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key['api-key'] = BREVO_API_KEY
        
        # Initialize Brevo API instance
        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))
        
        # Create email content
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Hello {username},</p>
            <p>You requested a password reset for your Helpful Coding account.</p>
            <p>Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
            </div>
            <p><strong>This link will expire in 30 minutes for security reasons.</strong></p>
            <p>If you didn't request this password reset, please ignore this email.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 14px;">Best regards,<br>The Helpful Coding Team</p>
        </div>
        """
        
        plain_text_content = f"""
        Hello {username},
        
        You requested a password reset for your Helpful Coding account.
        
        Click the link below to reset your password:
        {reset_link}
        
        This link will expire in 30 minutes for security reasons.
        
        If you didn't request this password reset, please ignore this email.
        
        Best regards,
        The Helpful Coding Team
        """
        
        # Create sender object
        sender = sib_api_v3_sdk.SendSmtpEmailSender(
            name=FROM_NAME,
            email=FROM_EMAIL
        )
        
        # Create recipient object
        to = sib_api_v3_sdk.SendSmtpEmailTo(
            email=email,
            name=username
        )
        
        # Create email object
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            sender=sender,
            to=[to],
            subject="Password Reset Request - Helpful Coding",
            html_content=html_content,
            text_content=plain_text_content
        )
        
        # Send email
        api_response = api_instance.send_transac_email(send_smtp_email)
        
        if api_response:
            print(f"✅ Password reset email sent to {email}")
            return True
        else:
            print(f"❌ Failed to send email via Brevo")
            return False
            
    except ApiException as e:
        print(f"❌ Brevo API error: {e}")
        # Fallback to console output in case of error
        print(f"🔗 Password reset link for {email}: {reset_link}")
        return False
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        # Fallback to console output in case of error
        print(f"🔗 Password reset link for {email}: {reset_link}")
        return False
