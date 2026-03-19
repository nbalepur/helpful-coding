"use client";

import { useState, useEffect, ReactNode } from "react";
import { useAuth } from "../utils/auth";
import { useUserStudyPopup } from "../components/UserStudyPopup";
import { ENV } from "../config/env";
import { WEBSITE_REQUIREMENT_TASKS, GAME_REQUIRED_TASKS, isWebsiteRequirementTask } from "../config/tasks";
import { isWebsiteRequirementsSkippedFromSettings, ensureExtraCreditCodeInSettings } from "../utils/userSettings";
import LoadingSpinner from "../components/LoadingSpinner";
import { Trophy, Code, DollarSign, Star, Sparkles, BarChart3, ThumbsUp, Lightbulb, HelpCircle, CheckCircle2, Circle, CircleSlash, Lock, AlertTriangle, Copy } from "lucide-react";
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

/** Stage 3: $15 per this many eligible submitted tasks ($5 each). */
const STAGE3_TASKS_PER_REWARD_BLOCK = 3;
const STAGE3_REWARD_DOLLARS_PER_BLOCK = 15;

const formatDateOnly = (dateString?: string): string => {
  if (!dateString) {
    return "the announced study end date";
  }
  const parsedDate = new Date(dateString);
  if (Number.isNaN(parsedDate.getTime())) {
    return dateString;
  }
  return parsedDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

interface Stage3CompensationEstimate {
  tasks_completed_total: number;
  tasks_in_pay_pool: number;
  tasks_outside_pool: number;
  reward_blocks: number;
  reward_dollars: number;
  open_ended_submissions_study_wide: number;
  pay_pool_cap: number;
  pool_closed: boolean;
}

interface PostTestPoolStatus {
  meets_task_requirement: boolean;
  in_post_test_pool: boolean;
  post_test_completed: boolean;
  participant_cap: number;
  pool_filled: boolean;
  /** True while fewer than cap users have completed the post-test (any eligible user can take it). */
  post_test_open?: boolean;
}

interface UserStats {
  totalSubmissions: number;
  stage3Estimate: Stage3CompensationEstimate | null;
  postTestPoolStatus: PostTestPoolStatus | null;
  /** Users who completed post-test study-wide */
  studyWidePostTestCompletionsCount: number | null;
  /** User's submission rows on open-ended game dev tasks only */
  openEndedGameDevSubmissionCount: number;
  /** Open-ended game dev submission rows study-wide; null if unavailable */
  studyWideOpenEndedSubmissions: number | null;
  completedRequiredTasks: number;
  completedGameRequiredTasks: number;
  /** Distinct non–website-recreation game tasks submitted (includes Platformer); used for post-test gate. */
  submittedGameTaskCount: number;
  platformerSubmitted: boolean;
  completedAdditionalWebsiteTasks: number;
  totalAdditionalWebsiteTasks: number;
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
  
  for (const [phase, items] of Array.from(phaseGroups.entries())) {
    // Calculate average value for this phase
    const avgValue = items.reduce((sum: number, item) => sum + getValue(item), 0) / items.length;
    
    // Find earliest timestamp for this phase
    const timestamps = items
      .map((item) => item.timestamp)
      .filter((ts): ts is string => Boolean(ts && ts !== ""))
      .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime());
    
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

function LabeledInfoBubble({
  title = "How do I complete this?",
  text,
  disabled = false,
}: {
  title?: string;
  text: ReactNode;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  return (
    <div className="w-full">
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium shadow-none hover:shadow-none ${
          disabled
            ? "border-gray-700 bg-gray-900/60 text-gray-500 cursor-not-allowed transition-none hover:bg-gray-900/60 hover:text-gray-500 hover:border-gray-700"
            : "border-blue-500/60 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20"
        }`}
        onClick={() => {
          if (disabled) return;
          setIsOpen((prev) => !prev);
        }}
        disabled={disabled}
        aria-disabled={disabled}
      >
        <HelpCircle className="w-3.5 h-3.5" />
        {title}
      </button>
      {isOpen && (
        <p className="mt-3 rounded-md border border-gray-700 bg-gray-900/70 px-3 py-2 text-sm text-gray-300 leading-relaxed">
          {text}
        </p>
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

export default function CompensationPage() {
  const { user, token, refreshUser } = useAuth();
  const { preTestCompleted, postTestCompleted, allRequiredTasksCompleted } = useUserStudyPopup();
  const userId = user?.id && !Number.isNaN(Number(user.id)) ? Number(user.id) : null;

  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedPreTestCompleted, setFetchedPreTestCompleted] = useState<boolean | null>(null);
  const [fetchedPostTestCompleted, setFetchedPostTestCompleted] = useState<boolean | null>(null);
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
  const [localExtraCreditCode, setLocalExtraCreditCode] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Ensure extra credit code exists when user has earned extra credit (must run unconditionally for hooks order)
  useEffect(() => {
    if (!userId || !stats) return;
    const completedPreTest = fetchedPreTestCompleted ?? preTestCompleted ?? false;
    const websiteRequirementsSkipped = isWebsiteRequirementsSkippedFromSettings(user?.settings);
    const completedWebsiteRequirementTasks = allRequiredTasksCompleted ?? stats.completedRequiredTasks >= WEBSITE_REQUIREMENT_TASKS.length;
    const stage1Completed = completedWebsiteRequirementTasks;
    const stage1Skipped = websiteRequirementsSkipped;
    const extraCreditEarned = completedPreTest && (stage1Completed || stage1Skipped);
    if (!extraCreditEarned) return;
    if (user?.settings?.extra_credit_code) return;
    let cancelled = false;
    ensureExtraCreditCodeInSettings(userId, user?.settings ?? {}, token ?? undefined)
      .then((code) => {
        if (!cancelled) {
          setLocalExtraCreditCode(code);
          refreshUser();
        }
      })
      .catch((err) => console.error("Failed to ensure extra credit code:", err));
    return () => { cancelled = true; };
  }, [userId, stats, user?.settings, token, refreshUser, fetchedPreTestCompleted, preTestCompleted, allRequiredTasksCompleted]);

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
        const [
          submissionsResponse,
          tasksResponse,
          skillCheckResponse,
          detailedStatsResponse,
          studyCountResponse,
          stage3EstResponse,
          postTestPoolResponse,
          postTestCompletionsResponse,
        ] = await Promise.all([
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/submissions`),
          fetch(`/api/tasks`),
          fetch(`/api/skill-check/completion-status-both?user_id=${userId}`),
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/stats`),
          fetch(`${ENV.BACKEND_URL}/api/study/submission-count`),
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/stage3-compensation-estimate`),
          fetch(`${ENV.BACKEND_URL}/api/users/${userId}/post-test-pool-status`),
          fetch(`${ENV.BACKEND_URL}/api/study/post-test-completions-count`),
        ]);

        let studyWidePostTestCompletionsCount: number | null = null;
        if (postTestCompletionsResponse.ok) {
          try {
            const pc = await postTestCompletionsResponse.json();
            if (typeof pc?.post_test_completions_count === "number") {
              studyWidePostTestCompletionsCount = pc.post_test_completions_count;
            }
          } catch {
            /* ignore */
          }
        }

        let postTestPoolStatus: PostTestPoolStatus | null = null;
        if (postTestPoolResponse.ok) {
          try {
            const pj = await postTestPoolResponse.json();
            if (
              typeof pj?.meets_task_requirement === "boolean" &&
              typeof pj?.in_post_test_pool === "boolean" &&
              typeof pj?.participant_cap === "number"
            ) {
              postTestPoolStatus = pj as PostTestPoolStatus;
            }
          } catch {
            /* ignore */
          }
        }

        let stage3Estimate: Stage3CompensationEstimate | null = null;
        if (stage3EstResponse.ok) {
          try {
            const ej = await stage3EstResponse.json();
            if (
              typeof ej?.reward_dollars === "number" &&
              typeof ej?.tasks_in_pay_pool === "number" &&
              typeof ej?.pay_pool_cap === "number"
            ) {
              stage3Estimate = ej as Stage3CompensationEstimate;
            }
          } catch {
            /* ignore */
          }
        }

        let studyWideOpenEndedSubmissions: number | null = null;
        if (studyCountResponse.ok) {
          try {
            const sc = await studyCountResponse.json();
            if (typeof sc?.open_ended_game_submissions === "number") {
              studyWideOpenEndedSubmissions = sc.open_ended_game_submissions;
            }
          } catch {
            /* ignore */
          }
        }

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

        const isOpenEndedGameDevTask = (task: any): boolean => {
          if (!task?.name || task.id === "playground") {
            return false;
          }
          if (task.category === "tutorial" || task.tags?.includes("tutorial")) {
            return false;
          }
          if (isWebsiteRequirementTask(task)) {
            return false;
          }
          if (GAME_REQUIRED_TASKS.includes(task.name)) {
            return true;
          }
          const label = (task.label || "open-ended").toLowerCase().replace(/_/g, "-");
          return label === "open-ended";
        };
        let openEndedGameDevSubmissionCount = 0;
        for (const sub of submissions as { projectId?: number }[]) {
          const task = tasks.find((t: any) => t.projectId === sub.projectId);
          if (task && isOpenEndedGameDevTask(task)) {
            openEndedGameDevSubmissionCount += 1;
          }
        }

        if (skillCheckResponse.ok) {
          const skillCheckData = await skillCheckResponse.json();
          setFetchedPreTestCompleted(skillCheckData.pre_test?.completed ?? false);
          setFetchedPostTestCompleted(skillCheckData.post_test?.completed ?? false);
        } else {
          setFetchedPreTestCompleted(null);
          setFetchedPostTestCompleted(null);
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

        const submittedGameTaskNames = new Set<string>();
        submittedProjectIds.forEach((projectId: number) => {
          const task = tasks.find((t: any) => t.projectId === projectId);
          if (!task?.name || task.id === "playground") {
            return;
          }
          if (!isWebsiteRequirementTask(task)) {
            submittedGameTaskNames.add(String(task.name).toLowerCase());
          }
        });
        const submittedGameTaskCount = submittedGameTaskNames.size;
        const platformerSubmitted = completedTaskNames.has("platformer");

        const completedRequiredTasks = WEBSITE_REQUIREMENT_TASKS.filter((taskName) =>
          completedTaskNames.has(taskName)
        ).length;
        const completedGameRequiredTasks = GAME_REQUIRED_TASKS.filter((taskName) =>
          completedTaskNames.has(taskName)
        ).length;

        const additionalWebsiteTaskNames = tasks
          .filter((task: any) => {
            if (!task?.name || task.id === "playground") {
              return false;
            }
            if (task.category === "tutorial" || task.tags?.includes("tutorial")) {
              return false;
            }
            if (WEBSITE_REQUIREMENT_TASKS.includes(task.name) || GAME_REQUIRED_TASKS.includes(task.name)) {
              return false;
            }
            return !isWebsiteRequirementTask(task) && (task.label || "open-ended").toLowerCase().replace(/_/g, "-") === "open-ended";
          })
          .map((task: any) => task.name as string);
        const totalAdditionalWebsiteTasks = additionalWebsiteTaskNames.length;
        const completedAdditionalWebsiteTasks = additionalWebsiteTaskNames.filter((taskName) =>
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
          stage3Estimate,
          postTestPoolStatus,
          studyWidePostTestCompletionsCount,
          openEndedGameDevSubmissionCount,
          studyWideOpenEndedSubmissions,
          completedRequiredTasks,
          completedGameRequiredTasks,
          submittedGameTaskCount,
          platformerSubmitted,
          completedAdditionalWebsiteTasks,
          totalAdditionalWebsiteTasks,
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

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-2 mx-auto w-full min-h-[calc(100vh-3rem)]">
        <div className="flex items-center justify-center space-x-3">
          <LoadingSpinner size="lg" color="blue" />
          <p className="text-gray-400 text-lg">Loading your compensation tracker...</p>
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

  const completedWebsiteRequirementTasks =
    allRequiredTasksCompleted ?? stats.completedRequiredTasks >= WEBSITE_REQUIREMENT_TASKS.length;
  const completedPreTest = fetchedPreTestCompleted ?? preTestCompleted ?? false;
  const completedPostTest = fetchedPostTestCompleted ?? postTestCompleted ?? false;
  const requiredTaskCount = WEBSITE_REQUIREMENT_TASKS.length;
  const gameRequiredTaskCount = GAME_REQUIRED_TASKS.length;
  const completedGameRequiredTasks = stats.completedGameRequiredTasks;
  const completedAdditionalWebsiteTasks = stats.completedAdditionalWebsiteTasks;
  const totalAdditionalWebsiteTasks = stats.totalAdditionalWebsiteTasks;
  const submittedGameTaskCount = stats.submittedGameTaskCount;
  const platformerSubmitted = stats.platformerSubmitted;
  /** Tasks that count toward Stage 3 pay blocks (Platformer = 1 + each paid-track additional task). */
  const stage3PayTaskCount =
    (platformerSubmitted ? 1 : 0) + completedAdditionalWebsiteTasks;
  const websiteRequirementsSkipped = isWebsiteRequirementsSkippedFromSettings(user?.settings);

  const stage1Completed = completedWebsiteRequirementTasks;
  const stage1Skipped = websiteRequirementsSkipped;
  const stage2Unlocked = stage1Completed;
  const stage2Completed = stage2Unlocked && completedGameRequiredTasks >= gameRequiredTaskCount;
  const stage3Unlocked = stage2Completed;
  const s3 = stats.stage3Estimate;
  const stage3RewardBlocks =
    s3 != null
      ? s3.reward_blocks
      : Math.floor(stage3PayTaskCount / STAGE3_TASKS_PER_REWARD_BLOCK);
  const stage3RewardDollars =
    s3 != null ? s3.reward_dollars : stage3RewardBlocks * STAGE3_REWARD_DOLLARS_PER_BLOCK;
  const stage3PayCap =
    s3 != null ? s3.pay_pool_cap : ENV.STAGE3_MAX_SUBMISSIONS_FOR_COMPENSATION;
  const stage3PayCutoffReached =
    (s3 != null && s3.pool_closed) ||
    (s3 == null &&
      stats.studyWideOpenEndedSubmissions != null &&
      stats.studyWideOpenEndedSubmissions >= ENV.STAGE3_MAX_SUBMISSIONS_FOR_COMPENSATION);
  const stage3Completed =
    totalAdditionalWebsiteTasks > 0 && completedAdditionalWebsiteTasks >= totalAdditionalWebsiteTasks;
  const numTasksRequiredUntilPostTest = ENV.NUM_TASKS_REQUIRED_UNTIL_POSTTEST;
  const ptPool = stats.postTestPoolStatus;
  // Derive pool filled from study-wide count + frontend cap so lock state matches the numbers we display
  const poolFilledByCount =
    stats.studyWidePostTestCompletionsCount != null &&
    stats.studyWidePostTestCompletionsCount >= ENV.POST_TEST_PARTICIPANT_CAP;
  const poolFilled =
    (ptPool != null && (ptPool.pool_filled || ptPool.post_test_open === false)) || poolFilledByCount;
  const stage4PostTestCapBlocked =
    stage3Unlocked &&
    !completedPostTest &&
    (ptPool?.meets_task_requirement ?? (submittedGameTaskCount >= numTasksRequiredUntilPostTest && platformerSubmitted)) &&
    poolFilled;
  const stage4Unlocked =
    stage3Unlocked &&
    (completedPostTest ||
      (ptPool == null
        ? submittedGameTaskCount >= numTasksRequiredUntilPostTest && !poolFilledByCount
        : ptPool.post_test_completed ||
          (ptPool.meets_task_requirement && !poolFilled)));
  const stage4Completed = completedPostTest;
  const extraCreditEarned = completedPreTest && (stage1Completed || stage1Skipped);
  const gameBonusTopN = process.env.NEXT_PUBLIC_GAME_TASK_BONUS_TOP_N ?? "N";
  const studyEndDateOverall = formatDateOnly(process.env.NEXT_PUBLIC_STUDY_END_DATE_OVERALL);

  const extraCreditCode = user?.settings?.extra_credit_code ?? localExtraCreditCode;

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

  const comprehensionProjects =
    stats.comprehensionScores.per_project?.filter((project) => project.project_name !== "Playground") ?? [];

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
        <h1 className="text-3xl font-semibold text-white mb-6 mt-4 text-center w-full">Compensation Tracker</h1>

      <div className="w-full max-w-4xl space-y-6 pb-12">
        {/* Description Section */}
        <div className="bg-gray-800/60 rounded-lg border border-gray-700/60 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-white">How compensation works</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            The study ends in {studyEndDateOverall}. Compensation is staggered by stage. Later payments unlock only after earlier stages are complete.
          </p>
          <div className="space-y-2 text-sm text-gray-300">
            <ul className="list-disc list-outside pl-5 space-y-1">
              <li>
                <span className="font-semibold text-blue-300">Step 0:</span> Complete the pre-test (extra credit only).
              </li>
              <li>
                <span className="font-semibold text-blue-300">Step 1:</span> After completing the pre-test, complete all website recreation tasks for extra credit.
              </li>
              <li>
                <span className="font-semibold text-blue-300">Stage 2:</span> Complete all required game-based design tasks (i.e., Platformer) to unlock Stage 3. No monetary reward for this stage.
              </li>
              <li>
                <span className="font-semibold text-blue-300">Stage 3:</span> Earn ${STAGE3_REWARD_DOLLARS_PER_BLOCK} for every {STAGE3_TASKS_PER_REWARD_BLOCK} open-ended game dev tasks you complete (${STAGE3_REWARD_DOLLARS_PER_BLOCK / STAGE3_TASKS_PER_REWARD_BLOCK} per task).{" "}
                <span>
                  We will only compensate the first {ENV.STAGE3_MAX_SUBMISSIONS_FOR_COMPENSATION} submissions.
                </span>
              </li>
              <li>
                <span className="font-semibold text-blue-300">Stage 4:</span> After{" "}
                {numTasksRequiredUntilPostTest} distinct game-based website tasks (including Platformer), the first{" "}
                {ENV.POST_TEST_PARTICIPANT_CAP.toLocaleString()} participants may complete the
                post-test for $10.
              </li>
              <li>
                <span className="font-semibold text-blue-300">Bonus rewards:</span> The top 10 users with the highest-scoring websites (by user voting) will each receive $10,{" "}
                <span>
                  This reward only applies to tasks with more than {ENV.TOP10_BONUS_MIN_SUBMISSIONS_EXCLUSIVE} submissions.
                </span>{" "}
                Rewards are available through {studyEndDateOverall}.
              </li>
            </ul>
            <p className="text-gray-300 mt-2">
              You can track each stage under the "Compensation Checklist" section below. The <a href="/leaderboard" className="text-blue-300 hover:text-blue-200 underline">Leaderboard</a> page shows global progress on number of submissions. If you have any questions, please contact{" "}
              <a
                href="mailto:nbalepur@umd.edu"
                className="text-blue-300 hover:text-blue-200 underline"
              >
                nbalepur@umd.edu
              </a>.
            </p>
            <div className="bg-red-600/10 border-l-4 border-red-500 rounded-r p-4 !mt-7">
              <p className="text-white font-medium mb-2 flex items-center text-lg">
                <AlertTriangle className="w-5 h-5 mr-2 text-red-400 flex-shrink-0" />
                Warnings
              </p>
              <ul className="text-gray-200 space-y-2 list-disc list-outside pl-6 marker:text-red-300 text-sm">
                <li className="leading-relaxed">
                There will be attention checks scattered throughout the study to make sure you are paying attention. We may withdraw your compensation if you fail all checks.
                </li>
                <li className="leading-relaxed">
                Any detected attempts to game our user study or submit offensive websites in any way will result in immediate account termination.
                </li>
                <li className="leading-relaxed">
                Please do not look up the answers to questions or user external AI tools. Our research study aims to understand where students succeed and struggle when using AI assistants, and this behavior weakens our results.
                </li>
              </ul>
            </div>
          </div>
        </div>
        {/* Compensation Checklist */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign className="text-green-400" size={24} />
            Compensation Checklist
          </h2>
          <p className="text-gray-300 mb-2">
            Below are the tasks you can complete for compensation and your current progress.
          </p>
          <ul className="text-gray-300 text-sm list-disc list-outside pl-5 mb-4 space-y-0.5">
            <li>
              Total earned: <span className="text-green-400 font-medium">${stage3RewardDollars + (stage4Completed ? 10 : 0)}</span>
            </li>
            <li>
              Extra Credit Code:{" "}
              {!extraCreditEarned ? (
                <span className="text-gray-500">Not Completed</span>
              ) : extraCreditCode ? (
                <>
                  <code className="text-green-300 font-mono text-xs bg-gray-900/60 px-2 py-0.5 rounded">
                    {extraCreditCode}
                  </code>{" "}
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(extraCreditCode).then(() => {
                        setCopyFeedback(true);
                        setTimeout(() => setCopyFeedback(false), 2000);
                      });
                    }}
                    className="inline-flex items-center gap-1 bg-transparent hover:bg-transparent text-gray-400 hover:text-white transition-colors align-middle"
                    title="Copy code"
                  >
                    <Copy size={14} />
                    {copyFeedback ? <span className="text-white text-xs">Copied!</span> : null}
                  </button>
                </>
              ) : (
                <span className="text-gray-500 text-xs">Loading…</span>
              )}
            </li>
          </ul>
          <div className="space-y-4">
            <div className="bg-gray-900/60 rounded-lg border border-gray-700/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-gray-200 font-medium">Step 0: Pre-test</p>
                  <p className="text-gray-400 text-sm">
                    Pre-test: {completedPreTest ? "Done" : "Not done"}
                  </p>
                  <p className={`text-sm font-medium mt-1 ${completedPreTest ? "text-green-300" : "text-gray-400"}`}>Extra credit only</p>
                </div>
                {completedPreTest ? (
                  <CheckCircle2 className="text-green-400 shrink-0" size={20} />
                ) : (
                  <Circle className="text-gray-500 shrink-0" size={20} />
                )}
              </div>
            </div>

            <div
              className="rounded-lg border p-4 space-y-3 bg-gray-900/60 border-gray-700/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-gray-200 font-medium">Step 1: Website Recreation Tasks</p>
                  <p className="text-gray-400 text-sm">
                    Requires pre-test completed • Task progress: {stats.completedRequiredTasks}/{requiredTaskCount}
                    {websiteRequirementsSkipped ? " • Your status: Skipped" : ""}
                  </p>
                  <p className={`text-sm font-medium mt-1 ${stage1Skipped ? "text-amber-300" : "text-green-300"}`}>
                    {stage1Skipped ? "Reward: Skipped" : "Extra credit only"}
                  </p>
                </div>
                {stage1Skipped ? (
                  <CircleSlash className="text-amber-300 shrink-0" size={20} />
                ) : stage1Completed ? (
                  <CheckCircle2 className="text-green-400 shrink-0" size={20} />
                ) : (
                  <Circle className="text-gray-500 shrink-0" size={20} />
                )}
              </div>
              {!stage1Completed && !stage1Skipped && (
                <LabeledInfoBubble
                  text={
                    <>
                      {!completedPreTest && (
                        <>Complete the pre-test (Step 0) first, then </>
                      )}
                      Complete all website recreation tasks listed on the{" "}
                      <a href="/browse" className="text-blue-300 hover:text-blue-200 underline">
                        Browse page
                      </a>
                      .
                    </>
                  }
                />
              )}
            </div>

            <div
              className={`rounded-lg border p-4 space-y-3 ${stage2Unlocked ? "bg-gray-900/60 border-gray-700/60" : "bg-gray-900/30 border-gray-800 opacity-70 cursor-not-allowed select-none"}`}
              aria-disabled={!stage2Unlocked}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-gray-200 font-medium">Stage 2: Required Game-Based Tasks (Platformer)</p>
                  <p className="text-gray-400 text-sm">
                    {stage2Unlocked
                      ? `Task progress: ${completedGameRequiredTasks}/${gameRequiredTaskCount}`
                      : "Locked until Stage 1 is complete"}
                  </p>
                  <p className="text-gray-400 text-sm font-medium mt-1">Required to unlock Stage 3 (no reward)</p>
                </div>
                {stage2Completed ? (
                  <CheckCircle2 className="text-green-400 shrink-0" size={20} />
                ) : !stage2Unlocked ? (
                  <Lock className="text-amber-300 shrink-0" size={20} />
                ) : (
                  <Circle className="text-gray-500 shrink-0" size={20} />
                )}
              </div>
              {!stage2Completed && (
                <LabeledInfoBubble
                  text={
                    <>
                      Complete the required game-based website tasks (e.g., "Platformer") listed on the{" "}
                      <a href="/browse" className="text-blue-300 hover:text-blue-200 underline">
                        Browse page
                      </a>
                    </>
                  }
                  disabled={!stage2Unlocked}
                />
              )}
            </div>

            <div
              className={`rounded-lg border p-4 space-y-3 ${
                !stage3Unlocked || stage3PayCutoffReached
                  ? "bg-gray-900/30 border-gray-800 opacity-70 cursor-not-allowed select-none"
                  : "bg-gray-900/60 border-gray-700/60"
              }`}
              aria-disabled={!stage3Unlocked || stage3PayCutoffReached}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-gray-200 font-medium">Stage 3: Additional Open-Ended Game Dev Tasks ($15 per 3 tasks)</p>
                  {!stage3Unlocked ? (
                    <p className="text-gray-400 text-sm m-0 leading-snug">Locked until Stage 2 is complete</p>
                  ) : stage3PayCutoffReached ? (
                    <div className="space-y-2">
                      <p className="text-gray-400 text-sm m-0 leading-snug">
                        The Stage 3 pay cutoff has been reached (first{" "}
                        {stage3PayCap.toLocaleString()} open-ended submissions).
                      </p>
                      <p className="text-gray-400 text-sm m-0 leading-snug">
                        <span className="text-gray-400">Stage 3 earned: </span>
                        <span className="text-green-400 font-medium">
                          ${s3 != null ? s3.reward_dollars : stage3RewardDollars}
                        </span>
                        {s3 != null && (
                          <span className="text-gray-500">
                            {" "}
                            (⌊{s3.tasks_in_pay_pool}/3⌋ × $15)
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="text-gray-400 text-sm m-0 leading-snug pl-0">
                        <span className="text-gray-400">• Your Submission Count: </span>
                        <span className="text-gray-300">{stage3PayTaskCount}</span>
                      </p>
                      <p className="text-gray-400 text-sm m-0 leading-snug pl-0">
                        <span className="text-gray-500">• </span>
                        Total open-ended submissions:{" "}
                        {stats.studyWideOpenEndedSubmissions != null && (
                          <>
                            <span className="text-gray-300">
                              {stats.studyWideOpenEndedSubmissions.toLocaleString()}
                            </span>{" "}
                            (only the first {stage3PayCap.toLocaleString()} are eligible)
                          </>
                        )}
                      </p>
                      <p className="text-gray-400 text-sm m-0 leading-snug pl-0">
                        <span className="text-gray-500">• </span>
                        {s3 != null ? (
                          <>
                            <span className="text-green-400 font-medium">${s3.reward_dollars}</span>
                            <span className="text-gray-500"> = ⌊</span>
                            <span className="text-gray-300">{s3.tasks_in_pay_pool}</span>
                            <span className="text-gray-500">/3⌋ × $15</span>
                          </>
                        ) : (
                          <>
                            <span className="text-green-400 font-medium">${stage3RewardDollars}</span>
                            <span className="text-gray-500"> ≈ ⌊{stage3PayTaskCount}/3⌋ × $15</span>
                            <span className="block text-gray-500 text-xs mt-1 leading-relaxed">
                              Pay-pool detail unavailable; ignores the first{" "}
                              {ENV.STAGE3_MAX_SUBMISSIONS_FOR_COMPENSATION.toLocaleString()} submission cutoff.
                            </span>
                          </>
                        )}
                      </p>
                    </>
                  )}
                </div>
                {!stage3Unlocked || stage3PayCutoffReached ? (
                  <Lock className="text-amber-300 shrink-0" size={20} />
                ) : stage3RewardBlocks > 0 ? (
                  <CheckCircle2 className="text-green-400 shrink-0" size={20} />
                ) : (
                  <Circle className="text-gray-500 shrink-0" size={20} />
                )}
              </div>
              {!stage3Completed && !stage3PayCutoffReached && (
                <LabeledInfoBubble
                  text={
                    <>
                      The open-ended game dev projects are listed on the{" "}
                      <a href="/browse" className="text-blue-300 hover:text-blue-200 underline">
                        Browse page
                      </a>
                      .
                    </>
                  }
                  disabled={!stage3Unlocked}
                />
              )}
            </div>

            <div
              className={`rounded-lg border p-4 space-y-3 ${stage4Unlocked ? "bg-gray-900/60 border-gray-700/60" : "bg-gray-900/30 border-gray-800 opacity-70 cursor-not-allowed select-none"}`}
              aria-disabled={!stage4Unlocked}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-gray-200 font-medium">Stage 4: Post-test Assessment</p>
                  <p className="text-gray-400 text-sm">
                    {stage4Unlocked
                      ? `Post-test: ${completedPostTest ? "Done" : "Not done"}`
                      : stage4PostTestCapBlocked
                        ? `Post-test participant limit reached (first ${(ptPool?.participant_cap ?? ENV.POST_TEST_PARTICIPANT_CAP).toLocaleString()} to complete).`
                        : `Locked until ${numTasksRequiredUntilPostTest} distinct game-based tasks including Platformer (${submittedGameTaskCount}/${numTasksRequiredUntilPostTest})`}
                  </p>
                  <p className="text-green-300 text-sm font-medium mt-1">
                    {stage4PostTestCapBlocked ? "Reward: not available" : "Reward: $10"}
                  </p>
                  {stats.studyWidePostTestCompletionsCount != null && (
                    <p className="text-gray-400 text-sm m-0 mt-1 leading-snug pl-0">
                      <span className="text-gray-500">• </span>
                      Post-tests completed study-wide:{" "}
                      <span className="text-gray-300">
                        {stats.studyWidePostTestCompletionsCount.toLocaleString()}
                      </span>
                    </p>
                  )}
                </div>
                {stage4Completed ? (
                  <CheckCircle2 className="text-green-400 shrink-0" size={20} />
                ) : !stage4Unlocked ? (
                  <Lock className="text-amber-300 shrink-0" size={20} />
                ) : (
                  <Circle className="text-gray-500 shrink-0" size={20} />
                )}
              </div>
              {!stage4Completed && !stage4PostTestCapBlocked && (
                <LabeledInfoBubble
                  text={
                    <>
                      Once you submit at least {numTasksRequiredUntilPostTest} distinct game-based website tasks (including Platformer) on the{" "}
                      <a href="/browse" className="text-blue-300 hover:text-blue-200 underline">
                        Browse page
                      </a>
                      ,                       you may be prompted to complete the post-test if a slot is available (first{" "}
                      {ENV.POST_TEST_PARTICIPANT_CAP.toLocaleString()} to complete). Doing so earns the final stage reward.
                    </>
                  }
                  disabled={!stage4Unlocked}
                />
              )}
            </div>

            <div className="bg-gray-900/60 rounded-lg border border-gray-700/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-gray-200 font-medium">Bonus: Top 10 by user voting</p>
                  <p className="text-gray-400 text-sm">
                    The 10 top-scoring websites for each project based on user votes each get $10. This reward only applies for projects with &gt; {ENV.TOP10_BONUS_MIN_SUBMISSIONS_EXCLUSIVE} submissions. We will recruit our own judges if we detect attempts to game voting.
                  </p>
                  <p className="text-green-300 text-sm font-medium mt-1">
                    Reward: $10 (if in top 10, per project) • Voting ends on {studyEndDateOverall}
                  </p>
                </div>
              </div>
            </div>
          </div>
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
        <div className="hidden bg-gray-800 rounded-lg border border-gray-700 p-6">
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
        <div className="hidden bg-gray-800 rounded-lg border border-gray-700 p-6">
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
        <div className="hidden bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Comprehension Scores</h2>
          
          {/* Per-project charts */}
          {comprehensionProjects.length > 0 && (
            <div className="space-y-8">
              <ProjectBarChart
                data={comprehensionProjects.map(p => ({
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
                data={comprehensionProjects.map(p => ({
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
