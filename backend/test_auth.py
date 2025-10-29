#!/usr/bin/env python3
"""
Test script for authentication endpoints.
"""
import requests
import json

# Backend URL
BASE_URL = "http://localhost:8000"

def test_signup():
    """Test user signup endpoint."""
    print("Testing /signup endpoint...")
    
    signup_data = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpass123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/signup", json=signup_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("✅ Signup successful!")
            return response.json()
        else:
            print("❌ Signup failed!")
            return None
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend server. Make sure it's running on localhost:8000")
        return None
    except Exception as e:
        print(f"❌ Error during signup test: {e}")
        return None


def test_login():
    """Test user login endpoint."""
    print("\nTesting /login endpoint...")
    
    login_data = {
        "username_or_email": "testuser",
        "password": "testpass123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/login", json=login_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("✅ Login successful!")
            return response.json()
        else:
            print("❌ Login failed!")
            return None
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend server. Make sure it's running on localhost:8000")
        return None
    except Exception as e:
        print(f"❌ Error during login test: {e}")
        return None


def test_login_with_email():
    """Test login with email instead of username."""
    print("\nTesting /login endpoint with email...")
    
    login_data = {
        "username_or_email": "test@example.com",
        "password": "testpass123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/login", json=login_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            print("✅ Login with email successful!")
            return response.json()
        else:
            print("❌ Login with email failed!")
            return None
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to backend server. Make sure it's running on localhost:8000")
        return None
    except Exception as e:
        print(f"❌ Error during login with email test: {e}")
        return None


def test_duplicate_signup():
    """Test duplicate signup (should fail)."""
    print("\nTesting duplicate signup (should fail)...")
    
    signup_data = {
        "username": "testuser",
        "email": "test@example.com",
        "password": "testpass123"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/signup", json=signup_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 400:
            print("✅ Duplicate signup correctly rejected!")
        else:
            print("❌ Duplicate signup should have been rejected!")
            
    except Exception as e:
        print(f"❌ Error during duplicate signup test: {e}")


def test_invalid_login():
    """Test login with invalid credentials."""
    print("\nTesting login with invalid credentials (should fail)...")
    
    login_data = {
        "username_or_email": "testuser",
        "password": "wrongpassword"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/login", json=login_data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 401:
            print("✅ Invalid login correctly rejected!")
        else:
            print("❌ Invalid login should have been rejected!")
            
    except Exception as e:
        print(f"❌ Error during invalid login test: {e}")


if __name__ == "__main__":
    print("🧪 Testing Authentication Endpoints")
    print("=" * 50)
    
    # Test signup
    signup_result = test_signup()
    
    # Test login with username
    login_result = test_login()
    
    # Test login with email
    test_login_with_email()
    
    # Test duplicate signup
    test_duplicate_signup()
    
    # Test invalid login
    test_invalid_login()
    
    print("\n" + "=" * 50)
    print("🏁 Authentication tests completed!")
