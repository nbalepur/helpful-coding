"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../utils/auth";
import { ENV } from "../config/env";

type SubmissionRatingSummary = {
  average: number | null;
  count: number;
  perMetric: Record<string, number>;
};

type SubmissionCard = {
  id: number;
  title: string;
  description?: string | null;
  image?: string | null;
  projectId: number;
  userId: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  code?: Record<string, string>;
  ratingSummary?: SubmissionRatingSummary | null;
};

type UserSubmissionsResponse = {
  items: SubmissionCard[];
  count: number;
};

const FALLBACK_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="#1f2937"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-size="20" font-family="monospace">
      No Preview
    </text>
  </svg>`
)}`;

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Unknown date";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
};

const renderStars = (average: number): JSX.Element[] => {
  const stars: JSX.Element[] = [];
  for (let i = 1; i <= 5; i += 1) {
    let starClass = "text-yellow-400";
    if (average >= i) {
      starClass = "text-yellow-400";
    } else if (average >= i - 0.5) {
      starClass = "text-yellow-400 opacity-50";
    } else {
      starClass = "text-gray-500 opacity-30";
    }
    stars.push(
      <span key={i} className={starClass} style={{ fontSize: "13px" }}>
        ★
      </span>
    );
  }
  return stars;
};

const UserSubmissions = () => {
  const { user } = useAuth();
  const numericUserId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;
  const [submissions, setSubmissions] = useState<SubmissionCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!numericUserId) {
      setSubmissions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${ENV.BACKEND_URL}/api/users/${numericUserId}/submissions`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load submissions (status ${response.status})`);
      }

      const data: UserSubmissionsResponse = await response.json();
      setSubmissions(data.items || []);
    } catch (err: any) {
      console.error("[UserSubmissions] failed to fetch submissions", err);
      setError(err?.message || "Failed to load submissions.");
      setSubmissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [numericUserId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  if (!numericUserId) {
    return (
      <div className="text-center text-gray-400 p-8">
        <p>Please sign in to view your submissions.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center text-gray-400 p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-4"></div>
        <p>Loading your submissions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-400 p-8">
        <p>{error}</p>
        <button
          onClick={fetchSubmissions}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center text-gray-400 p-8">
        <h3 className="text-lg font-semibold mb-2">Your Submissions</h3>
        <p>You haven't submitted any projects yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-200">Your Submissions</h3>
      <p className="text-sm text-gray-400 mb-4">
        Showing your most recent submission for each project.
      </p>
      <div className="space-y-4">
        {submissions.map((submission) => (
          <div
            key={submission.id}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
          >
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <img
                  src={submission.image || FALLBACK_IMAGE}
                  alt={submission.title}
                  className="w-32 h-20 object-cover rounded border border-gray-700"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-semibold text-gray-200 mb-1 truncate">
                  {submission.title}
                </h4>
                {submission.description && (
                  <p className="text-sm text-gray-400 mb-2 line-clamp-2">
                    {submission.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Submitted: {formatDate(submission.createdAt)}</span>
                  {submission.ratingSummary && submission.ratingSummary.count > 0 && submission.ratingSummary.average !== null && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium text-gray-400">{submission.ratingSummary.average.toFixed(1)}</span>
                      <span className="flex items-center gap-0.5">{renderStars(submission.ratingSummary.average)}</span>
                      <span className="text-gray-500">({submission.ratingSummary.count})</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserSubmissions;

