#!/usr/bin/env python3
"""
Test script for the complete password reset flow.
This script tests both the password reset request and the actual password reset.
"""

import os
import sys
import requests
from dotenv import load_dotenv

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(__file__))

# Load environment variables
load_dotenv()

BASE_URL = "http://localhost:8000"

def test_password_reset_flow():
    """Test the complete password reset flow."""
    print("🧪 Testing Complete Password Reset Flow")
    print("=" * 50)
    
    # Test user data
    test_username = "testuser"
    test_email = "test@example.com"
    test_password = "oldpassword123"
    new_password = "newpassword123"
    
    print(f"👤 Test Username: {test_username}")
    print(f"📧 Test Email: {test_email}")
    print()
    
    # Step 1: Create a test user (if not exists)
    print("1️⃣ Creating test user...")
    try:
        signup_data = {
            "username": test_username,
            "email": test_email,
            "password": test_password
        }
        response = requests.post(f"{BASE_URL}/signup", json=signup_data)
        if response.status_code == 200:
            print("✅ Test user created successfully")
        elif response.status_code == 400 and "already registered" in response.text:
            print("ℹ️  Test user already exists")
        else:
            print(f"❌ Failed to create test user: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Error creating test user: {e}")
    
    print()
    
    # Step 2: Request password reset
    print("2️⃣ Requesting password reset...")
    try:
        reset_request_data = {
            "username_or_email": test_username
        }
        response = requests.post(f"{BASE_URL}/send-password-reset", json=reset_request_data)
        
        if response.status_code == 200:
            print("✅ Password reset request sent successfully")
            data = response.json()
            print(f"   Message: {data.get('message', 'No message')}")
            
            # Check if reset token was returned (for development)
            if 'reset_token' in data:
                reset_token = data['reset_token']
                print(f"🔑 Reset token: {reset_token}")
                
                # Step 3: Test token validation
                print()
                print("3️⃣ Testing token validation...")
                try:
                    response = requests.get(f"{BASE_URL}/validate-reset-token?token={reset_token}")
                    
                    if response.status_code == 200:
                        validation_data = response.json()
                        print("✅ Token validation successful!")
                        print(f"   Username: {validation_data.get('username', 'Unknown')}")
                        print(f"   Expires at: {validation_data.get('expires_at', 'Unknown')}")
                        
                        # Step 4: Test password reset with token
                        print()
                        print("4️⃣ Testing password reset with token...")
                        try:
                            reset_data = {
                                "token": reset_token,
                                "new_password": new_password
                            }
                            response = requests.post(f"{BASE_URL}/reset-password", json=reset_data)
                            
                            if response.status_code == 200:
                                print("✅ Password reset successful!")
                                data = response.json()
                                print(f"   Message: {data.get('message', 'No message')}")
                                
                                # Step 5: Test login with new password
                                print()
                                print("5️⃣ Testing login with new password...")
                                try:
                                    login_data = {
                                        "username_or_email": test_username,
                                        "password": new_password
                                    }
                                    response = requests.post(f"{BASE_URL}/login", json=login_data)
                                    
                                    if response.status_code == 200:
                                        print("✅ Login with new password successful!")
                                        data = response.json()
                                        print(f"   User: {data.get('user', {}).get('username', 'Unknown')}")
                                        print(f"   Token: {data.get('access_token', 'No token')[:20]}...")
                                    else:
                                        print(f"❌ Login with new password failed: {response.status_code}")
                                        print(f"   Response: {response.text}")
                                except Exception as e:
                                    print(f"❌ Error testing login: {e}")
                            else:
                                print(f"❌ Password reset failed: {response.status_code}")
                                print(f"   Response: {response.text}")
                        except Exception as e:
                            print(f"❌ Error testing password reset: {e}")
                    else:
                        print(f"❌ Token validation failed: {response.status_code}")
                        print(f"   Response: {response.text}")
                except Exception as e:
                    print(f"❌ Error testing token validation: {e}")
            else:
                print("ℹ️  No reset token returned (email sending enabled)")
        else:
            print(f"❌ Password reset request failed: {response.status_code}")
            print(f"   Response: {response.text}")
    except Exception as e:
        print(f"❌ Error requesting password reset: {e}")
    
    print()
    print("🏁 Password reset flow test completed!")

if __name__ == "__main__":
    test_password_reset_flow()
