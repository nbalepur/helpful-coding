#!/usr/bin/env python3
"""
Test script for Brevo email integration.
This script tests the password reset email functionality using Brevo API.
"""

import os
import sys
from dotenv import load_dotenv

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(__file__))

from auth import send_password_reset_email

def test_brevo_email():
    """Test the Brevo email functionality."""
    print("🧪 Testing Brevo Email Integration")
    print("=" * 50)
    
    # Load environment variables
    load_dotenv()
    
    # Test email details
    test_email = "test@example.com"
    test_username = "TestUser"
    test_token = "test-reset-token-123"
    
    print(f"📧 Test Email: {test_email}")
    print(f"👤 Test Username: {test_username}")
    print(f"🔑 Test Token: {test_token}")
    print()
    
    # Check if Brevo API key is configured
    brevo_api_key = os.getenv("BREVO_API_KEY")
    if not brevo_api_key:
        print("⚠️  BREVO_API_KEY not found in environment variables")
        print("   The email will be printed to console instead of being sent")
        print("   To enable actual email sending, set BREVO_API_KEY in your .env file")
        print()
    
    # Test the email function
    try:
        print("🚀 Sending test email...")
        result = send_password_reset_email(test_email, test_username, test_token)
        
        if result:
            print("✅ Email function executed successfully!")
        else:
            print("❌ Email function returned False")
            
    except Exception as e:
        print(f"❌ Error during email test: {e}")
        import traceback
        traceback.print_exc()
    
    print()
    print("🏁 Test completed!")

if __name__ == "__main__":
    test_brevo_email()
