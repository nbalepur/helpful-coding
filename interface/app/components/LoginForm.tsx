"use client";
import { useState } from "react";
import { ENV } from "../config/env";
import PasswordResetModal from "./PasswordResetModal";
import { setUserIdCookie, setAuthTokenCookie, generateUuidV4 } from "../utils/cookies";
import LoadingSpinner from "./LoadingSpinner";

interface LoginFormProps {
  onSuccess: (user: any, token: string) => void;
  onSwitchToSignup: () => void;
  onCancel: () => void;
}

export default function LoginForm({ onSuccess, onSwitchToSignup, onCancel }: LoginFormProps) {
  const [formData, setFormData] = useState({
    username_or_email: "",
    password: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent duplicate submissions
    if (isLoading) {
      return;
    }
    
    setIsLoading(true);
    setError("");

    try {
      
      // Add timeout to prevent hanging requests (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      let response;
      try {
        response = await fetch(`${ENV.BACKEND_URL}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timed out. Please check your connection and try again.');
        }
        throw fetchError;
      }

      // Check if response is ok before trying to parse JSON
      if (!response.ok) {
        // Try to parse error response
        let errorMessage = "Login failed. Please try again.";
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            if (Array.isArray(errorData.detail)) {
              // Format Pydantic validation errors
              errorMessage = errorData.detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
            } else {
              errorMessage = errorData.detail;
            }
          }
        } catch (parseError) {
          // If we can't parse the error response, use status text
          errorMessage = `Login failed: ${response.status} ${response.statusText || 'Unknown error'}`;
        }
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      // Parse successful response
      let data;
      try {
        const responseText = await response.text();
        if (!responseText) {
          throw new Error('Empty response from server');
        }
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse login response:', parseError);
        setError("Invalid response from server. Please try again.");
        setIsLoading(false);
        return;
      }

      // Validate response has required fields
      if (!data.access_token || !data.user) {
        console.error('[LoginForm] Invalid login response structure:', data);
        setError("Invalid response from server. Please try again.");
        setIsLoading(false);
        return;
      }
      
      // Store token in localStorage
      try {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
      } catch (storageError) {
        console.error('[LoginForm] Failed to store auth in localStorage:', storageError);
        // Continue anyway - cookies will still work
      }
      
      // Store in cookies for persistence (use UUID for user_id cookie)
      try {
        setUserIdCookie(generateUuidV4());
        setAuthTokenCookie(data.access_token);
      } catch (cookieError) {
        console.error('[LoginForm] Failed to set auth cookies:', cookieError);
        // Continue anyway - localStorage will still work
      }
      // Call success callback
      onSuccess(data.user, data.access_token);
    } catch (err: any) {
      console.error('Login error:', err);
      // Check for connection refused errors
      let errorMessage = "Network error. Please check your connection and try again.";
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        // Likely backend server is not running
        const backendUrl = ENV.BACKEND_URL;
        if (backendUrl.includes('127.0.0.1:4828') || backendUrl.includes('localhost:4828')) {
          errorMessage = "Backend server is not running. Please start the backend server on port 4828 and try again.";
        } else {
          errorMessage = `Cannot connect to backend server at ${backendUrl}. Please ensure the server is running.`;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Show password reset modal if requested
  if (showPasswordReset) {
    return (
      <PasswordResetModal
        onSuccess={() => setShowPasswordReset(false)}
        onCancel={() => setShowPasswordReset(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 overflow-y-auto relative z-20">
      <div className="w-full max-w-lg my-8">
        {/* Back Button */}
        <button
          onClick={onCancel}
          className="mb-6 flex items-center text-white hover:text-blue-400 transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>

        {/* Main Form Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 shadow-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-semibold text-white mb-2" style={{textAlign: 'center'}}>Welcome Back</h2>
            <p className="text-gray-400">Sign in to continue to Vibe Jam</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Username/Email Field */}
            <div className="flex items-center">
              <div className="flex-shrink-0 w-12 h-12 bg-gray-900 border border-gray-600 rounded-l-md flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                type="text"
                id="username_or_email"
                name="username_or_email"
                value={formData.username_or_email}
                onChange={handleChange}
                required
                className="flex-1 px-5 h-12 bg-gray-700 border border-gray-600 border-l-0 rounded-r-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 leading-none"
                placeholder="Username or email"
              />
            </div>

            {/* Password Field */}
            <div className="flex items-center">
              <div className="flex-shrink-0 w-12 h-12 bg-gray-900 border border-gray-600 rounded-l-md flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="flex-1 px-5 h-12 bg-gray-700 border border-gray-600 border-l-0 rounded-r-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 leading-none"
                placeholder="Password"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-md">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Forgot Password Link */}
            <div className="text-right">
              <button
                type="button"
                onClick={() => setShowPasswordReset(true)}
                className="text-white hover:text-blue-400 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
              >
                Forgot your password?
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3 text-white text-base font-semibold rounded-md shadow transition-all duration-300 hover:animate-gradient-shift disabled:cursor-not-allowed disabled:opacity-60"
              style={isLoading ? {
                backgroundImage: 'linear-gradient(-45deg, #4b5563, #6b7280, #4b5563, #6b7280)',
                backgroundSize: '400% 400%',
                backgroundPosition: '0% 50%',
              } : {
                backgroundImage: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
                backgroundSize: '400% 400%',
                backgroundPosition: '0% 50%',
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.animation = 'gradient-shift 3s ease infinite';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.animation = '';
              }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <LoadingSpinner size="sm" color="white" className="mr-3" />
                  Signing in...
                </div>
              ) : (
                "Log In"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Don't have an account?{" "}
              <button
                onClick={onSwitchToSignup}
                className="text-white hover:text-blue-400 font-medium transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
              >
                Sign up
              </button>
            </p>
            <p className="text-gray-500 text-xs mt-3">
              If you encounter issues, please contact{" "}
              <a href="mailto:nbalepur@umd.edu" className="text-blue-400 hover:text-blue-300 underline">
                nbalepur@umd.edu
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}