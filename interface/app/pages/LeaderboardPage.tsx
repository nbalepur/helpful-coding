"use client";

import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ENV } from "../config/env";
import { LEADERBOARD_FILTERED_USERNAMES } from "../config/tasks";
import { ChevronUp, ChevronDown, Info, ExternalLink } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  average_rating: number;
  submission_count: number;
  overall_score: number;
}

interface ProjectLeaderboardRow {
  project_id: number;
  task_slug: string;
  /** Canonical id for /vibe?task= (matches tasks-db task id). */
  task_route_id?: string;
  title: string;
  description_preview: string;
  submission_count: number;
  total_vote_records: number;
  rated_submissions: number;
  average_rating: number | null;
  best_score: number | null;
  voting_start_date: string | null;
  voting_end_date: string | null;
}

type SortField = "username" | "average_rating" | "submission_count";
type SortDirection = "asc" | "desc";

type ProjectSortField =
  | "title"
  | "submission_count"
  | "total_vote_records"
  | "average_rating"
  | "best_score";

const tabButtonClass = (active: boolean) =>
  `text-base font-medium transition-all duration-200 relative bg-transparent border-none outline-none shadow-none py-2 px-1 cursor-pointer hover:bg-transparent hover:-translate-y-0.5 focus-visible:ring-0 focus-visible:ring-offset-0 after:content-[''] after:absolute after:bottom-1 after:left-0 after:w-full after:h-px after:bg-blue-400 after:transition-opacity after:duration-200 ${
    active
      ? "text-blue-400 after:opacity-100"
      : "text-gray-400 hover:text-blue-400 after:opacity-0 hover:after:opacity-100"
  }`;

