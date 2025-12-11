# Brevo Email Integration

This project now uses Brevo (formerly Sendinblue) for sending password reset emails instead of SendGrid.

## Setup

### 1. Install Dependencies

The Brevo SDK has been added to `requirements.txt`:

```bash
pip install sib-api-v3-sdk==7.6.0
```

### 2. Get Brevo API Key

1. Sign up for a free Brevo account at [https://app.brevo.com](https://app.brevo.com)
2. Go to Settings → API Keys
3. Create a new API key with "Send emails" permissions
4. Copy the API key

### 3. Configure Environment Variables

Add the following variables to your `.env` file:

```env
# Email Configuration (Brevo)
BREVO_API_KEY=your_brevo_api_key_here
FROM_EMAIL=noreply@helpfulcoding.com
FROM_NAME=Helpful Coding
RESET_LINK_BASE_URL=http://localhost:4827/reset-password
```

### 4. Test the Integration

Run the test script to verify the integration:

```bash
cd backend
python test_brevo_email.py
```

## Features

- **Transactional Emails**: Uses Brevo's transactional email API for reliable delivery
- **HTML & Text Content**: Sends both HTML and plain text versions of emails
- **Fallback Mode**: In development (without API key), emails are printed to console
- **Error Handling**: Comprehensive error handling with fallback to console output
- **Professional Templates**: Clean, responsive email templates

## API Usage

The `send_password_reset_email()` function in `auth.py` now uses Brevo:

```python
from auth import send_password_reset_email

# Send password reset email
success = send_password_reset_email(
    email="user@example.com",
    username="username",
    reset_token="secure-token-here"
)
```

## Migration from SendGrid

The integration replaces SendGrid with Brevo while maintaining the same function signature and behavior. No changes are needed in the calling code.

## Troubleshooting

### Common Issues

1. **API Key Not Working**: Ensure the API key has "Send emails" permissions
2. **Sender Email Not Verified**: Verify your sender email address in Brevo dashboard
3. **Rate Limits**: Brevo has rate limits; check your account status if emails fail

### Debug Mode

When `BREVO_API_KEY` is not set, the system will:
- Print the reset link to console
- Display a helpful message about setting up the API key
- Continue functioning for development purposes

## Brevo Dashboard

Monitor your email delivery and statistics at:
- [Brevo Dashboard](https://app.brevo.com)
- Transactional emails: Statistics → Transactional
- API usage: Settings → API Keys
