#!/usr/bin/env python3
"""
Test script for password reset endpoints.
"""
import requests
import json

# Backend URL
BASE_URL = "http://localhost:8000"

def test_send_password_reset():
    """Test send password reset endpoint."""
    print("Testing /send-password-reset endpoint...")
    
    reset_data = {
        "username_or_email": "testuser"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/send-password-reset", json=reset_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("✅ Password reset email sent successfully!")
            return response.json()
        else:
            print("❌ Password reset failed!")
            return None
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend server. Make sure it's running on localhost:8000")
        return None
    except Exception as e:
        print(f"❌ Error during password reset test: {e}")
        return None


def test_reset_password_with_token():
    """Test reset password with a token (this will fail without a real token)."""
    print("\nTesting /reset-password endpoint...")
    
    reset_data = {
        "token": "fake-token-for-testing",
        "new_password": "newpass123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/reset-password", json=reset_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 400:
            print("✅ Invalid token correctly rejected!")
        else:
            print("❌ Should have rejected invalid token!")
            
    except Exception as e:
        print(f"❌ Error during reset password test: {e}")


def test_reset_password_nonexistent_user():
    """Test password reset for non-existent user."""
    print("\nTesting /send-password-reset with non-existent user...")
    
    reset_data = {
        "username_or_email": "nonexistentuser"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/send-password-reset", json=reset_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("✅ Non-existent user handled correctly (security feature)")
        else:
            print("❌ Should return success for security!")
            
    except Exception as e:
        print(f"❌ Error during non-existent user test: {e}")


if __name__ == "__main__":
    print("🧪 Testing Password Reset Endpoints")
    print("=" * 50)
    
    # Test send password reset
    test_send_password_reset()
    
    # Test reset password with invalid token
    test_reset_password_with_token()
    
    # Test with non-existent user
    test_reset_password_nonexistent_user()
    
    print("\n" + "=" * 50)
    print("🏁 Password reset tests completed!")
    print("\n📧 Note: In development mode, reset links are printed to console instead of sent via email.")
