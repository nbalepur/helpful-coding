# Password Reset Implementation

This document describes the complete password reset functionality implemented using Brevo email service.

## Overview

The password reset system consists of:
1. **Password Reset Request Modal** - Users can request a password reset
2. **Email Service** - Sends reset links via Brevo API
3. **Password Reset Page** - Handles the actual password reset
4. **Backend API** - Manages tokens and password updates

## Components

### Frontend Components

#### 1. PasswordResetModal (`/interface/app/components/PasswordResetModal.tsx`)
- Modal for requesting password reset
- Follows the same design pattern as LoginForm and SignupForm
- Takes username or email as input
- Shows success/error states

#### 2. Reset Password Page (`/interface/app/reset-password/page.tsx`)
- Handles password reset from email links
- Extracts token and username from URL parameters
- Pre-fills username (non-editable for security)
- Validates new password and confirms reset

#### 3. Updated LoginForm (`/interface/app/components/LoginForm.tsx`)
- Added "Forgot your password?" link
- Integrates PasswordResetModal
- Maintains existing functionality

### Backend Components

#### 1. Brevo Email Integration (`/backend/auth.py`)
- Replaced SendGrid with Brevo API
- Clean reset link with just token: `?token=abc123`
- Username fetched from database via token relationship
- Comprehensive error handling
- Development fallback (console output)

#### 2. API Endpoints (`/backend/main.py`)
- `POST /send-password-reset` - Request password reset
- `GET /validate-reset-token` - Validate token and get username
- `POST /reset-password` - Complete password reset

## User Flow

### 1. Request Password Reset
```
User clicks "Forgot your password?" → 
PasswordResetModal opens → 
User enters username/email → 
Email sent via Brevo → 
Success message shown
```

### 2. Complete Password Reset
```
User clicks email link → 
Reset password page opens → 
Token validated → Username fetched from database → 
Username displayed (non-editable) → 
User enters new password → 
Password updated → 
Success message → 
Redirect to login
```

## URL Structure

### Reset Link Format
```
http://localhost:3000/reset-password?token={reset_token}
```

**Benefits:**
- Clean, simple URL with just the token
- Username fetched from database using token's user_id relationship
- More secure (no username exposure in URL)
- Token contains all necessary information via database relationship

## Security Features

1. **Token-based Reset**: Secure random tokens with 30-minute expiration
2. **One-time Use**: Tokens are invalidated after use
3. **Username Validation**: Username in URL must match the token's user
4. **Password Requirements**: Minimum 8 characters, confirmation required
5. **Rate Limiting**: Prevents abuse (handled by Brevo)

## Configuration

### Environment Variables
```env
# Brevo Email Configuration
BREVO_API_KEY=your_brevo_api_key_here
FROM_EMAIL=noreply@helpfulcoding.com
FROM_NAME=Helpful Coding
RESET_LINK_BASE_URL=http://localhost:3000/reset-password

# Authentication Configuration
SECRET_KEY=your-secret-key-change-this-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### Brevo Setup
1. Sign up at [https://app.brevo.com](https://app.brevo.com)
2. Create API key with "Send emails" permission
3. Verify sender email address
4. Add API key to `.env` file

## Testing

### Manual Testing
1. Start backend: `cd backend && python main.py`
2. Start frontend: `cd interface && npm run dev`
3. Navigate to login page
4. Click "Forgot your password?"
5. Enter username/email
6. Check console for reset link (if no Brevo API key)
7. Click reset link
8. Enter new password
9. Verify login works with new password

### Automated Testing
```bash
cd backend
python test_password_reset_flow.py
```

## Development vs Production

### Development Mode (No Brevo API Key)
- Reset links printed to console
- No actual emails sent
- Full functionality for testing

### Production Mode (With Brevo API Key)
- Emails sent via Brevo
- Professional email templates
- Delivery tracking and analytics

## Error Handling

### Frontend Errors
- Network connectivity issues
- Invalid/expired tokens
- Password validation errors
- User-friendly error messages

### Backend Errors
- Brevo API failures
- Database connection issues
- Token validation errors
- Comprehensive logging

## Email Template

The password reset email includes:
- Professional HTML design
- Clear call-to-action button
- Security warnings
- Plain text fallback
- Branded styling

## Future Enhancements

1. **Email Templates**: Customizable Brevo templates
2. **Analytics**: Track reset request patterns
3. **Rate Limiting**: Additional backend rate limiting
4. **Audit Logging**: Track password reset events
5. **Multi-language**: Support for multiple languages

## Troubleshooting

### Common Issues

1. **"Invalid reset link"**
   - Token expired (30 minutes)
   - Token already used
   - Malformed URL

2. **"Email not sent"**
   - Check Brevo API key
   - Verify sender email
   - Check Brevo account status

3. **"Username not found"**
   - Check username/email spelling
   - Verify account exists

### Debug Mode
When `BREVO_API_KEY` is not set:
- Reset links printed to console
- Helpful setup instructions
- Full functionality maintained
