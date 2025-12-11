"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ENV } from "../config/env";
import { ChevronUp, ChevronDown } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  average_rating: number;
  submission_count: number;
  overall_score: number;
}

type SortField = "rank" | "username" | "average_rating" | "submission_count";
type SortDirection = "asc" | "desc";

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${ENV.BACKEND_URL}/api/leaderboard`);
        if (!response.ok) {
          throw new Error(`Failed to fetch leaderboard: ${response.status}`);
        }
        const data = await response.json();
        setLeaderboard(data);
        setError(null);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  // Filter and sort the leaderboard
  const filteredAndSorted = useMemo(() => {
    let filtered = leaderboard;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = leaderboard.filter((entry) =>
        entry.username.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortField) {
        case "rank":
          aValue = a.rank;
          bValue = b.rank;
          break;
        case "username":
          aValue = a.username.toLowerCase();
          bValue = b.username.toLowerCase();
          break;
        case "average_rating":
          aValue = a.average_rating;
          bValue = b.average_rating;
          break;
        case "submission_count":
          aValue = a.submission_count;
          bValue = b.submission_count;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [leaderboard, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new field with ascending as default
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <span className="inline-flex items-center justify-center w-4 h-4 opacity-30">
          <ChevronUp size={16} />
        </span>
      );
    }
    return sortDirection === "asc" ? (
      <ChevronUp size={16} className="text-blue-400" />
    ) : (
      <ChevronDown size={16} className="text-blue-400" />
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-8">
      <h1 className="text-4xl font-semibold text-white mb-2">Leaderboard</h1>
      <p className="text-gray-400 text-base mb-8">
        Check out your performance on Vibe Jam! The top-performing users will be eligible for{" "}
        <Link href="/about" className="text-blue-400 hover:text-blue-300 underline">
          extra compensation
        </Link>
        .
      </p>
      <div className="w-full max-w-4xl">
        {loading ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
            <p className="text-gray-400">Loading leaderboard...</p>
          </div>
        ) : error ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
            <p className="text-red-400">Error: {error}</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
            <p className="text-gray-400">No leaderboard data available yet.</p>
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-900">
                  <tr>
                    <th
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => handleSort("rank")}
                    >
                      <div className="flex items-center gap-2">
                        Overall Rank
                        <SortIcon field="rank" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => handleSort("username")}
                    >
                      <div className="flex items-center gap-2">
                        Player
                        <SortIcon field="username" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => handleSort("average_rating")}
                    >
                      <div className="flex items-center gap-2">
                        Average Rating
                        <SortIcon field="average_rating" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                      onClick={() => handleSort("submission_count")}
                    >
                      <div className="flex items-center gap-2">
                        # Submissions
                        <SortIcon field="submission_count" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredAndSorted.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSorted.map((entry) => (
                      <tr key={entry.user_id} className="hover:bg-gray-750 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-lg font-bold ${
                            entry.rank === 1 ? 'text-yellow-400' :
                            entry.rank === 2 ? 'text-gray-300' :
                            entry.rank === 3 ? 'text-amber-600' :
                            'text-gray-400'
                          }`}>
                            #{entry.rank}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-white font-medium">{entry.username}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-blue-400 font-semibold">
                            {entry.average_rating > 0 ? entry.average_rating.toFixed(2) : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-gray-300">{entry.submission_count}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

