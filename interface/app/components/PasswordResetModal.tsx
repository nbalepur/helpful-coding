"use client";
import { useState } from "react";
import { ENV } from "../config/env";

interface PasswordResetModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PasswordResetModal({ onSuccess, onCancel }: PasswordResetModalProps) {
  const [formData, setFormData] = useState({
    username_or_email: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error and success message when user starts typing
    if (error) setError("");
    if (successMessage) setSuccessMessage("");
  };

  const validateForm = () => {
    if (!formData.username_or_email) {
      setError("Username or email is required.");
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
    setError("");

    try {
      const response = await fetch(`${ENV.BACKEND_URL}/send-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username_or_email: formData.username_or_email
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccessMessage("Password Reset Email Sent!");
      } else {
        // Handle specific error cases
        if (response.status === 404) {
          setError("No account found with that username or email address. Please check your input and try again.");
        } else {
          setError(data.detail || "Failed to send reset email. Please try again.");
        }
      }
    } catch (err) {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg my-8">
        {/* Back Button */}
        <button
          onClick={onCancel}
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
            <h2 className="text-3xl font-semibold text-white mb-2" style={{textAlign: 'center'}}>Reset Your Password</h2>
            <p className="text-gray-400">Enter your username or email to receive a reset link</p>
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
                placeholder="Username or email address"
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

            {/* Success Message */}
            {successMessage && (
              <div className="text-center">
                <p className="text-green-400 text-sm font-medium">{successMessage}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3 text-white text-base font-semibold rounded-md shadow transition-all duration-300 hover:animate-gradient-shift disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(-45deg, #3b82f6, #06b6d4, #8b5cf6, #ec4899, #f59e0b)',
                backgroundSize: '400% 400%',
                backgroundPosition: '0% 50%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.animation = 'gradient-shift 3s ease infinite';
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
                  Sending Reset Email...
                </div>
              ) : (
                "Send Reset Email"
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
              Remember your password?{" "}
              <button
                onClick={onCancel}
                className="text-white hover:text-blue-400 font-medium transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
              >
                Back to Login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
