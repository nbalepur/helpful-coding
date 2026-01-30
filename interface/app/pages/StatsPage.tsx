"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../utils/auth";
import { useUserStudyPopup } from "../components/UserStudyPopup";
import { ENV } from "../config/env";
import { POST_TEST_REQUIRED_TASKS } from "../config/tasks";
import LoadingSpinner from "../components/LoadingSpinner";
import { Trophy, Code, CheckCircle, Star, Sparkles, BarChart3, ThumbsUp, Lightbulb, HelpCircle } from "lucide-react";
import { LineChart, Line, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Tooltip descriptions for each plot - edit these to update the info bubble text
const PLOT_DESCRIPTIONS = {
  htmlCssJs: "Based on your answers to multiple-choice questions on knowledge, code tracing, etc.",
  ux: "Based on your answers to multiple-choice questions on website design practices",
  passRate: "Based on the proportion of times passed all test cases for no-AI coding problems",
  timeTaken: "Based on the time taken to pass all test cases (only if you did pass) for no-AI coding problems",
  perceivedComprehension: "Based on your 1-5 comprehension scores you self-reported during submission",
  trueComprehension: "Based on your answers to questions generated from your code during submission",
} as const;

interface UserStats {
  totalSubmissions: number;
  completedRequiredTasks: number;
  averageRating: number;
  numVotes: number;
  votesPerProject: Array<{
    project_id: number;
    project_name: string;
    num_votes: number;
  }>;
  aiStats: {
    num_prompts: number;
    total_lines_generated: number;
    llm_ideas_used: number;
  };
  mcqaAccuracy: {
    frontend: Array<{
      phase: string;
      accuracy: number;
      correct: number;
      total: number;
      timestamp: string | null;
      question_category?: "all" | "html" | "css" | "js" | "other";
    }>;
    ux: Array<{
      phase: string;
      accuracy: number;
      correct: number;
      total: number;
      timestamp: string | null;
    }>;
  };
  codingPerformance: {
    from_scratch: Array<{
      name: string;
      score: number;
      test_project_id: string;
      time_taken_seconds: number;
      timestamp: string;
    }>;
    debug: Array<{
      name: string;
      score: number;
      test_project_id: string;
      time_taken_seconds: number;
      timestamp: string;
    }>;
    combined: Array<{
      name: string;
      score: number;
      test_project_id: string;
      time_taken_seconds: number;
      timestamp: string;
    }>;
  };
  comprehensionScores: {
    avg_mcqa: number | null;
    avg_multi_select: number | null;
    mcqa_count: number;
    multi_select_count: number;
    per_project?: Array<{
      project_id: number;
      project_name: string;
      avg_mcqa: number | null;
      avg_multi_select: number | null;
      mcqa_count: number;
      multi_select_count: number;
    }>;
  };
}

// Helper function to convert phase-based data to time-based plotting
// Keeps the phase grouping but uses earliest timestamp for x-axis positioning
function convertPhaseToTimeBased<T extends { timestamp: string | null; phase: string; question_category?: string }>(
  data: T[],
  getValue: (item: T) => number
): Array<{ timeLabel: string; value: number; timestamp: string; phase: string; question_category?: string }> {
  // Filter out items without timestamps
  type ItemWithTime = T & { timestamp: string };
  const itemsWithTime: ItemWithTime[] = data
    .filter((item): item is ItemWithTime => item.timestamp !== null && item.timestamp !== "");
  
  if (itemsWithTime.length === 0) {
    return [];
  }
  
  // Sort by timestamp to plot chronologically
  itemsWithTime.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Convert to chart data format
  return itemsWithTime.map(item => {
    const date = new Date(item.timestamp);
    const timeLabel = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    return {
      timeLabel,
      value: getValue(item),
      timestamp: item.timestamp,
      phase: item.phase,
      question_category: item.question_category
    };
  });
}

// Helper function to convert coding performance data (per-question) to aggregated phase-based data for plotting
function convertCodingPerformanceToTimeBased(
  data: Array<{ name: string; score: number; test_project_id: string; time_taken_seconds: number; timestamp: string }>,
  getValue: (item: { name: string; score: number; test_project_id: string; time_taken_seconds: number; timestamp: string }) => number,
  isTimeCalculation: boolean = false
): Array<{ timeLabel: string; value: number; timestamp: string; phase: string }> {
  if (data.length === 0) {
    return [];
  }
  
  // For time calculations, only consider questions that passed (score > 0)
  const filteredData = isTimeCalculation 
    ? data.filter(item => item.score > 0)
    : data; // For pass rate, include all questions (including score = 0)
  
  if (filteredData.length === 0) {
    return [];
  }
  
  // Debug logging
  console.log(`convertCodingPerformanceToTimeBased: isTimeCalculation=${isTimeCalculation}, input data length=${data.length}, filtered length=${filteredData.length}`);
  console.log('Sample items:', filteredData.slice(0, 3));
  
  // Group by test_project_id (phase) and calculate averages
  const phaseGroups = new Map<string, Array<{ name: string; score: number; test_project_id: string; time_taken_seconds: number; timestamp: string }>>();
  
  for (const item of filteredData) {
    const phase = item.test_project_id;
    if (!phaseGroups.has(phase)) {
      phaseGroups.set(phase, []);
    }
    phaseGroups.get(phase)!.push(item);
  }
  
  // Convert each phase group to a data point
  const result: Array<{ timeLabel: string; value: number; timestamp: string; phase: string }> = [];
  
  for (const [phase, items] of phaseGroups.entries()) {
    // Calculate average value for this phase
    const avgValue = items.reduce((sum, item) => sum + getValue(item), 0) / items.length;
    
    // Find earliest timestamp for this phase
    const timestamps = items
      .map(item => item.timestamp)
      .filter(ts => ts && ts !== "")
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // For pass rate, we should plot even if there are no timestamps (use phase as fallback)
    // For time, we need timestamps (only passed questions have them)
    if (timestamps.length === 0) {
      if (isTimeCalculation) {
        continue; // Skip phases without timestamps for time calculations
      } else {
        // For pass rate, use phase name as label if no timestamp available
        result.push({
          timeLabel: phase === 'pre' ? 'Pre-test' : phase === 'post' ? 'Post-test' : phase,
          value: avgValue,
          timestamp: new Date().toISOString(), // Use current date as fallback for sorting
          phase
        });
        continue;
      }
    }
    
    const earliestTimestamp = timestamps[0];
    const date = new Date(earliestTimestamp);
    const timeLabel = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    result.push({
      timeLabel,
      value: avgValue,
      timestamp: earliestTimestamp,
      phase
    });
  }
  
  // Sort by timestamp
  result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  return result;
}

// Info bubble component with tooltip
function InfoBubble({ text }: { text: string }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative inline-block ml-2">
      <HelpCircle
        className="w-4 h-4 text-gray-400 hover:text-gray-300 cursor-help transition-colors"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute left-1/2 bottom-full mb-2 transform -translate-x-1/2 z-50 pointer-events-none w-96">
          <div className="bg-white text-black text-xs font-normal rounded-lg px-3 py-2 shadow-lg border border-gray-300 whitespace-normal">
            {text}
            <div className="absolute left-1/2 top-full transform -translate-x-1/2 -mt-1">
              <div className="w-2 h-2 bg-white border-r border-b border-gray-300 transform rotate-45"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Interactive line chart using Recharts
function SimpleLineChart({ 
  data, 
  label, 
  color = "#3b82f6",
  formatValue,
  maxValue: customMaxValue,
  infoText
}: { 
  data: Array<{ timeLabel: string; value: number; timestamp: string; phase?: string }>; 
  label: string; 
  color?: string;
  formatValue?: (value: number) => string;
  maxValue?: number;
  infoText?: string;
}) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [activePointKey, setActivePointKey] = useState<string | null>(null);
  const format = formatValue || ((v: number) => v.toFixed(1));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No data available
      </div>
    );
  }

  const maxValue = customMaxValue !== undefined ? customMaxValue : Math.max(...data.map(d => d.value), 1);

  // Custom tooltip component - just shows x-axis (time) and y-axis (value)
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-300 rounded px-2 py-1 shadow-md">
          <p className="text-gray-600 text-xs">{`Time: ${data.timeLabel}`}</p>
          <p className="text-gray-600 text-xs">{`Value: ${format(payload[0].value)}`}</p>
        </div>
      );
    }
    return null;
  };

  const handleMouseMove = (state: any) => {
    if (state && state.activePayload && state.activeCoordinate) {
      const key =
        state.activePayload[0]?.payload?.timestamp ??
        state.activePayload[0]?.payload?.timeLabel ??
        state.activeLabel ??
        String(state.activeTooltipIndex ?? "");

      const chartHeight = 300;
      const marginTop = 5;
      const marginBottom = 0;
      const innerHeight = chartHeight - marginTop - marginBottom;
      const value = state.activePayload[0]?.value ?? state.activePayload[0]?.payload?.value ?? 0;
      const clamped = Math.max(0, Math.min(maxValue, value));
      const valueRatio = maxValue === 0 ? 0 : clamped / maxValue;
      const yFromValue = marginTop + (1 - valueRatio) * innerHeight;

      // Always update tooltip position to follow mouse movement
      // This ensures smooth transitions between points, even with the same y-value
      setActivePointKey(key);
      setTooltipPos({ x: state.activeCoordinate.x, y: yFromValue - 80 });
    }
  };

  const handleMouseLeave = () => {
    setActivePointKey(null);
    setTooltipPos(null);
  };

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
        {label}
        {infoText && <InfoBubble text={infoText} />}
      </h4>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart 
          data={data} 
          margin={{ top: 5, right: 5, left: 5, bottom: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="timeLabel" 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            padding={{ left: 50, right: 50 }}
          />
          <YAxis 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            domain={[0, maxValue]}
            tickFormatter={(value: number) => format(value)}
          />
          <Tooltip 
            content={<CustomTooltip />}
            contentStyle={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
            wrapperStyle={{ outline: 'none', pointerEvents: 'none' }}
            position={tooltipPos ?? undefined}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2}
            dot={{ fill: color, r: 4 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarChart({ data, label, color = "#3b82f6", formatValue, maxValue: customMaxValue }: { data: Array<{ timeLabel: string; value: number }>; label: string; color?: string; formatValue?: (value: number) => string; maxValue?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No data available
      </div>
    );
  }

  const maxValue = customMaxValue !== undefined ? customMaxValue : Math.max(...data.map(d => d.value), 1);
  const width = 400;
  const height = 150;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length - 10;
  
  const format = formatValue || ((v: number) => v.toFixed(1));

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-gray-300 mb-2">{label}</h4>
      <svg width={width} height={height} className="w-full">
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * chartHeight;
          const x = padding + i * (chartWidth / data.length) + 5;
          const y = padding + chartHeight - barHeight;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx="4"
              />
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                className="text-xs fill-gray-400"
              >
                {format(d.value)}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 10}
                textAnchor="middle"
                className="text-xs fill-gray-500"
              >
                {d.timeLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ProjectBarChart({ data, label, color = "#3b82f6", overallAverage = null, infoText }: { data: Array<{ project_name: string; value: number | null }>; label: string; color?: string; overallAverage?: number | null; infoText?: string }) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [activeBarKey, setActiveBarKey] = useState<string | null>(null);

  // Helper function to format project names: split by "_" and convert to title case
  const formatProjectName = (name: string): string => {
    if (name === "Overall Average") {
      return "Overall"; // Don't format "Overall Average"
    }
    return name
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Combine project data with overall average at the end
  const allData = [...data];
  if (overallAverage !== null) {
    allData.push({ project_name: "Overall Average", value: overallAverage });
  }

  const validData = allData.filter(d => d.value !== null) as Array<{ project_name: string; value: number }>;
  if (validData.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No data available
      </div>
    );
  }

  // Custom tooltip component - just shows x-axis (project) and y-axis (value)
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-300 rounded px-2 py-1 shadow-md">
          <p className="text-gray-600 text-xs">{`Project: ${formatProjectName(data.project_name)}`}</p>
          <p className="text-gray-600 text-xs">{`Value: ${(data.value * 100).toFixed(1)}%`}</p>
        </div>
      );
    }
    return null;
  };

  // Custom label formatter: format project name and truncate if needed
  const formatLabel = (label: string) => {
    const formatted = formatProjectName(label);
    return formatted.length > 15 ? formatted.substring(0, 15) + '...' : formatted;
  };

  const handleMouseMove = (state: any) => {
    if (state && state.activePayload && state.activeCoordinate) {
      const key =
        state.activePayload[0]?.payload?.project_name ??
        state.activeLabel ??
        String(state.activeTooltipIndex ?? "");

      const chartHeight = 350;
      const marginTop = 5;
      const marginBottom = 5;
      const innerHeight = chartHeight - marginTop - marginBottom;
      const value = state.activePayload[0]?.value ?? state.activePayload[0]?.payload?.value ?? 0;
      // Bar chart domain is fixed [0, 1]
      const clamped = Math.max(0, Math.min(1, value));
      const yFromValue = marginTop + (1 - clamped) * innerHeight;
      const tooltipYOffset = 50;

      if (key !== activeBarKey || !tooltipPos) {
        setActiveBarKey(key);
        setTooltipPos({ x: state.activeCoordinate.x, y: yFromValue - tooltipYOffset });
      }
    }
  };

  const handleMouseLeave = () => {
    setActiveBarKey(null);
    setTooltipPos(null);
  };

  return (
    <div className="w-full">
      <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center">
        {label}
        {infoText && <InfoBubble text={infoText} />}
      </h4>
      <ResponsiveContainer width="100%" height={350}>
        <RechartsBarChart 
          data={validData} 
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="project_name" 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            tickFormatter={formatLabel}
          />
          <YAxis 
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
            domain={[0, 1]}
            tickFormatter={(value: number) => `${(value * 100).toFixed(0)}%`}
          />
          <Tooltip 
            content={<CustomTooltip />}
            contentStyle={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
            wrapperStyle={{ outline: 'none', pointerEvents: 'none' }}
            cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
            position={tooltipPos ?? undefined}
          />
          <Bar 
            dataKey="value" 
            fill={color}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            {validData.map((entry, index) => {
              const isOverall = entry.project_name === "Overall Average";
              return (
                <Cell 
                  key={`cell-${index}`}
                  fill={isOverall ? "#10b981" : color}
                  opacity={isOverall ? 0.8 : 1}
                />
              );
            })}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { statsAccessible, isCalculating } = useUserStudyPopup();
  const userId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frontendTopic, setFrontendTopic] = useState<"all" | "html" | "css" | "js">("all");
  const [codingTypePassRate, setCodingTypePassRate] = useState<"combined" | "from_scratch" | "debug">("combined");
  const [codingTypeTimeTaken, setCodingTypeTimeTaken] = useState<"combined" | "from_scratch" | "debug">("combined");
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

  // Redirect if user hasn't completed study and we're not past the study end date
  useEffect(() => {
    if (!isCalculating && statsAccessible === false) {
      router.replace("/browse");
    }
  }, [isCalculating, statsAccessible, router]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch all required data in parallel
        const [submissionsResponse, tasksResponse, skillCheckResponse, detailedStatsResponse] = await Promise.all([
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/submissions`),
          fetch(`/api/tasks`),
          fetch(`/api/skill-check/completion-status-both?user_id=${userId}`),
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/stats`),
        ]);

        // Parse submissions
        let submissionsData = { items: [] };
        if (submissionsResponse.ok) {
          submissionsData = await submissionsResponse.json();
        }

        const submissions = submissionsData.items || [];
        const submittedProjectIds = new Set<number>(
          submissions.map((sub: any) => sub.projectId).filter((id: any): id is number => id != null)
        );

        // Parse tasks and map projectId to task name
        let tasks: any[] = [];
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          tasks = tasksData.tasks || [];
        }

        // Create mapping of projectId to task name
        const projectIdToTaskName = new Map<number, string>();
        tasks.forEach((task: any) => {
          if (task.projectId && task.name) {
            projectIdToTaskName.set(task.projectId, task.name);
          }
        });

        // Find completed task names from submissions
        const completedTaskNames = new Set<string>();
        submittedProjectIds.forEach((projectId: number) => {
          const taskName = projectIdToTaskName.get(projectId);
          if (taskName) {
            completedTaskNames.add(taskName);
          }
        });

        const completedRequiredTasks = POST_TEST_REQUIRED_TASKS.filter((taskName) =>
          completedTaskNames.has(taskName)
        ).length;

        // Calculate average rating and total votes
        let totalRating = 0;
        let ratingCount = 0;
        let totalVotes = 0;
        const votesByProject = new Map<number, number>();
        submissions.forEach((sub: any) => {
          if (sub.ratingSummary?.average) {
            totalRating += sub.ratingSummary.average;
            ratingCount++;
          }
          if (sub.ratingSummary?.count) {
            totalVotes += sub.ratingSummary.count;
            // Track votes per project
            if (sub.projectId) {
              const currentVotes = votesByProject.get(sub.projectId) || 0;
              votesByProject.set(sub.projectId, currentVotes + sub.ratingSummary.count);
            }
          }
        });
        const averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;

        // Build votes per project array - include all projects with submissions
        const votesPerProject = submittedProjectIds.size > 0
          ? Array.from(submittedProjectIds)
              .map((projectId) => ({
                project_id: projectId,
                project_name: projectIdToTaskName.get(projectId) || `Project ${projectId}`,
                num_votes: votesByProject.get(projectId) || 0,
              }))
              .sort((a, b) => b.num_votes - a.num_votes) // Sort by votes descending
          : [];

        // Parse detailed stats
        let aiStats = { num_prompts: 0, total_lines_generated: 0, llm_ideas_used: 0 };
        let mcqaAccuracy = { frontend: [], ux: [] };
        let codingPerformance = { from_scratch: [], debug: [], combined: [] };
        let comprehensionScores = { avg_mcqa: null, avg_multi_select: null, mcqa_count: 0, multi_select_count: 0, per_project: [] };

        if (detailedStatsResponse.ok) {
          const detailedStats = await detailedStatsResponse.json();
          console.log("=== FRONTEND: Raw detailedStats from API ===");
          console.log("Full detailedStats:", detailedStats);
          console.log("coding_performance:", detailedStats.coding_performance);
          console.log("from_scratch data:", detailedStats.coding_performance?.from_scratch);
          console.log("debug data:", detailedStats.coding_performance?.debug);
          console.log("combined data:", detailedStats.coding_performance?.combined);
          console.log("=== END FRONTEND: Raw detailedStats ===\n");
          
          aiStats = detailedStats.ai_stats || aiStats;
          mcqaAccuracy = detailedStats.mcqa_accuracy || mcqaAccuracy;
          codingPerformance = detailedStats.coding_performance || codingPerformance;
          comprehensionScores = {
            ...comprehensionScores,
            ...(detailedStats.comprehension_scores || {}),
            per_project: detailedStats.comprehension_scores?.per_project || []
          };
        }

        setStats({
          totalSubmissions: submissions.length,
          completedRequiredTasks,
          averageRating,
          numVotes: totalVotes,
          votesPerProject,
          aiStats,
          mcqaAccuracy,
          codingPerformance,
          comprehensionScores,
        });
      } catch (err) {
        console.error("Error fetching stats:", err);
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userId]);

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

  // Don't render stats content when redirecting (user hasn't completed study)
  if (!isCalculating && statsAccessible === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-2 mx-auto w-full min-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-center space-x-3">
          <LoadingSpinner size="lg" color="white" />
          <p className="text-gray-400 text-lg">Redirecting...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-2 mx-auto w-full min-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-center space-x-3">
          <LoadingSpinner size="lg" color="blue" />
          <p className="text-gray-400 text-lg">Loading your stats...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-2 mx-auto w-full min-h-[calc(100vh-3rem)]">
        <div className="bg-red-900/20 rounded-lg border border-red-700/50 p-6">
          <p className="text-red-400 text-lg">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const pillBase =
    "px-3 py-1 text-xs rounded-full border transition-colors focus:outline-none";
  const pillInactive = "bg-gray-900 text-gray-300 border-gray-700 hover:border-gray-500";
  const pillActive = "bg-blue-500/20 text-blue-200 border-blue-400";

  const codingTypeOptions: Array<{ value: "combined" | "from_scratch" | "debug"; label: string }> = [
    { value: "combined", label: "Combined" },
    { value: "from_scratch", label: "From Scratch" },
    { value: "debug", label: "Debug" },
  ];

  const filteredFrontendMcqa = stats.mcqaAccuracy.frontend.filter((d) => {
    const category = d.question_category || "all";
    return frontendTopic === "all" ? category === "all" || category === "other" : category === frontendTopic;
  });

  const codingDatasetPassRate =
    codingTypePassRate === "from_scratch"
      ? stats.codingPerformance.from_scratch
      : codingTypePassRate === "debug"
        ? stats.codingPerformance.debug
        : stats.codingPerformance.combined;

  const codingDatasetTimeTaken =
    codingTypeTimeTaken === "from_scratch"
      ? stats.codingPerformance.from_scratch
      : codingTypeTimeTaken === "debug"
        ? stats.codingPerformance.debug
        : stats.codingPerformance.combined;

  // Debug logging for coding datasets
  console.log("=== FRONTEND: Coding Performance Data ===");
  console.log("stats.codingPerformance:", stats.codingPerformance);
  console.log("stats.codingPerformance.from_scratch:", stats.codingPerformance.from_scratch);
  console.log("stats.codingPerformance.debug:", stats.codingPerformance.debug);
  console.log("stats.codingPerformance.combined:", stats.codingPerformance.combined);
  console.log("codingTypePassRate:", codingTypePassRate);
  console.log("codingDatasetPassRate:", codingDatasetPassRate);
  console.log("codingTypeTimeTaken:", codingTypeTimeTaken);
  console.log("codingDatasetTimeTaken:", codingDatasetTimeTaken);
  console.log("=== END FRONTEND: Coding Performance Data ===\n");

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-2 px-2 mx-auto w-full relative">
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
        <h1 className="text-3xl font-semibold text-white mb-6 mt-4 text-center w-full">Your Stats 🤓☝️</h1>
        
        <div className="mb-6 text-center">
          <p className="text-gray-300 text-base">
            Want to see if your skills have improved?{" "}
            <Link 
              href="/skill-check" 
              className="text-blue-400 hover:text-blue-300 underline transition-colors"
            >
              Retake our skill check!
            </Link>
          </p>
        </div>

      <div className="w-full max-w-6xl space-y-6 pb-12">
        {/* Description Section */}
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 p-4 mb-4">
          <p className="text-gray-300 text-sm leading-relaxed">
            This page shows your website scores, AI usage, programming knowledge, coding abilities, and comprehension over time. Hover over the info icons next to each plot to learn more about what each metric represents!
          </p>
        </div>
        {/* Overall Progress Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Trophy className="text-yellow-400" size={24} />
            Overall Progress
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Code className="text-blue-400" size={20} />
                <span className="text-gray-400 text-sm">Total Submissions</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.totalSubmissions}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ThumbsUp className="text-purple-400" size={20} />
                <span className="text-gray-400 text-sm">Total Votes</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.numVotes}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="text-yellow-400" size={20} />
                <span className="text-gray-400 text-sm">Avg Rating</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {stats.averageRating > 0 ? stats.averageRating.toFixed(2) : "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* AI Statistics */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Sparkles className="text-pink-400" size={24} />
            AI Usage
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Code className="text-blue-400" size={20} />
                <span className="text-gray-400 text-sm">Lines Generated</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.aiStats.total_lines_generated.toLocaleString()}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="text-purple-400" size={20} />
                <span className="text-gray-400 text-sm"># Prompts</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.aiStats.num_prompts}</p>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="text-yellow-400" size={20} />
                <span className="text-gray-400 text-sm">LLM Ideas Used</span>
              </div>
              <p className="text-2xl font-bold text-white">{stats.aiStats.llm_ideas_used}</p>
            </div>
          </div>
        </div>

        {/* MCQA Accuracy Plots */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-8">MCQA Scores</h2>
          <div className="space-y-8">
            <SimpleLineChart
              data={convertPhaseToTimeBased(filteredFrontendMcqa, d => d.accuracy)}
              label="HTML/CSS/JS Questions"
              color="#3b82f6"
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
              infoText={PLOT_DESCRIPTIONS.htmlCssJs}
            />
            <div className="border-t border-gray-700"></div>
            <SimpleLineChart
              data={convertPhaseToTimeBased(stats.mcqaAccuracy.ux, d => d.accuracy)}
              label="UX Questions"
              color="#8b5cf6"
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
              infoText={PLOT_DESCRIPTIONS.ux}
            />
          </div>
        </div>

        {/* Coding Performance Plots */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-8">Coding Performance</h2>
          <div className="space-y-8">
            <div className="relative pt-8">
              <div className="absolute right-0 top-0 flex gap-2">
                {codingTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCodingTypePassRate(opt.value)}
                    className={`${pillBase} ${codingTypePassRate === opt.value ? pillActive : pillInactive}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <SimpleLineChart
                data={convertCodingPerformanceToTimeBased(codingDatasetPassRate, d => d.score)}
                label="Pass Rate"
                color="#10b981"
                formatValue={(v) => `${(v * 100).toFixed(1)}%`}
                maxValue={1.0}
                infoText={PLOT_DESCRIPTIONS.passRate}
              />
            </div>
            <div className="border-t border-gray-700"></div>
            <div className="relative pt-8">
              <div className="absolute right-0 top-0 flex gap-2">
                {codingTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCodingTypeTimeTaken(opt.value)}
                    className={`${pillBase} ${codingTypeTimeTaken === opt.value ? pillActive : pillInactive}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <SimpleLineChart
                data={convertCodingPerformanceToTimeBased(codingDatasetTimeTaken, d => d.time_taken_seconds / 60, true)}
                label="Time Taken (minutes)"
                color="#f59e0b"
                formatValue={(v) => `${v.toFixed(1)}`}
                infoText={PLOT_DESCRIPTIONS.timeTaken}
              />
            </div>
          </div>
        </div>

        {/* Comprehension Scores */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Comprehension Scores</h2>
          
          {/* Per-project charts */}
          {stats.comprehensionScores.per_project && stats.comprehensionScores.per_project.length > 0 && (
            <div className="space-y-8">
              <ProjectBarChart
                data={stats.comprehensionScores.per_project.map(p => ({
                  project_name: p.project_name,
                  value: p.avg_mcqa
                }))}
                label="Self-Reported Comprehension"
                color="#3b82f6"
                overallAverage={stats.comprehensionScores.avg_mcqa}
                infoText={PLOT_DESCRIPTIONS.perceivedComprehension}
              />
              <div className="border-t border-gray-700"></div>
              <ProjectBarChart
                data={stats.comprehensionScores.per_project.map(p => ({
                  project_name: p.project_name,
                  value: p.avg_multi_select
                }))}
                label="True Comprehension"
                color="#3b82f6"
                overallAverage={stats.comprehensionScores.avg_multi_select}
                infoText={PLOT_DESCRIPTIONS.trueComprehension}
              />
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