/** Opens /vibe?task=… via router (fixes flaky Next <Link> clicks from table/useMemo trees). */
function ProjectTaskTitleLink({
  taskRouteId,
  title,
}: {
  /** Must match tasks-db task id (slugified project name). */
  taskRouteId: string;
  title: string;
}) {
  const router = useRouter();
  const href = `/vibe?task=${encodeURIComponent(taskRouteId)}`;

  return (
    <a
      href={href}
      className="group relative z-10 inline-flex max-w-full cursor-pointer items-center gap-1.5 text-left text-white font-medium hover:text-blue-400 focus-visible:outline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded-sm"
      onClick={(e) => {
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.push(href);
      }}
    >
      <span className="min-w-0 truncate underline decoration-transparent underline-offset-2 transition-colors group-hover:decoration-blue-400/60">
        {title}
      </span>
      <ExternalLink
        size={14}
        strokeWidth={2.25}
        className="shrink-0 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </a>
  );
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [mainTab, setMainTab] = useState<"users" | "projects">("projects");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("average_rating");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [projectRows, setProjectRows] = useState<ProjectLeaderboardRow[]>([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectSortField, setProjectSortField] =
    useState<ProjectSortField>("submission_count");
  const [projectSortDirection, setProjectSortDirection] =
    useState<SortDirection>("desc");
  // Generate animated dots only on client side to avoid hydration mismatch
  const [animatedDots, setAnimatedDots] = useState<Array<{
    color: string;
    size: number;
    top: number;
    duration: number;
    delay: number;
    direction: 'left-to-right' | 'right-to-left';
    opacity: number;
  }>>([]);

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

  const fetchProjectLeaderboard = useCallback(async () => {
    try {
      setProjectLoading(true);
      const response = await fetch(`${ENV.BACKEND_URL}/api/leaderboard/projects`);
      if (!response.ok) {
        throw new Error(`Failed to fetch project stats: ${response.status}`);
      }
      const data = await response.json();
      setProjectRows(Array.isArray(data) ? data : []);
      setProjectError(null);
    } catch (err) {
      console.error("Error fetching project leaderboard:", err);
      setProjectError(
        err instanceof Error ? err.message : "Failed to load project stats"
      );
    } finally {
      setProjectLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab !== "projects") return;
    fetchProjectLeaderboard();
  }, [mainTab, fetchProjectLeaderboard]);

  // Generate animated dots only on client side
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
    const dots = Array.from({ length: 12 }, () => ({
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      top: Math.random() * 100,
      duration: Math.random() * 30 + 40, // 40-70 seconds
      delay: Math.random() * 5, // 0-5 seconds delay
      direction: (Math.random() > 0.5 ? 'left-to-right' : 'right-to-left') as 'left-to-right' | 'right-to-left',
      opacity: Math.random() * 0.6 + 0.4,
    }));
    setAnimatedDots(dots);
  }, []);

  // Filter and sort the leaderboard
  const filteredAndSorted = useMemo(() => {
    let filtered = leaderboard;

    // Filter out excluded usernames
    if (LEADERBOARD_FILTERED_USERNAMES.length > 0) {
      const excludedSet = new Set(LEADERBOARD_FILTERED_USERNAMES.map((u) => u.toLowerCase()));
      filtered = filtered.filter((entry) => !excludedSet.has(entry.username.toLowerCase()));
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((entry) =>
        entry.username.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortField) {
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

  const projectsFilteredSorted = useMemo(() => {
    let rows = [...projectRows];
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.task_slug.toLowerCase().includes(q)
      );
    }
    const dir = projectSortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (projectSortField) {
        case "title":
          av = a.title.toLowerCase();
          bv = b.title.toLowerCase();
          break;
        case "submission_count":
          av = a.submission_count;
          bv = b.submission_count;
          break;
        case "total_vote_records":
          av = a.total_vote_records;
          bv = b.total_vote_records;
          break;
        case "average_rating":
          av = a.average_rating ?? -1;
          bv = b.average_rating ?? -1;
          break;
        case "best_score":
          av = a.best_score ?? -1;
          bv = b.best_score ?? -1;
          break;
        default:
          return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [
    projectRows,
    projectSearch,
    projectSortField,
    projectSortDirection,
  ]);

  /** Totals for visible project rows (respects search filter). */
  const projectTableTotals = useMemo(() => {
    const rows = projectsFilteredSorted;
    if (rows.length === 0) return null;
    let submissions = 0;
    let votes = 0;
    let weightedRatingSum = 0;
    let ratedSubmissionsSum = 0;
    let maxBest: number | null = null;
    for (const r of rows) {
      submissions += r.submission_count;
      votes += r.total_vote_records;
      if (r.average_rating != null && r.rated_submissions > 0) {
        weightedRatingSum += r.average_rating * r.rated_submissions;
        ratedSubmissionsSum += r.rated_submissions;
      }
      if (r.best_score != null) {
        maxBest =
          maxBest == null ? r.best_score : Math.max(maxBest, r.best_score);
      }
    }
    const weightedAvg =
      ratedSubmissionsSum > 0 ? weightedRatingSum / ratedSubmissionsSum : null;
    return { submissions, votes, weightedAvg, maxBest };
  }, [projectsFilteredSorted]);

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

  const handleProjectSort = (field: ProjectSortField) => {
    if (projectSortField === field) {
      setProjectSortDirection(
        projectSortDirection === "asc" ? "desc" : "asc"
      );
    } else {
      setProjectSortField(field);
      setProjectSortDirection(
        field === "title" ? "asc" : "desc"
      );
    }
  };

  const ProjectSortIcon = ({ field }: { field: ProjectSortField }) => {
    if (projectSortField !== field) {
      return (
        <span className="inline-flex items-center justify-center w-4 h-4 opacity-30">
          <ChevronUp size={16} />
        </span>
      );
    }
    return projectSortDirection === "asc" ? (
      <ChevronUp size={16} className="text-blue-400" />
    ) : (
      <ChevronDown size={16} className="text-blue-400" />
    );
  };

  const [infoOpenId, setInfoOpenId] = useState<number | null>(null);

  const projectTaskImageSrc = (row: ProjectLeaderboardRow) =>
    row.task_slug.trim().toLowerCase() === "playground"
      ? "/task_images/playground.png"
      : `/task_images/${row.task_slug}.png`;

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-8 relative">
      {/* Space Theme with Jam-Colored Stars */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Large stars */}
        {[...Array(20)].map((_, i) => {
          const colors = ['#3b82f6', '#8b5cf6', '#ec4899'];
          const color = colors[Math.floor(Math.random() * colors.length)];
          const size = Math.random() * 4 + 2;
          const left = Math.random() * 100;
          const top = Math.random() * 100;
          const opacity = Math.random() * 0.6 + 0.4;
          
          return (
            <div
              key={`star-${i}`}
              className="absolute rounded-full"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${left}%`,
                top: `${top}%`,
                backgroundColor: color,
                opacity: opacity,
                boxShadow: `0 0 ${size * 2}px ${color}, 0 0 ${size * 4}px ${color}`,
              }}
            />
          );
        })}
        
        {/* Medium stars */}
        {[...Array(40)].map((_, i) => {
          const colors = ['#3b82f6', '#8b5cf6', '#ec4899'];
          const color = colors[Math.floor(Math.random() * colors.length)];
          const size = Math.random() * 2 + 1;
          const left = Math.random() * 100;
          const top = Math.random() * 100;
          const opacity = Math.random() * 0.5 + 0.3;
          
          return (
            <div
              key={`medium-${i}`}
              className="absolute rounded-full"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${left}%`,
                top: `${top}%`,
                backgroundColor: color,
                opacity: opacity,
                boxShadow: `0 0 ${size * 1.5}px ${color}`,
              }}
            />
          );
        })}
        
        {/* Small twinkling dots */}
        {[...Array(100)].map((_, i) => {
          const colors = ['#3b82f6', '#8b5cf6', '#ec4899'];
          const color = colors[Math.floor(Math.random() * colors.length)];
          const size = Math.random() * 1.5 + 0.5;
          const left = Math.random() * 100;
          const top = Math.random() * 100;
          const opacity = Math.random() * 0.4 + 0.2;
          
          return (
            <div
              key={`dot-${i}`}
              className="absolute rounded-full"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${left}%`,
                top: `${top}%`,
                backgroundColor: color,
                opacity: opacity,
              }}
            />
          );
        })}
        
        {/* Animated jam-like dots moving across screen */}
        {animatedDots.map((dot, i) => (
          <div
            key={`animated-dot-${i}`}
            className="absolute rounded-full"
            style={{
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              top: `${dot.top}%`,
              left: dot.direction === 'left-to-right' ? '-20px' : 'calc(100% + 20px)',
              backgroundColor: dot.color,
              opacity: dot.opacity,
              boxShadow: `0 0 ${dot.size * 1.5}px ${dot.color}, 0 0 ${dot.size * 3}px ${dot.color}`,
              animation: `moveAcross${dot.direction === 'left-to-right' ? 'Right' : 'Left'} ${dot.duration}s linear ${dot.delay}s infinite`,
            }}
          />
        ))}
      </div>
      
      <div className="relative z-10 w-full flex flex-col items-center">
        <h1 className="text-4xl font-semibold text-white mb-2">Leaderboard</h1>
        <p className="text-gray-400 text-base mb-5 text-center max-w5xl px-4">
          Compare participants or see how each project is doing. Top participants may be eligible for{" "}
          <Link href="/about" className="text-blue-400 hover:text-blue-300 underline">
            extra compensation
          </Link>
          .
        </p>
        <div className="w-full max-w-7xl px-8">
          <div className="flex flex-wrap items-end justify-start gap-x-8">
            <button
              type="button"
              className={tabButtonClass(mainTab === "projects")}
              onClick={() => setMainTab("projects")}
            >
              By project
            </button>
            <button
              type="button"
              className={tabButtonClass(mainTab === "users")}
              onClick={() => setMainTab("users")}
            >
              By participant
            </button>
          </div>
          <div
            className="h-px w-full bg-gray-700/60 mt-2 mb-6"
            aria-hidden
          />
          {mainTab === "users" && (
            <>
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
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search by username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-8">
                    <table className="w-full">
                      <thead className="bg-gray-900">
                        <tr>
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
                            <td
                              colSpan={3}
                              className="px-6 py-8 text-center text-gray-400"
                            >
                              No users found matching your search.
                            </td>
                          </tr>
                        ) : (
                          filteredAndSorted.map((entry) => (
                            <tr
                              key={entry.user_id}
                              className="hover:bg-gray-750 transition-colors"
                            >
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-white font-medium">
                                  {entry.username}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-blue-400 font-semibold">
                                  {entry.average_rating > 0
                                    ? entry.average_rating.toFixed(2)
                                    : "N/A"}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-gray-300">
                                  {entry.submission_count}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {mainTab === "projects" && (
            <>
              {projectLoading ? (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
                  <p className="text-gray-400">Loading project stats...</p>
                </div>
              ) : projectError ? (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
                  <p className="text-red-400">Error: {projectError}</p>
                  <button
                    type="button"
                    onClick={() => fetchProjectLeaderboard()}
                    className="mt-4 text-base font-medium text-blue-400 hover:text-blue-300 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : projectRows.length === 0 ? (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
                  <p className="text-gray-400">
                    No open-ended projects found.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-8 overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse">
                      <thead className="bg-gray-900">
                        <tr>
                          <th
                            className="px-4 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors min-w-[200px]"
                            onClick={() => handleProjectSort("title")}
                          >
                            <div className="flex items-center gap-2">
                              Project
                              <ProjectSortIcon field="title" />
                            </div>
                          </th>
                          <th
                            className="px-4 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                            onClick={() =>
                              handleProjectSort("submission_count")
                            }
                          >
                            <div className="flex items-center gap-2">
                              Submissions
                              <ProjectSortIcon field="submission_count" />
                            </div>
                          </th>
                          <th
                            className="px-4 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                            onClick={() =>
                              handleProjectSort("total_vote_records")
                            }
                          >
                            <div className="flex items-center gap-2">
                              Votes cast
                              <ProjectSortIcon field="total_vote_records" />
                            </div>
                          </th>
                          <th
                            className="px-4 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                            onClick={() => handleProjectSort("average_rating")}
                          >
                            <div className="flex items-center gap-2">
                              Avg rating
                              <ProjectSortIcon field="average_rating" />
                            </div>
                          </th>
                          <th
                            className="px-4 py-4 text-left text-sm font-semibold text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-800 transition-colors"
                            onClick={() => handleProjectSort("best_score")}
                          >
                            <div className="flex items-center gap-2">
                              Best score
                              <ProjectSortIcon field="best_score" />
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700">
                        {projectsFilteredSorted.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-6 py-8 text-center text-gray-400"
                            >
                              No projects match your search.
                            </td>
                          </tr>
                        ) : (
                          <>
                            {projectsFilteredSorted.map((row) => {
                              const open = infoOpenId === row.project_id;
                              const taskImageSrc = projectTaskImageSrc(row);
                              const routeId =
                                row.task_route_id ||
                                row.task_slug
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]+/g, "-")
                                  .replace(/^-|-$/g, "");
                              const isPlatformer =
                                row.title.trim().toLowerCase() ===
                                  "platformer" ||
                                row.task_slug.trim().toLowerCase() ===
                                  "platformer";

                              return (
                                <Fragment key={row.project_id}>
                                  <tr className="hover:bg-gray-800/50 transition-colors duration-200">
                                    <td className="relative z-10 px-4 py-3 align-middle">
                                      <div className="flex items-center gap-2 sm:gap-2.5">
                                        <button
                                          type="button"
                                          aria-expanded={open}
                                          aria-controls={`project-detail-${row.project_id}`}
                                          aria-label={
                                            open
                                              ? `Hide details for ${row.title}`
                                              : `Show preview and description for ${row.title}`
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setInfoOpenId(
                                              open ? null : row.project_id
                                            );
                                          }}
                                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 ${
                                            open
                                              ? "bg-blue-500/25 text-blue-300"
                                              : "bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-blue-400"
                                          }`}
                                        >
                                          <motion.span
                                            key={open ? "up" : "info"}
                                            initial={{ scale: 0.9, opacity: 0.7 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{
                                              type: "spring",
                                              stiffness: 400,
                                              damping: 26,
                                            }}
                                            className="flex items-center justify-center"
                                          >
                                            {open ? (
                                              <ChevronUp
                                                size={15}
                                                strokeWidth={2.25}
                                              />
                                            ) : (
                                              <Info size={15} strokeWidth={2} />
                                            )}
                                          </motion.span>
                                        </button>
                                        <div className="min-w-0 flex-1 leading-none">
                                          {isPlatformer ? (
                                            <span className="text-white font-medium">
                                              {row.title}
                                            </span>
                                          ) : (
                                            <ProjectTaskTitleLink
                                              taskRouteId={routeId}
                                              title={row.title}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-300 tabular-nums align-middle">
                                      {row.submission_count}
                                    </td>
                                    <td className="px-4 py-3 text-gray-300 tabular-nums align-middle">
                                      {row.total_vote_records}
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                      <span className="text-blue-400 font-semibold tabular-nums">
                                        {row.average_rating != null
                                          ? row.average_rating.toFixed(2)
                                          : "—"}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                      <span className="text-amber-400 font-semibold tabular-nums">
                                        {row.best_score != null
                                          ? row.best_score.toFixed(2)
                                          : "—"}
                                      </span>
                                    </td>
                                  </tr>
                                  <AnimatePresence initial={false}>
                                    {open && (
                                      <motion.tr
                                        key={`detail-${row.project_id}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="bg-[#0c1528]"
                                      >
                                        <td
                                          id={`project-detail-${row.project_id}`}
                                          colSpan={5}
                                          className="border-0 border-t border-blue-950/80 bg-[#0c1528] p-0 outline-none"
                                        >
                                          <motion.div
                                            initial={{
                                              maxHeight: 0,
                                              opacity: 0,
                                            }}
                                            animate={{
                                              maxHeight: 1600,
                                              opacity: 1,
                                            }}
                                            exit={{
                                              maxHeight: 0,
                                              opacity: 0,
                                            }}
                                            transition={{
                                              maxHeight: {
                                                duration: 0.45,
                                                ease: [0.33, 1, 0.68, 1],
                                              },
                                              opacity: {
                                                duration: 0.22,
                                              },
                                            }}
                                            className="overflow-hidden bg-[#0c1528]"
                                          >
                                            <div className="flex w-full flex-col gap-6 bg-[#0c1528] px-5 py-6 sm:flex-row sm:items-start sm:gap-8 sm:px-8 sm:py-8">
                                              <motion.div
                                                initial={{
                                                  scale: 0.92,
                                                  opacity: 0,
                                                  y: 12,
                                                }}
                                                animate={{
                                                  scale: 1,
                                                  opacity: 1,
                                                  y: 0,
                                                }}
                                                transition={{
                                                  type: "spring",
                                                  stiffness: 380,
                                                  damping: 28,
                                                  delay: 0.06,
                                                }}
                                                className="mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-blue-900/60 bg-[#0a1222] sm:mx-0 sm:h-32 sm:w-32"
                                              >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                  src={taskImageSrc}
                                                  alt=""
                                                  className="h-full w-full object-cover"
                                                  onError={(e) => {
                                                    (
                                                      e.target as HTMLImageElement
                                                    ).src = "/toast.png";
                                                  }}
                                                />
                                              </motion.div>
                                              <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
                                                <motion.p
                                                  initial={{
                                                    opacity: 0,
                                                    y: 8,
                                                  }}
                                                  animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                  }}
                                                  transition={{
                                                    duration: 0.35,
                                                    delay: 0.1,
                                                    ease: [0.22, 1, 0.36, 1],
                                                  }}
                                                  className="w-full text-base leading-relaxed text-gray-100 whitespace-pre-wrap sm:text-lg sm:leading-relaxed"
                                                >
                                                  {row.description_preview ||
                                                    "No description available."}
                                                </motion.p>
                                                {!isPlatformer && (
                                                  <motion.div
                                                    initial={{
                                                      opacity: 0,
                                                      y: 6,
                                                    }}
                                                    animate={{
                                                      opacity: 1,
                                                      y: 0,
                                                    }}
                                                    transition={{
                                                      delay: 0.18,
                                                      duration: 0.3,
                                                    }}
                                                  >
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        router.push(
                                                          `/vibe?task=${encodeURIComponent(routeId)}`
                                                        )
                                                      }
                                                      className="rounded-md border border-gray-500/90 bg-transparent px-2.5 py-1 text-xs font-normal text-gray-200 transition-colors hover:bg-gray-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                                                    >
                                                      Open task
                                                    </button>
                                                  </motion.div>
                                                )}
                                              </div>
                                            </div>
                                          </motion.div>
                                        </td>
                                      </motion.tr>
                                    )}
                                  </AnimatePresence>
                                </Fragment>
                              );
                            })}
                            {projectTableTotals && (
                              <tr
                                key="project-table-totals"
                                className="bg-gray-900/95 border-t-2 border-gray-600 font-semibold"
                              >
                                <td className="px-4 py-3 text-gray-200">
                                  Total
                                </td>
                                <td className="px-4 py-3 text-gray-200 tabular-nums">
                                  {projectTableTotals.submissions.toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-gray-200 tabular-nums">
                                  {projectTableTotals.votes.toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-blue-400 tabular-nums">
                                    {projectTableTotals.weightedAvg != null
                                      ? projectTableTotals.weightedAvg.toFixed(
                                          2
                                        )
                                      : "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-amber-400 tabular-nums">
                                    {projectTableTotals.maxBest != null
                                      ? projectTableTotals.maxBest.toFixed(2)
                                      : "—"}
                                  </span>
                                </td>
                              </tr>
                            )}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

