# Environment Configuration

Create a `.env` file in the backend directory with the following variables:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/helpful_coding

# JWT Configuration
SECRET_KEY=your-secret-key-change-this-in-production-make-it-long-and-random
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Email Configuration (SendGrid)
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@yourdomain.com
RESET_LINK_BASE_URL=http://localhost:4827/reset-password

# Development Settings
DEBUG=True
```

## Getting SendGrid API Key

1. Sign up for SendGrid at https://sendgrid.com/
2. Go to Settings > API Keys
3. Create a new API key with "Mail Send" permissions
4. Copy the API key and add it to your `.env` file

## Security Notes

- **Never commit your `.env` file to version control**
- Use a strong, random SECRET_KEY in production
- The `.env` file is already in `.gitignore` for security
