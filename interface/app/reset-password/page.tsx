'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ENV } from '../config/env';

export default function ResetPasswordPage() {
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Extract token from URL parameters
    const urlToken = searchParams.get('token');
    
    if (!urlToken) {
      setError('Invalid reset link. No token provided.');
      return;
    }
    
    setToken(urlToken);
    
    // Fetch username from backend using token
    fetchUsernameFromToken(urlToken);
  }, [searchParams]);

  const fetchUsernameFromToken = async (token: string) => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`${ENV.BACKEND_URL}/validate-reset-token?token=${token}`);
      
      if (response.ok) {
        const data = await response.json();
        setUsername(data.username);
        setIsLoading(false);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Invalid or expired reset token.');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Failed to validate reset token.');
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.newPassword || !formData.confirmPassword) {
      setError('All fields are required.');
      return false;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }

    if (formData.newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${ENV.BACKEND_URL}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: token,
          new_password: formData.newPassword
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Navigate directly to browse page instead of showing success modal
        router.push('/browse');
      } else {
        setError(data.detail || "Password reset failed. Please try again.");
      }
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-8">
        {/* Back Button */}
        <button
          onClick={handleBackToLogin}
          className="mb-6 flex items-center text-white hover:text-blue-400 transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Login
        </button>

        {/* Main Form Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 shadow-lg">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-semibold text-white mb-2">Reset Your Password</h2>
            <p className="text-gray-400">
              {isLoading ? 'Validating reset token...' : 
               username ? `Resetting password for: ${username}` : 
               'Enter your new password below'}
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Username Display (if available) */}
            {username && (
              <div className="flex items-center">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-900 border border-gray-600 rounded-l-md flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={username}
                  disabled
                  className="flex-1 px-5 h-12 bg-gray-600 border border-gray-600 border-l-0 rounded-r-md text-gray-300 cursor-not-allowed"
                  placeholder="Username"
                />
              </div>
            )}

            {/* New Password Field */}
            <div className="flex items-center">
              <div className="flex-shrink-0 w-12 h-12 bg-gray-900 border border-gray-600 rounded-l-md flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                required
                className="flex-1 px-5 h-12 bg-gray-700 border border-gray-600 border-l-0 rounded-r-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 leading-none"
                placeholder="New password (min 8 characters)"
              />
            </div>

            {/* Confirm Password Field */}
            <div className="flex items-center">
              <div className="flex-shrink-0 w-12 h-12 bg-gray-900 border border-gray-600 rounded-l-md flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="flex-1 px-5 h-12 bg-gray-700 border border-gray-600 border-l-0 rounded-r-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 leading-none"
                placeholder="Confirm new password"
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

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !token || !username}
              className="w-full px-6 py-3 text-white text-base font-semibold rounded-md shadow transition-all duration-300 hover:animate-gradient-shift disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
                backgroundSize: '400% 400%',
                backgroundPosition: '0% 50%'
              }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.animation = 'gradient-shift 3s ease infinite';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.animation = '';
              }}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Resetting Password...
                </div>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
