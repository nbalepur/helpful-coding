"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { Search, Shuffle, Bookmark, Flag, ArrowLeft, Filter, ArrowUpDown, Scale, RefreshCw } from "lucide-react";
import PreviewIframe from "./PreviewIframe";
import ReportSubmissionModal from "./ReportSubmissionModal";
import { ENV } from "../config/env";
import { useAuth } from "../utils/auth";
import { useSnackbar } from "./SnackbarProvider";

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
  ratingSummary?: SubmissionRatingSummary | null;
};

type SubmissionsResponse = {
  items: SubmissionCard[];
  count: number;
  hasMore: boolean;
};

const FALLBACK_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="400" height="300" fill="#1f2937"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-size="20" font-family="monospace">
      No Preview
    </text>
  </svg>`
)}`;

const escapeHtml = (value: string | null | undefined) =>
  (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const normalizeWhitespace = (value: string | null | undefined) =>
  (value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const RATING_DIMENSIONS: Array<{ key: string; name: string; description: string }> = [
  {
    key: "theme",
    name: "Theme",
    description: "How well the interface adheres to the task requirements.",
  },
  {
    key: "style",
    name: "Style",
    description: "Quality of the visual design: layout, colors, typography, and polish.",
  },
  {
    key: "enjoyment",
    name: "Enjoyment",
    description: "How engaging and satisfying it feels to interact with the UI.",
  },
  {
    key: "creativity",
    name: "Creativity",
    description: "Original touches or mechanics that make the UI stand out.",
  },
];

const createDefaultScores = (): Record<string, number> => {
  const initial: Record<string, number> = {};
  RATING_DIMENSIONS.forEach((dimension) => {
    initial[dimension.key] = 3;
  });
  return initial;
};

type SortOption = "random" | "title" | "averageScore";
type SortDirection = "asc" | "desc";

type FilterOptions = {
  unseen: boolean;
  saved: boolean;
  notReported: boolean;
};

type ViewState = {
  sortOption: SortOption;
  sortDirection: SortDirection;
  searchQuery: string;
  filters: FilterOptions;
};

const ensureStringValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const coerceSubmissionCode = (raw: unknown): Record<string, string> => {
  if (!raw) {
    return {};
  }
  if (typeof raw === "string") {
    try {
      return coerceSubmissionCode(JSON.parse(raw));
    } catch {
      return { "index.html": raw };
    }
  }
  if (Array.isArray(raw)) {
    return raw.reduce<Record<string, string>>((acc, item, index) => {
      acc[`file_${index}`] = ensureStringValue(item);
      return acc;
    }, {});
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        acc[key] = ensureStringValue(value);
        return acc;
      },
      {}
    );
  }
  return { value: ensureStringValue(raw) };
};

const normalizeSubmissionCode = (raw: unknown) => {
  const map = coerceSubmissionCode(raw);

  const directHtml = ensureStringValue((map as any).html ?? (map as any).HTML ?? "");
  const directCss = ensureStringValue((map as any).css ?? (map as any).CSS ?? "");
  const directJs = ensureStringValue((map as any).js ?? (map as any).JS ?? "");

  const entries = Object.entries(map);
  const htmlFiles = entries.filter(([name]) => /\.html?$/i.test(name));
  const cssFiles = entries.filter(([name]) => /\.s?css$/i.test(name));
  const jsFiles = entries.filter(([name]) => /\.(tsx|jsx|ts|js|mjs|cjs)$/i.test(name));

  const html = directHtml || (htmlFiles.length ? ensureStringValue(htmlFiles[0][1]) : "");
  const css = directCss || (cssFiles.length ? cssFiles.map(([, value]) => ensureStringValue(value)).join("\n\n") : "");
  const js = directJs || (jsFiles.length ? jsFiles.map(([, value]) => ensureStringValue(value)).join("\n\n") : "");

  return { html, css, js };
};

const shuffleArray = <T,>(incoming: T[]): T[] => {
  const array = [...incoming];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = array[index];
    array[index] = array[swapIndex];
    array[swapIndex] = temp;
  }
  return array;
};

const VIEW_STATE_STORAGE_KEY = "submissions-gallery-view";

const IFRAME_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      background: transparent;
    }
    .viewport {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      overflow-y: auto;
      padding: 24px;
      scrollbar-width: thin;
      scrollbar-color: rgba(59,130,246,0.6) rgba(17,24,39,0.6);
    }
    .viewport::-webkit-scrollbar {
      width: 6px;
    }
    .viewport::-webkit-scrollbar-thumb {
      background-color: rgba(59,130,246,0.6);
      border-radius: 9999px;
    }
    .viewport::-webkit-scrollbar-track {
      background-color: rgba(17,24,39,0.6);
    }
    .grid {
      display: grid;
      gap: 24px;
    }
    .card {
      border: 1px solid rgba(30, 64, 175, 0.25);
      background: rgba(17, 24, 39, 0.85);
      border-radius: 0;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.4);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(59,130,246,0.6);
      box-shadow: 0 16px 35px rgba(59, 130, 246, 0.25);
    }
    .card-header {
      padding: 10px 12px 8px 16px;
      border-bottom: 2px solid rgba(255, 255, 255, 0.75);
      display: grid;
      grid-template-columns: 2fr 1fr;
      align-items: flex-start;
      gap: 16px;
    }
    .card-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #f8fafc;
      line-height: 1.35;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: pre-wrap;
      flex: 1 1 auto;
      min-width: 0;
      transition: color 150ms ease;
    }
    .card:hover .card-title {
      color: #60a5fa;
    }
    .card-header-controls {
      display: inline-flex;
      gap: 8px;
      flex-shrink: 0;
      align-items: flex-start;
      justify-self: flex-end;
    }
    .card-figure {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #111827;
    }
    .card-figure img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      transition: transform 200ms ease;
      user-select: none;
      pointer-events: none;
    }
    .card:hover .card-figure img {
      transform: scale(1.00);
    }
    .card-figure .overlay {
      position: absolute;
      inset: 0;
      padding: 18px;
      background: rgba(0, 0, 0, 0.82);
      color: #e2e8f0;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      opacity: 0;
      transition: opacity 200ms ease;
      white-space: pre-wrap;
      overflow: hidden;
      word-break: break-word;
    }
    .card-figure:hover .overlay {
      opacity: 1;
    }
    .card-actions {
      position: absolute;
      top: 8px;
      right: 6px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 200ms ease;
    }
    .card:hover .card-actions {
      opacity: 1;
    }
    .icon-button {
      padding: 0;
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: transparent;
      color: #e2e8f0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 150ms ease;
    }
    .icon-button svg {
      display: block;
      width: 18px;
      height: 18px;
      pointer-events: none;
    }
    .icon-button svg path,
    .icon-button svg polygon,
    .icon-button svg line {
      transition: fill 150ms ease, stroke 150ms ease;
    }
    .icon-button[data-active="true"] svg path,
    .icon-button[data-active="true"] svg polygon,
    .icon-button[data-active="true"] svg line {
      fill: currentColor;
      stroke: currentColor;
    }
    .icon-button[data-active="true"] {
      color: #3b82f6;
    }
    .icon-button[data-action="report"][data-active="true"] {
      color: #f87171;
    }
    .card-footer {
      padding: 0 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.75);
      border-top: 2px solid rgba(255, 255, 255, 0.75);
      height: 44px;
      flex-shrink: 0;
    }
    .rating {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 500;
    }
    .rating-stars {
      display: inline-flex;
      align-items: center;
      gap: 1px;
    }
    .rating-star {
      color: #facc15;
      font-size: 13px;
      line-height: 1;
      display: inline-block;
      position: relative;
    }
    .rating-star--half {
      color: rgba(148, 163, 184, 0.4);
    }
    .rating-star--half::before {
      content: "★";
      position: absolute;
      inset: 0;
      color: #facc15;
      width: 50%;
      overflow: hidden;
    }
    .rating-star--empty {
      color: rgba(148, 163, 184, 0.18);
    }
    .rating-value {
      color: #cbd5f5;
      font-weight: 500;
    }
    .rating-count {
      color: #94a3b8;
      font-weight: 400;
    }
    .view-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 6px;
      background: #2563eb;
      color: #f8fafc;
      font-size: 12px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .view-button:hover {
      background: #1d4ed8;
    }
    .view-button:focus-visible {
      outline: 2px solid rgba(59, 130, 246, 0.55);
      outline-offset: 2px;
    }
    .view-button--rated {
      background: #4b5563;
      color: #e5e7eb;
    }
    .view-button--rated:hover {
      background: #334155;
    }
    .view-button svg {
      width: 14px;
      height: 14px;
    }
    .timestamp {
      font-size: 10px;
      color: #94a3b8;
    }
    .spacer {
      min-height: 24px;
    }
    .centered {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: #cbd5f5;
      font-size: 14px;
      padding: 24px;
    }
    .centered strong {
      display: block;
      font-size: 16px;
      margin-bottom: 8px;
      color: #f8fafc;
    }
    .centered p {
      margin: 6px 0 0 0;
      color: #94a3b8;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="viewport">
    <div id="root" style="opacity: 0;"></div>
    <div class="spacer"></div>
  </div>
  <script>
    const root = document.getElementById("root");
    const iconSvgs = {
      bookmark: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21 12 17 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
      flag: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
      gavel: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"></path><path d="M7 21h10"></path><path d="M12 3v18"></path><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"></path></svg>',
      pencil: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/><path d="M15 5l4 4"/></svg>'
    };

    const interactionState = {
      favorites: {},
      reports: {},
    };

    const cloneMap = (source) => {
      const result = {};
      if (!source) return result;
      for (const key of Object.keys(source)) {
        if (source[key]) {
          result[key] = true;
        }
      }
      return result;
    };

    const replaceInteractionState = (incoming) => {
      if (incoming && "favorites" in incoming) {
        interactionState.favorites = cloneMap(incoming.favorites);
      }
      if (incoming && "reports" in incoming) {
        interactionState.reports = cloneMap(incoming.reports);
      }
    };

    const applyInteractionState = () => {
      const cards = root.querySelectorAll("[data-submission-id]");
      cards.forEach((card) => {
        const submissionId = Number(card.getAttribute("data-submission-id"));
        if (!submissionId) return;
        const favoriteButton = card.querySelector('[data-action="favorite"]');
        if (favoriteButton) {
          const isActive = !!interactionState.favorites[submissionId];
          favoriteButton.setAttribute("data-active", isActive ? "true" : "false");
        }
        const reportButton = card.querySelector('[data-action="report"]');
        if (reportButton) {
          const isActive = !!interactionState.reports[submissionId];
          reportButton.setAttribute("data-active", isActive ? "true" : "false");
        }
      });
    };

    let headerEqualizeFrame = null;
    const equalizeHeaderHeights = () => {
      const cards = Array.from(root.querySelectorAll(".card"));
      const rowMap = new Map();

      cards.forEach((card) => {
        const header = card.querySelector(".card-header");
        if (!header) return;
        header.style.minHeight = "";
      });

      cards.forEach((card) => {
        const header = card.querySelector(".card-header");
        if (!header) return;
        const top = Math.round(card.offsetTop);
        if (!rowMap.has(top)) {
          rowMap.set(top, []);
        }
        rowMap.get(top).push(header);
      });

      rowMap.forEach((headers) => {
        let maxContentHeight = 0;
        const measurements = headers.map((header) => {
          const rect = header.getBoundingClientRect();
          const styles = window.getComputedStyle(header);
          const paddingTop = parseFloat(styles.paddingTop) || 0;
          const paddingBottom = 4;
          const borderTop = parseFloat(styles.borderTopWidth) || 0;
          const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
          const contentHeight = rect.height - paddingTop - paddingBottom - borderTop - borderBottom;
          if (contentHeight > maxContentHeight) {
            maxContentHeight = contentHeight;
          }
          return header;
        });

        maxContentHeight = Math.max(maxContentHeight, 0);

        measurements.forEach((header) => {
          header.style.minHeight = \`\${maxContentHeight}px\`;
        });
      });
    };

    const scheduleHeaderEqualization = () => {
      if (headerEqualizeFrame !== null) {
        cancelAnimationFrame(headerEqualizeFrame);
      }
      headerEqualizeFrame = requestAnimationFrame(() => {
        headerEqualizeFrame = null;
        equalizeHeaderHeights();
      });
    };

    const sendTooltipMessage = (type, payload) => {
      window.parent?.postMessage(
        {
          source: "submissions-iframe",
          action: \`tooltip-\${type}\`,
          ...payload,
        },
        "*"
      );
    };

    const serializeRect = (rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });

    const withTooltipTarget = (event, callback) => {
      if (!event.target || typeof event.target.closest !== "function") return;
      const target = event.target.closest("[data-tooltip]");
      if (!target) return;
      callback(target);
    };

    document.addEventListener(
      "pointerenter",
      (event) => {
        withTooltipTarget(event, (target) => {
          const rect = target.getBoundingClientRect();
          sendTooltipMessage("show", {
            text: target.getAttribute("data-tooltip") || "",
            rect: serializeRect(rect),
          });
        });
      },
      true
    );

    document.addEventListener(
      "pointerleave",
      (event) => {
        withTooltipTarget(event, () => {
          sendTooltipMessage("hide");
        });
      },
      true
    );

    document.addEventListener(
      "pointermove",
      (event) => {
        withTooltipTarget(event, (target) => {
          const rect = target.getBoundingClientRect();
          sendTooltipMessage("move", {
            rect: serializeRect(rect),
          });
        });
      },
      true
    );

    window.addEventListener("message", (event) => {
      if (!event?.data) return;
      if (event.data.type === "submissions-update") {
        replaceInteractionState(event.data);
        root.innerHTML = event.data.payload
          .replace(/\\[BOOKMARK_SVG\\]/g, iconSvgs.bookmark)
          .replace(/\\[FLAG_SVG\\]/g, iconSvgs.flag)
          .replace(/\\[GAVEL_SVG\\]/g, iconSvgs.gavel)
          .replace(/\\[PENCIL_SVG\\]/g, iconSvgs.pencil);
        applyInteractionState();
        scheduleHeaderEqualization();
        // Show content after rendering
        requestAnimationFrame(() => {
          root.style.opacity = "1";
        });
        return;
      }

      if (event.data.type === "submissions-interaction") {
        replaceInteractionState(event.data);
        applyInteractionState();
        scheduleHeaderEqualization();
      }
    });

    const performAction = (actionButton) => {
      if (!actionButton) return;
      const card = actionButton.closest("[data-submission-id]");
      if (!card) return;
      const submissionId = Number(card.getAttribute("data-submission-id"));
      if (!submissionId) return;

      const action = actionButton.getAttribute("data-action");
      if (!action) return;

      if (action === "favorite") {
        const isActive = actionButton.getAttribute("data-active") === "true";
        const nextActive = !isActive;
        actionButton.setAttribute("data-active", nextActive ? "true" : "false");
        if (nextActive) {
          interactionState.favorites[submissionId] = true;
        } else {
          delete interactionState.favorites[submissionId];
        }
      } else if (action === "report") {
        // For reports, don't optimistically update - only update after form submission
        // If already reported, allow unreporting (no modal needed)
        const isActive = actionButton.getAttribute("data-active") === "true";
        if (isActive) {
          // Already reported - allow unreporting optimistically
          actionButton.setAttribute("data-active", "false");
          delete interactionState.reports[submissionId];
        }
        // If not reported, don't update UI yet - wait for form submission
      }

      window.parent?.postMessage({
        source: "submissions-iframe",
        action,
        submissionId,
      }, "*");
    };

    document.addEventListener("click", (event) => {
      if (!event.target || typeof event.target.closest !== "function") return;
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      event.preventDefault();
      performAction(actionButton);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!event.target || typeof event.target.closest !== "function") return;
      const actionButton = event.target.closest("[data-action]");
      if (!actionButton) return;
      event.preventDefault();
      performAction(actionButton);
    });

    window.addEventListener("resize", scheduleHeaderEqualization);
  </script>
</body>
</html>`;

interface SubmissionsGalleryProps {
  projectId?: number | null;
  taskId?: string | null;
}

const SubmissionsGallery = ({ projectId, taskId }: SubmissionsGalleryProps = {}) => {
  const [submissions, setSubmissions] = useState<SubmissionCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Record<number, boolean>>({});
  const [reports, setReports] = useState<Record<number, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadingIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favoritesRef = useRef<Record<number, boolean>>(favorites);
  const reportsRef = useRef<Record<number, boolean>>(reports);
  const initialShuffleAppliedRef = useRef(false);
  const viewStateReadyRef = useRef(false);
  const lastLoadedKeyRef = useRef<string | null>(null);
  const [hasFeedbackMap, setHasFeedbackMap] = useState<Record<number, boolean>>({});
  const [hasRatingMap, setHasRatingMap] = useState<Record<number, boolean>>({});
  const feedbackStatusRef = useRef<Record<number, boolean>>({});
  const ratingStatusRef = useRef<Record<number, boolean>>({});
  const [columnCount, setColumnCount] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionCard | null>(null);
  const [selectedSubmissionCode, setSelectedSubmissionCode] = useState<unknown>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    text: string;
    left: number;
    top: number;
    placeAbove: boolean;
  }>({
    visible: false,
    text: "",
    left: 0,
    top: 0,
    placeAbove: true,
  });
  const { user, token } = useAuth();
  const { showSnackbar } = useSnackbar();
  const currentUserId = useMemo(() => {
    if (!user?.id) return null;
    const numeric = Number(user.id);
    return Number.isFinite(numeric) ? numeric : null;
  }, [user?.id]);
  const [ratingScores, setRatingScores] = useState<Record<string, number>>(() => createDefaultScores());
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSuccess, setRatingSuccess] = useState<string | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingSubmissionId, setReportingSubmissionId] = useState<number | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>("random");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    unseen: false,
    saved: false,
    notReported: true, // Default checked
  });
  const sortButtonRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLDivElement>(null);
  const viewStateRef = useRef<ViewState>({
    sortOption,
    sortDirection,
    searchQuery,
    filters,
  });
  const pendingViewStateRef = useRef<ViewState | null>(null);

  useEffect(() => {
    viewStateRef.current = { sortOption, sortDirection, searchQuery, filters };
  }, [sortOption, sortDirection, searchQuery, filters]);

  const persistViewState = useCallback(
    (overrides?: Partial<ViewState>) => {
      const nextState: ViewState = {
        sortOption: overrides?.sortOption ?? viewStateRef.current.sortOption,
        sortDirection: overrides?.sortDirection ?? viewStateRef.current.sortDirection,
        searchQuery: overrides?.searchQuery ?? viewStateRef.current.searchQuery,
        filters: overrides?.filters ?? viewStateRef.current.filters,
      };

      if (!viewStateReadyRef.current || typeof window === "undefined") {
        pendingViewStateRef.current = nextState;
        return;
      }

      try {
        window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(nextState));
      } catch (error) {
        console.warn("[SubmissionsGallery] failed to persist view state", error);
      }
    },
    []
  );

  const handleSearchQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      viewStateRef.current = {
        ...viewStateRef.current,
        searchQuery: nextValue,
      };
      setSearchQuery(nextValue);
      persistViewState({ searchQuery: nextValue });
    },
    [persistViewState]
  );

  const handleSortSelect = useCallback(
    (option: SortOption, direction: SortDirection) => {
      viewStateRef.current = {
        ...viewStateRef.current,
        sortOption: option,
        sortDirection: direction,
      };
      setSortOption(option);
      setSortDirection(direction);
      setShowSortDropdown(false);
      persistViewState({ sortOption: option, sortDirection: direction });
    },
    [persistViewState]
  );

  const handleFilterToggle = useCallback(
    (filterKey: keyof FilterOptions) => {
      const newFilters = {
        ...filters,
        [filterKey]: !filters[filterKey],
      };
      setFilters(newFilters);
      viewStateRef.current = {
        ...viewStateRef.current,
        filters: newFilters,
      };
      persistViewState({ filters: newFilters });
    },
    [filters, persistViewState]
  );

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortButtonRef.current &&
        !sortButtonRef.current.contains(event.target as Node) &&
        showSortDropdown
      ) {
        setShowSortDropdown(false);
      }
      if (
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target as Node) &&
        showFilterDropdown
      ) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSortDropdown, showFilterDropdown]);

const getTooltipPosition = useCallback(
    (
      rect: { left: number; right: number; top: number; bottom: number; width: number; height: number },
      options?: { absolute?: boolean }
    ) => {
      const margin = 8;
      const vw = typeof window !== "undefined" ? window.innerWidth || document.documentElement.clientWidth : 0;
      const vh = typeof window !== "undefined" ? window.innerHeight || document.documentElement.clientHeight : 0;

      let absoluteLeft: number;
      let absoluteRight: number;
      let absoluteTop: number;
      let absoluteBottom: number;

      if (!options?.absolute) {
        const iframe = iframeRef.current;
        if (!iframe) return null;
        const iframeRect = iframe.getBoundingClientRect();
        absoluteLeft = iframeRect.left + rect.left;
        absoluteRight = iframeRect.left + rect.right;
        absoluteTop = iframeRect.top + rect.top;
        absoluteBottom = iframeRect.top + rect.bottom;
      } else {
        absoluteLeft = rect.left;
        absoluteRight = rect.right;
        absoluteTop = rect.top;
        absoluteBottom = rect.bottom;
      }

      const centerX = absoluteLeft + rect.width / 2;
      const spaceAbove = absoluteTop;
      const spaceBelow = vh - absoluteBottom;
      const placeAbove = spaceAbove >= 40 || spaceAbove > spaceBelow;
      const anchorY = placeAbove ? absoluteTop : absoluteBottom;
      const clampedX = Math.min(Math.max(centerX, margin), vw - margin);

      return {
        left: clampedX,
        top: anchorY,
        placeAbove,
      };
    },
    []
  );

  const hideTooltip = useCallback(() => {
    setTooltipState(prev => ({
      ...prev,
      visible: false,
    }));
  }, []);

  const showTooltipForElement = useCallback(
    (element: HTMLElement | null, text: string) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const position = getTooltipPosition(
        {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        { absolute: true }
      );
      if (!position) return;
      setTooltipState({
        visible: true,
        text,
        left: position.left,
        top: position.top,
        placeAbove: position.placeAbove,
      });
    },
    [getTooltipPosition]
  );

  const resetRatingForm = useCallback(() => {
    setRatingScores(createDefaultScores());
    setRatingComment("");
    setRatingError(null);
    setRatingSuccess(null);
  }, []);

  const handleScoreChange = useCallback((dimensionKey: string, value: number) => {
    setRatingScores((prev) => ({
      ...prev,
      [dimensionKey]: value,
    }));
    setRatingError(null);
    setRatingSuccess(null);
  }, []);

  const handleCommentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setRatingComment(event.target.value);
    setRatingError(null);
    setRatingSuccess(null);
  }, []);

  const fetchSubmissionFeedback = useCallback(
    async (submissionId: number): Promise<{ success: true } | { success: false; error: string }> => {
      if (!currentUserId) {
        feedbackStatusRef.current[submissionId] = false;
        return { success: true as const };
      }

      setIsFeedbackLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(
          `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback?voterId=${currentUserId}`,
          {
            method: "GET",
            headers,
          }
        );

        if (response.status === 404) {
          feedbackStatusRef.current[submissionId] = false;
          setHasFeedbackMap((prev) => {
            if (!prev[submissionId]) return prev;
            const next = { ...prev };
            delete next[submissionId];
            return next;
          });
          ratingStatusRef.current[submissionId] = false;
          setHasRatingMap((prev) => {
            if (!prev[submissionId]) return prev;
            const next = { ...prev };
            delete next[submissionId];
            return next;
          });
          return { success: true as const };
        }

        if (!response.ok) {
          let message = `Failed to load feedback (status ${response.status})`;
          try {
            const data = await response.json();
            if (data?.error) {
              message = data.error;
            }
          } catch {
            // ignore parse errors
          }
          throw new Error(message);
        }

        const data = await response.json();
        const nextScores = createDefaultScores();
        const incomingScores = data?.scores ?? {};
        RATING_DIMENSIONS.forEach((dimension) => {
          const rawValue = incomingScores?.[dimension.key];
          const numeric = Number(rawValue);
          if (Number.isFinite(numeric)) {
            nextScores[dimension.key] = Math.min(5, Math.max(1, Math.round(numeric)));
          }
        });

        setRatingScores(nextScores);
        setRatingComment(data?.comment ?? "");
        feedbackStatusRef.current[submissionId] = true;
        setHasFeedbackMap((prev) => {
          if (prev[submissionId]) return prev;
          return { ...prev, [submissionId]: true };
        });
        // Check if there are actual scores (ratings) - must have valid numeric scores
        const scores = data?.scores ?? {};
        const hasScores = scores && typeof scores === 'object' && Object.keys(scores).length > 0 &&
          Object.values(scores).some(score => typeof score === 'number' && score > 0 && score <= 5);
        if (hasScores) {
          ratingStatusRef.current[submissionId] = true;
          setHasRatingMap((prev) => {
            if (prev[submissionId]) return prev;
            return { ...prev, [submissionId]: true };
          });
        } else {
          // Clear rating status if no valid scores
          ratingStatusRef.current[submissionId] = false;
          setHasRatingMap((prev) => {
            if (!prev[submissionId]) return prev;
            const next = { ...prev };
            delete next[submissionId];
            return next;
          });
        }
        return { success: true as const };
      } catch (error: any) {
        feedbackStatusRef.current[submissionId] = false;
        setHasFeedbackMap((prev) => {
          if (!prev[submissionId]) return prev;
          const next = { ...prev };
          delete next[submissionId];
          return next;
        });
        ratingStatusRef.current[submissionId] = false;
        setHasRatingMap((prev) => {
          if (!prev[submissionId]) return prev;
          const next = { ...prev };
          delete next[submissionId];
          return next;
        });
        return {
          success: false as const,
          error: error?.message || "Failed to load your previous feedback.",
        };
      } finally {
        setIsFeedbackLoading(false);
      }
    },
    [currentUserId, token]
  );

  const fetchSubmissions = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.append("limit", "500");
      
      // Filter by project or task
      if (projectId) {
        params.append("projectId", projectId.toString());
      } else if (taskId) {
        params.append("taskId", taskId);
      }
      
      if (currentUserId) {
        params.append("voterId", currentUserId.toString());
        
        // Add filter parameters if any filter is active
        if (filters.unseen) {
          params.append("filterUnseen", "true");
        }
        if (filters.saved) {
          params.append("filterSaved", "true");
        }
        if (filters.notReported) {
          params.append("filterNotReported", "true");
        }
      }

      const response = await fetch(`${ENV.BACKEND_URL}/api/submissions?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load submissions (status ${response.status})`);
      }

      const data: SubmissionsResponse | SubmissionCard[] = await response.json();
      const items = Array.isArray(data) ? data : data?.items ?? [];
      const processedItems = initialShuffleAppliedRef.current ? items : shuffleArray(items);
      if (!controller.signal.aborted) {
        setSubmissions(processedItems);
        if (!initialShuffleAppliedRef.current) {
          initialShuffleAppliedRef.current = true;
        }
        setHasLoaded(true);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[SubmissionsGallery] failed to fetch submissions", err);
      if (!controller.signal.aborted) {
        setError(err?.message || "Failed to load submissions.");
        setSubmissions([]);
        setHasLoaded(true);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [currentUserId, filters, projectId, taskId]);

  const fetchUserFeedbackStatuses = useCallback(async () => {
    if (!currentUserId) {
      setHasFeedbackMap({});
      feedbackStatusRef.current = {};
      setFavorites({});
      setReports({});
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${ENV.BACKEND_URL}/api/users/${currentUserId}/submission-feedback`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        console.warn(`[SubmissionsGallery] failed to load feedback statuses (status ${response.status})`);
        return;
      }

      const data: Array<any> = await response.json();
      const map: Record<number, boolean> = {};
      const savedMap: Record<number, boolean> = {};
      const reportedMap: Record<number, boolean> = {};
      
      // Group by submission_id and get the most recent entry for each
      const mostRecentBySubmission: Record<number, any> = {};
      data?.forEach?.((entry) => {
        const submissionId = Number(entry?.submissionId ?? entry?.submission_id);
        if (!Number.isFinite(submissionId)) return;
        
        const createdAt = entry?.created_at ?? entry?.createdAt;
        const existing = mostRecentBySubmission[submissionId];
        
        // Keep the most recent entry for each submission
        if (!existing || !createdAt) {
          mostRecentBySubmission[submissionId] = entry;
        } else {
          const existingDate = existing?.created_at ?? existing?.createdAt;
          if (createdAt && existingDate && new Date(createdAt) > new Date(existingDate)) {
            mostRecentBySubmission[submissionId] = entry;
          }
        }
      });
      
      // Process the most recent entries
      const ratingMap: Record<number, boolean> = {};
      Object.values(mostRecentBySubmission).forEach((entry) => {
        const submissionId = Number(entry?.submissionId ?? entry?.submission_id);
        if (Number.isFinite(submissionId)) {
          map[submissionId] = true;
          // Check if this feedback has actual rating scores (not just saved/reported)
          const scores = entry?.scores ?? {};
          const hasScores = scores && typeof scores === 'object' && Object.keys(scores).length > 0 &&
            Object.values(scores).some(score => typeof score === 'number' && score > 0 && score <= 5);
          if (hasScores) {
            ratingMap[submissionId] = true;
          }
          // Load saved and reported states from the most recent entry
          if (entry?.is_saved || entry?.isSaved) {
            savedMap[submissionId] = true;
          }
          if (entry?.is_reported || entry?.isReported) {
            reportedMap[submissionId] = true;
          }
        }
      });

      setHasFeedbackMap(map);
      feedbackStatusRef.current = map;
      setHasRatingMap(ratingMap);
      ratingStatusRef.current = ratingMap;
      setFavorites(savedMap);
      setReports(reportedMap);
    } catch (error) {
      console.warn("[SubmissionsGallery] error loading feedback statuses", error);
    }
  }, [currentUserId, token]);

  const handleSubmitRating = useCallback(async () => {
    if (!selectedSubmission) {
      setRatingError("Select a submission to rate first.");
      return;
    }
    if (!currentUserId) {
      setRatingError("You must be signed in to submit a rating.");
      return;
    }
    if (isSubmittingRating) {
      return;
    }

    setIsSubmittingRating(true);
    setRatingError(null);
    setRatingSuccess(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Fetch existing feedback to preserve is_saved and is_reported flags
      let existingIsSaved = false;
      let existingIsReported = false;
      try {
        const existingResponse = await fetch(
          `${ENV.BACKEND_URL}/api/submissions/${selectedSubmission.id}/feedback?voterId=${currentUserId}`,
          { headers }
        );
        if (existingResponse.ok) {
          const existingData = await existingResponse.json();
          existingIsSaved = existingData?.is_saved || existingData?.isSaved || false;
          existingIsReported = existingData?.is_reported || existingData?.isReported || false;
        }
      } catch {
        // If fetch fails, use default values (false)
      }

      const response = await fetch(`${ENV.BACKEND_URL}/api/submissions/${selectedSubmission.id}/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          voterId: currentUserId,
          scores: ratingScores,
          comment: ratingComment.trim() ? ratingComment.trim() : null,
          isSaved: existingIsSaved, // Preserve existing is_saved flag
          isReported: existingIsReported, // Preserve existing is_reported flag
        }),
      });

      if (!response.ok) {
        let message = `Failed to submit rating (status ${response.status})`;
        try {
          const data = await response.json();
          if (data?.error) {
            message = data.error;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      const fetchResult = await fetchSubmissionFeedback(selectedSubmission.id);
      if (!fetchResult.success) {
        setRatingError(fetchResult.error);
      } else {
        setRatingError(null);
        feedbackStatusRef.current[selectedSubmission.id] = true;
        setHasFeedbackMap((prev) => ({ ...prev, [selectedSubmission.id]: true }));
        // Check if there are actual scores (ratings) in the submitted data
        const hasScores = ratingScores && typeof ratingScores === 'object' && Object.keys(ratingScores).length > 0 && 
          Object.values(ratingScores).some(score => typeof score === 'number' && score > 0);
        if (hasScores) {
          ratingStatusRef.current[selectedSubmission.id] = true;
          setHasRatingMap((prev) => ({ ...prev, [selectedSubmission.id]: true }));
        }
      }
      await fetchUserFeedbackStatuses();
      setRatingSuccess("Thanks for sharing your feedback!");
    } catch (error: any) {
      setRatingError(error?.message || "Failed to submit rating. Please try again.");
    } finally {
      setIsSubmittingRating(false);
    }
  }, [
    selectedSubmission,
    currentUserId,
    isSubmittingRating,
    token,
    ratingScores,
    ratingComment,
    fetchSubmissionFeedback,
    fetchUserFeedbackStatuses,
  ]);

  useEffect(() => {
    if (loadingIndicatorTimeoutRef.current) {
      clearTimeout(loadingIndicatorTimeoutRef.current);
      loadingIndicatorTimeoutRef.current = null;
    }

    if (isLoading && !hasLoaded) {
      loadingIndicatorTimeoutRef.current = setTimeout(() => {
        setShowLoadingIndicator(true);
      }, 250);
    } else {
      setShowLoadingIndicator(false);
    }

    return () => {
      if (loadingIndicatorTimeoutRef.current) {
        clearTimeout(loadingIndicatorTimeoutRef.current);
        loadingIndicatorTimeoutRef.current = null;
      }
    };
  }, [isLoading, hasLoaded]);

  useEffect(() => {
    fetchUserFeedbackStatuses();
  }, [fetchUserFeedbackStatuses]);

  useEffect(() => {
    if (!selectedSubmission?.id) {
      resetRatingForm();
      return;
    }

    resetRatingForm();
    let cancelled = false;
    (async () => {
      const result = await fetchSubmissionFeedback(selectedSubmission.id);
      if (!cancelled) {
        if (!result.success) {
          setRatingError(result.error);
        } else {
          setRatingError(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSubmission?.id, resetRatingForm, fetchSubmissionFeedback]);

  const loadSubmissionDetail = useCallback(
    async (submission: SubmissionCard) => {
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;
      setIsDetailLoading(true);
      setDetailError(null);
      setSelectedSubmissionCode(null);

      try {
        const response = await fetch(`${ENV.BACKEND_URL}/api/submissions/${submission.id}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
          throw new Error(`Failed to load submission (status ${response.status})`);
        }

        const data = await response.json();
        let parsedCode: unknown = data?.code ?? null;
        if (typeof parsedCode === "string") {
          try {
            parsedCode = JSON.parse(parsedCode);
          } catch {
            // keep string fallback
          }
        }
        setSelectedSubmissionCode(parsedCode);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
        console.error("[SubmissionsGallery] failed to fetch submission detail", err);
        setDetailError(err?.message || "Failed to load submission preview.");
    } finally {
      if (!controller.signal.aborted) {
          setIsDetailLoading(false);
        }
        if (detailAbortRef.current === controller) {
          detailAbortRef.current = null;
        }
      }
    },
    []
  );

  const handleViewSubmission = useCallback(
    (submission: SubmissionCard) => {
      setSelectedSubmission(submission);
      loadSubmissionDetail(submission);
      hideTooltip();
    try {
      window.dispatchEvent(new CustomEvent("view-submission", { detail: submission }));
    } catch {
      // no-op
    }
    console.log("[SubmissionsGallery] view submission", submission);
    },
    [hideTooltip, loadSubmissionDetail]
  );

  const toggleFavorite = useCallback(async (submissionId: number) => {
    if (!currentUserId) {
      return;
    }

    const submission = submissions.find((item) => item.id === submissionId);
    if (!submission) {
      return;
    }

    const newIsSaved = !favorites[submissionId];
    
    // Optimistically update UI
    setFavorites(prev => {
      const next = { ...prev };
      if (newIsSaved) {
        next[submissionId] = true;
      } else {
        delete next[submissionId];
      }
      return next;
    });

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Fetch existing feedback to preserve scores if they exist
      let existingScores: Record<string, number> = {};
      let existingComment: string | null = null;
      try {
        const existingResponse = await fetch(
          `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback?voterId=${currentUserId}`,
          { headers }
        );
        if (existingResponse.ok) {
          const existingData = await existingResponse.json();
          existingScores = existingData?.scores ?? {};
          existingComment = existingData?.comment ?? null;
        }
      } catch {
        // If fetch fails, use empty scores (will create new record)
      }

      // Create a new record, preserving existing scores and comment if they exist
      const response = await fetch(
        `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            voterId: currentUserId,
            scores: existingScores, // Preserve existing scores or use empty dict
            comment: existingComment, // Preserve existing comment
            isSaved: newIsSaved,
          }),
        }
      );

      if (!response.ok) {
        // Revert optimistic update on error
        setFavorites(prev => {
          const next = { ...prev };
          if (newIsSaved) {
        delete next[submissionId];
      } else {
        next[submissionId] = true;
      }
      return next;
    });
        console.error("Failed to update save status");
      } else {
        // Refresh the saved/reported states from the database to get the most recent
        await fetchUserFeedbackStatuses();
      }
    } catch (error) {
      // Revert optimistic update on error
      setFavorites(prev => {
        const next = { ...prev };
        if (newIsSaved) {
          delete next[submissionId];
        } else {
          next[submissionId] = true;
        }
        return next;
      });
      console.error("Error updating save status:", error);
    }
  }, [currentUserId, token, submissions, favorites, fetchUserFeedbackStatuses]);

  const handleReportSubmit = useCallback(async (reportType: string, rationale: string) => {
    if (!reportingSubmissionId || !currentUserId) {
      return;
    }

    setIsSubmittingReport(true);

    try {
      const submissionId = reportingSubmissionId;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Fetch existing feedback to preserve scores if they exist
      let existingScores: Record<string, number> = {};
      let existingComment: string | null = null;
      try {
        const existingResponse = await fetch(
          `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback?voterId=${currentUserId}`,
          { headers }
        );
        if (existingResponse.ok) {
          const existingData = await existingResponse.json();
          existingScores = existingData?.scores ?? {};
          existingComment = existingData?.comment ?? null;
        }
      } catch {
        // If fetch fails, use empty scores (will create new record)
      }

      // Create a new record, preserving existing scores and comment if they exist
      const response = await fetch(
        `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            voterId: currentUserId,
            scores: existingScores, // Preserve existing scores or use empty dict
            comment: existingComment, // Preserve existing comment
            isReported: true,
            reportType: reportType,
            reportRationale: rationale,
          }),
        }
      );

      if (!response.ok) {
        console.error("Failed to submit report");
        throw new Error("Failed to submit report");
      } else {
        // Optimistically update UI
        setReports(prev => {
          const next = { ...prev };
          next[submissionId] = true;
          return next;
        });
        // Refresh the saved/reported states from the database to get the most recent
        await fetchUserFeedbackStatuses();
        // Close modal
        setShowReportModal(false);
        setReportingSubmissionId(null);
        // Show success snackbar
        showSnackbar("Thanks for reporting! Your help makes VibeCodeArena better");
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      throw error;
    } finally {
      setIsSubmittingReport(false);
    }
  }, [reportingSubmissionId, currentUserId, token, fetchUserFeedbackStatuses]);

  const toggleReport = useCallback(async (submissionId: number) => {
    if (!currentUserId) {
      return;
    }

    const submission = submissions.find((item) => item.id === submissionId);
    if (!submission) {
      return;
    }

    // If already reported, allow unreporting directly
    if (reports[submissionId]) {
      const newIsReported = false;
      
      // Optimistically update UI
      setReports(prev => {
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        // Fetch existing feedback to preserve scores if they exist
        let existingScores: Record<string, number> = {};
        let existingComment: string | null = null;
        try {
          const existingResponse = await fetch(
            `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback?voterId=${currentUserId}`,
            { headers }
          );
          if (existingResponse.ok) {
            const existingData = await existingResponse.json();
            existingScores = existingData?.scores ?? {};
            existingComment = existingData?.comment ?? null;
          }
        } catch {
          // If fetch fails, use empty scores (will create new record)
        }

        // Create a new record, preserving existing scores and comment if they exist
        const response = await fetch(
          `${ENV.BACKEND_URL}/api/submissions/${submissionId}/feedback`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              voterId: currentUserId,
              scores: existingScores, // Preserve existing scores or use empty dict
              comment: existingComment, // Preserve existing comment
              isReported: newIsReported,
            }),
          }
        );

        if (!response.ok) {
          // Revert optimistic update on error
          setReports(prev => {
            const next = { ...prev };
            next[submissionId] = true;
            return next;
          });
          console.error("Failed to update report status");
        } else {
          // Refresh the saved/reported states from the database to get the most recent
          await fetchUserFeedbackStatuses();
        }
      } catch (error) {
        // Revert optimistic update on error
        setReports(prev => {
          const next = { ...prev };
          next[submissionId] = true;
          return next;
        });
        console.error("Error updating report status:", error);
      }
    } else {
      // If not reported, show the modal
      setReportingSubmissionId(submissionId);
      setShowReportModal(true);
    }
  }, [currentUserId, token, submissions, reports, fetchUserFeedbackStatuses]);

  const handleBackToList = useCallback(() => {
    detailAbortRef.current?.abort();
    setSelectedSubmission(null);
    setSelectedSubmissionCode(null);
    setDetailError(null);
    setIsDetailLoading(false);
    hideTooltip();
    try {
      window.dispatchEvent(new CustomEvent("exit-submission-view"));
    } catch {
      // no-op
    }
  }, [hideTooltip]);

  // Create a cache key based on projectId/taskId
  const cacheKey = useMemo(() => {
    if (projectId) return `project-${projectId}`;
    if (taskId) return `task-${taskId}`;
    return 'all';
  }, [projectId, taskId]);

  // Only fetch submissions when projectId/taskId changes (first load for this task/project)
  useEffect(() => {
    // If we've already loaded for this project/task, skip fetching
    if (lastLoadedKeyRef.current === cacheKey && hasLoaded) {
      return;
    }

    // If the project/task changed, reset state
    if (lastLoadedKeyRef.current !== cacheKey && lastLoadedKeyRef.current !== null) {
      setSubmissions([]);
      setHasLoaded(false);
      setIsLoading(true);
      initialShuffleAppliedRef.current = false;
    }

    // Mark this key as being loaded
    lastLoadedKeyRef.current = cacheKey;
    
    fetchSubmissions();
    return () => {
      abortRef.current?.abort();
    };
  }, [cacheKey, fetchSubmissions, hasLoaded]);

  // Refetch submissions when filters change (but only if we've already loaded for current project/task)
  useEffect(() => {
    if (viewStateReadyRef.current && hasLoaded && lastLoadedKeyRef.current === cacheKey) {
      fetchSubmissions();
    }
  }, [filters, fetchSubmissions, hasLoaded, cacheKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateColumns = () => {
      const width = element.getBoundingClientRect().width;
      if (width >= 900) {
        setColumnCount(3);
      } else if (width >= 600) {
        setColumnCount(2);
      } else {
        setColumnCount(1);
      }
    };

    updateColumns();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateColumns());
      observer.observe(element);
    }

    window.addEventListener("resize", updateColumns);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateColumns);
    };
  }, [hasLoaded, submissions.length]);


  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    reportsRef.current = reports;
  }, [reports]);

  useEffect(() => {
    return () => {
      detailAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const iframeWindow = iframeRef.current?.contentWindow;
    if (!iframeWindow) return;
    try {
      iframeWindow.postMessage(
        {
          type: "submissions-interaction",
          favorites,
          reports,
        },
        "*"
      );
    } catch (err) {
      console.warn("[SubmissionsGallery] failed to post interaction state", err);
    }
  }, [favorites, reports]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored) as {
        sortOption?: SortOption;
        sortDirection?: SortDirection;
        searchQuery?: string;
        filters?: FilterOptions;
      };
      const currentState = viewStateRef.current;
      let nextSearchQuery = currentState.searchQuery;
      let nextSortOption = currentState.sortOption;
      let nextSortDirection = currentState.sortDirection;
      let nextFilters = currentState.filters;

      if (parsed?.searchQuery !== undefined) {
        nextSearchQuery = parsed.searchQuery;
      }
      if (parsed?.sortOption && ["random", "title", "averageScore"].includes(parsed.sortOption)) {
        nextSortOption = parsed.sortOption;
      }
      if (parsed?.sortDirection && ["asc", "desc"].includes(parsed.sortDirection)) {
        nextSortDirection = parsed.sortDirection;
      }
      if (parsed?.filters) {
        nextFilters = {
          unseen: parsed.filters.unseen ?? false,
          saved: parsed.filters.saved ?? false,
          notReported: parsed.filters.notReported ?? true,
        };
      }

      viewStateRef.current = {
        sortOption: nextSortOption,
        sortDirection: nextSortDirection,
        searchQuery: nextSearchQuery,
        filters: nextFilters,
      };

      if (nextSearchQuery !== currentState.searchQuery) {
        setSearchQuery(nextSearchQuery);
      }
      if (nextSortOption !== currentState.sortOption) {
        setSortOption(nextSortOption);
      }
      if (nextSortDirection !== currentState.sortDirection) {
        setSortDirection(nextSortDirection);
      }
      if (JSON.stringify(nextFilters) !== JSON.stringify(currentState.filters)) {
        setFilters(nextFilters);
      }
    } catch (error) {
      console.warn("[SubmissionsGallery] failed to restore view state", error);
    } finally {
      viewStateReadyRef.current = true;
      if (pendingViewStateRef.current && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            VIEW_STATE_STORAGE_KEY,
            JSON.stringify(pendingViewStateRef.current)
          );
        } catch (error) {
          console.warn("[SubmissionsGallery] failed to persist pending view state", error);
        } finally {
          pendingViewStateRef.current = null;
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!viewStateReadyRef.current) {
      return;
    }
    persistViewState();
  }, [persistViewState, sortOption, sortDirection, searchQuery, filters]);

  const filteredSubmissions = useMemo<SubmissionCard[]>(() => {
    let result = submissions;

    // Apply search query filter (client-side since it's just text search)
    if (searchQuery.trim()) {
    const normalizedQuery = searchQuery.trim().toLowerCase();
      result = result.filter((submission) => {
      const title = (submission.title ?? "").toLowerCase();
      return title.includes(normalizedQuery);
    });
    }

    // Note: Filters (unseen, saved, notReported) are now applied at the SQL level
    // in fetchSubmissions, so we don't need to filter here anymore

    return result;
  }, [searchQuery, submissions]);

  const sortedSubmissions = useMemo(() => {
    if (sortOption === "random") {
      // For random, return filtered submissions as-is (they're already shuffled on initial load)
      return filteredSubmissions;
    }

    const items = [...filteredSubmissions];
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    items.sort((a, b) => {
      let comparison = 0;
      switch (sortOption) {
        case "title": {
          const titleA = normalizeWhitespace(a.title ?? "Untitled Submission").toLowerCase();
          const titleB = normalizeWhitespace(b.title ?? "Untitled Submission").toLowerCase();
          comparison = titleA.localeCompare(titleB);
          break;
        }
        case "averageScore": {
          const averageA =
            typeof a.ratingSummary?.average === "number" && Number.isFinite(a.ratingSummary.average)
              ? a.ratingSummary.average
              : null;
          const averageB =
            typeof b.ratingSummary?.average === "number" && Number.isFinite(b.ratingSummary.average)
              ? b.ratingSummary.average
              : null;
          if (averageA === null && averageB === null) {
            comparison = 0;
          } else if (averageA === null) {
            comparison = 1;
          } else if (averageB === null) {
            comparison = -1;
          } else {
            comparison = averageA - averageB;
          }
          break;
        }
        default:
          comparison = 0;
      }

      if (comparison === 0) {
        comparison = a.id - b.id;
      }

      return comparison * directionMultiplier;
    });

    return items;
  }, [filteredSubmissions, sortDirection, sortOption]);

  const selectedSubmissionPreview = useMemo(() => {
    if (!selectedSubmissionCode) return null;
    return normalizeSubmissionCode(selectedSubmissionCode);
  }, [selectedSubmissionCode]);

  const hasSelectedPreview = useMemo(() => {
    if (!selectedSubmissionPreview) return false;
    const { html, css, js } = selectedSubmissionPreview;
    return Boolean(html?.trim() || css?.trim() || js?.trim());
  }, [selectedSubmissionPreview]);

const isDetailView = !!selectedSubmission;
const selectedTitle =
  selectedSubmission && (normalizeWhitespace(selectedSubmission.title ?? "") || "Untitled Submission");
const isSelectedFavorite = selectedSubmission ? !!favorites[selectedSubmission.id] : false;
const isSelectedReported = selectedSubmission ? !!reports[selectedSubmission.id] : false;

  const iframeContent = useMemo(() => {
    if (isLoading && !hasLoaded && showLoadingIndicator) {
      return `<div class="centered"><strong>Loading submissions…</strong>Please hold on while we fetch the latest projects.</div>`;
    }

    if (error) {
      return `<div class="centered"><strong>Failed to load submissions</strong>${escapeHtml(error)}</div>`;
    }

    if (!filteredSubmissions.length && hasLoaded) {
      if (submissions.length === 0) {
        return `<div class="centered"><strong>No submissions yet</strong><p>Be the first to showcase your project!</p></div>`;
      }
      return `<div class="centered"><strong>No projects match your search</strong><p>Try a different title.</p></div>`;
    }

        const grid = sortedSubmissions
      .map((submission) => {
        const isFavorite = !!favoritesRef.current[submission.id];
        const isReported = !!reportsRef.current[submission.id];
        // Check if user has provided actual rating scores (not just saved/reported)
        const hasRating = !!(currentUserId && (hasRatingMap[submission.id] || ratingStatusRef.current?.[submission.id]));
        const isOwnSubmission = currentUserId !== null && submission.userId === currentUserId;
        const description = (submission.description ?? "").trim();
        const normalizedTitle =
          normalizeWhitespace(submission.title ?? "Untitled Submission") || "Untitled Submission";
        const escapedTitle = escapeHtml(normalizedTitle);
        const yoursIndicator = isOwnSubmission ? ` <span style="color: #60a5fa; font-weight: 700;">(Yours)</span>` : "";
        const headerHtml =
          `<header class="card-header">` +
          `<h3 class="card-title">${escapedTitle}${yoursIndicator}</h3>` +
          `<div class="card-header-controls">` +
          `<div class="icon-button" role="button" tabindex="0" data-action="favorite" data-active="${isFavorite}" data-tooltip="Save">[BOOKMARK_SVG]</div>` +
          `<div class="icon-button" role="button" tabindex="0" data-action="report" data-active="${isReported}" data-tooltip="Report">[FLAG_SVG]</div>` +
          `</div>` +
          `</header>`;
          const overlayHtml =
            description.length > 0
                    ? `<div class="overlay">${escapeHtml(description).replace(/\n/g, "<br/>")}</div>`
              : "";
          const bodyHtml =
            `<div class="card-figure">` +
            `<img src="${escapeHtml(submission.image || FALLBACK_IMAGE)}" alt="${escapedTitle} preview" class="card-figure-img" loading="lazy" />` +
            overlayHtml +
            `</div>`;
        const ratingSummary = submission.ratingSummary;
        const averageScore =
          typeof ratingSummary?.average === "number" && Number.isFinite(ratingSummary.average)
            ? Math.max(0, Math.min(5, ratingSummary.average))
            : null;
        const totalRatings = ratingSummary?.count ?? 0;
        const ratingStarsHtml = (() => {
          const effectiveAverage = averageScore ?? 0;
          let html = "";
          for (let i = 1; i <= 5; i += 1) {
            let starClass = "rating-star";
            if (effectiveAverage >= i) {
              starClass = "rating-star";
            } else if (effectiveAverage >= i - 0.5) {
              starClass = "rating-star rating-star--half";
            } else {
              starClass = "rating-star rating-star--empty";
            }
            html += `<span class="${starClass}">★</span>`;
          }
          return html;
        })();
        const ratingValueDisplay =
          averageScore !== null && totalRatings > 0 ? averageScore.toFixed(1) : "New";
        const ratingAriaLabel =
          totalRatings > 0 && averageScore !== null
            ? `Rated ${ratingValueDisplay} out of 5 (${totalRatings} rating${totalRatings === 1 ? "" : "s"})`
            : "No ratings yet";
          const footerHtml =
            `<footer class="card-footer">` +
            `<button class="view-button${hasRating ? " view-button--rated" : ""}" data-action="view">` +
            `${hasRating ? "[PENCIL_SVG] Edit Rating" : "[GAVEL_SVG] Judge"}` +
            `</button>` +
            `<div class="rating" aria-label="${ratingAriaLabel}">` +
            (totalRatings > 0 && averageScore !== null
              ? `<span class="rating-value">${ratingValueDisplay}</span>` +
                `<span class="rating-stars" aria-hidden="true">${ratingStarsHtml}</span>` +
                `<span class="rating-count">(${totalRatings})</span>`
              : `<span class="rating-value">New</span>`) +
            `</div>` +
            `</footer>`;
        return `<article class="card" data-submission-id="${submission.id}">${headerHtml}${bodyHtml}${footerHtml}</article>`;
      })
      .join("");

    return `<div class="grid" style="grid-template-columns: repeat(${columnCount}, minmax(0, 1fr));">${grid}</div>`;
  }, [
    columnCount,
    currentUserId,
    error,
    filteredSubmissions,
    sortedSubmissions,
    hasFeedbackMap,
    showLoadingIndicator,
    hasLoaded,
    isLoading,
    submissions,
  ]);

  useEffect(() => {
    if (isDetailView) {
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) return;

    const sendContent = () => {
      try {
        iframe.contentWindow?.postMessage(
          {
            type: "submissions-update",
            payload: iframeContent,
            favorites: favoritesRef.current,
            reports: reportsRef.current,
          },
          "*"
        );
      } catch (err) {
        console.warn("[SubmissionsGallery] failed to post message to iframe", err);
      }
    };

    const onLoad = () => {
      sendContent();
    };

    iframe.addEventListener("load", onLoad);
    if (iframe.contentDocument?.readyState === "complete") {
      onLoad();
    }

    return () => {
      iframe.removeEventListener("load", onLoad);
    };
  }, [iframeContent, isDetailView]);

  useEffect(() => {
    const handleIframeAction = (event: MessageEvent<any>) => {
      const data = event.data;
      if (!data || data.source !== "submissions-iframe") return;
      if (data.action === "tooltip-show" || data.action === "tooltip-move" || data.action === "tooltip-hide") {
        if (data.action === "tooltip-hide") {
          setTooltipState((prev) => ({
            ...prev,
            visible: false,
          }));
          return;
        }

        if (!data.rect) {
          if (data.action === "tooltip-show") {
            setTooltipState((prev) => ({
              ...prev,
              visible: false,
            }));
          }
          return;
        }

        const position = getTooltipPosition(data.rect);
        if (!position) return;

        if (data.action === "tooltip-show") {
          setTooltipState({
            visible: true,
            text: data.text || "",
            left: position.left,
            top: position.top,
            placeAbove: position.placeAbove,
          });
        } else {
          setTooltipState((prev) => ({
            ...prev,
            visible: true,
            left: position.left,
            top: position.top,
            placeAbove: position.placeAbove,
          }));
        }
        return;
      }

      const submissionId = Number(data.submissionId);
      if (!submissionId) return;
      const submission = submissions.find((item) => item.id === submissionId);
      if (!submission) return;

      switch (data.action) {
        case "view":
          handleViewSubmission(submission);
          break;
        case "favorite":
          toggleFavorite(submissionId);
          break;
        case "report":
          toggleReport(submissionId);
          break;
        default:
          break;
      }
    };

    window.addEventListener("message", handleIframeAction);
    return () => window.removeEventListener("message", handleIframeAction);
  }, [getTooltipPosition, handleViewSubmission, submissions, toggleFavorite, toggleReport]);

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden border border-gray-600/50 bg-gray-900/40">
        {isDetailView ? (
          <div className="flex items-center space-x-3 flex-shrink-0 bg-gray-800/30 px-4 py-2">
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={handleBackToList}
                data-tooltip="Back to submissions"
                onPointerEnter={(event) => showTooltipForElement(event.currentTarget as HTMLElement, "Back to submissions")}
                onPointerMove={(event) => showTooltipForElement(event.currentTarget as HTMLElement, "Back to submissions")}
                onPointerLeave={hideTooltip}
                className="rounded-lg border border-gray-700/70 bg-gray-800 p-2 text-gray-200 transition-colors hover:bg-gray-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-white">
                  {selectedTitle}
                  {selectedSubmission && currentUserId !== null && selectedSubmission.userId === currentUserId && (
                    <span className="ml-1.5 text-blue-400 font-bold">(yours)</span>
                  )}
                </h2>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                data-tooltip={isSelectedFavorite ? "Remove bookmark" : "Save"}
                onClick={() => selectedSubmission && toggleFavorite(selectedSubmission.id)}
                aria-pressed={isSelectedFavorite}
                onPointerEnter={(event) =>
                  showTooltipForElement(
                    event.currentTarget as HTMLElement,
                    isSelectedFavorite ? "Remove bookmark" : "Save"
                  )
                }
                onPointerMove={(event) =>
                  showTooltipForElement(
                    event.currentTarget as HTMLElement,
                    isSelectedFavorite ? "Remove bookmark" : "Save"
                  )
                }
                onPointerLeave={hideTooltip}
                className={`rounded-full border border-transparent p-2 transition-colors ${
                  isSelectedFavorite ? "bg-blue-500/15 text-blue-400" : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                <Bookmark
                  className="h-4 w-4"
                  strokeWidth={2}
                  fill={isSelectedFavorite ? "currentColor" : "none"}
                />
              </button>
              <button
                type="button"
                data-tooltip={isSelectedReported ? "Unreport" : "Report"}
                onClick={() => selectedSubmission && toggleReport(selectedSubmission.id)}
                aria-pressed={isSelectedReported}
                onPointerEnter={(event) =>
                  showTooltipForElement(
                    event.currentTarget as HTMLElement,
                    isSelectedReported ? "Unreport" : "Report"
                  )
                }
                onPointerMove={(event) =>
                  showTooltipForElement(
                    event.currentTarget as HTMLElement,
                    isSelectedReported ? "Unreport" : "Report"
                  )
                }
                onPointerLeave={hideTooltip}
                className={`rounded-full border border-transparent p-2 transition-colors ${
                  isSelectedReported ? "bg-red-500/15 text-red-400" : "text-gray-300 hover:bg-gray-700"
                }`}
              >
                <Flag
                  className="h-4 w-4"
                  strokeWidth={2}
                  fill={isSelectedReported ? "currentColor" : "none"}
                />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-3 flex-shrink-0 bg-gray-800/30 border-b border-gray-700/50 px-4 py-2">
            <div className="flex items-center space-x-3 flex-[2] min-w-0">
              <div className="relative flex-1 min-w-0">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchQueryChange}
                  placeholder="Search by title"
                  className="block w-full rounded-lg border border-gray-700/70 bg-gray-800 pl-10 pr-3 py-1.5 text-sm text-white placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="relative" ref={sortButtonRef}>
                <button
                  type="button"
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="p-2 rounded-lg border border-gray-700/70 bg-gray-800 hover:bg-gray-700 transition-colors"
                  aria-label="Sort submissions"
                >
                  <ArrowUpDown className="h-4 w-4 text-gray-400" />
                </button>
                {showSortDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 shadow-lg z-50 min-w-[160px]">
                    <button
                      type="button"
                      onClick={() => handleSortSelect("title", "asc")}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 ${
                        sortOption === "title" && sortDirection === "asc" ? "bg-gray-700 text-blue-400" : "text-gray-300"
                      }`}
                    >
                      Name (asc)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSortSelect("title", "desc")}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 ${
                        sortOption === "title" && sortDirection === "desc" ? "bg-gray-700 text-blue-400" : "text-gray-300"
                      }`}
                    >
                      Name (desc)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSortSelect("averageScore", "asc")}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 ${
                        sortOption === "averageScore" && sortDirection === "asc" ? "bg-gray-700 text-blue-400" : "text-gray-300"
                      }`}
                    >
                      Score (asc)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSortSelect("averageScore", "desc")}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 ${
                        sortOption === "averageScore" && sortDirection === "desc" ? "bg-gray-700 text-blue-400" : "text-gray-300"
                      }`}
                    >
                      Score (desc)
                    </button>
                  </div>
                )}
              </div>
              <div className="relative" ref={filterButtonRef}>
                <button
                  type="button"
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className="p-2 rounded-lg border border-gray-700/70 bg-gray-800 hover:bg-gray-700 transition-colors"
                  aria-label="Filter submissions"
                >
                  <Filter className="h-4 w-4 text-gray-400" />
                </button>
                {showFilterDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 shadow-lg z-50 min-w-[200px]">
                    <div className="px-4 py-2 text-xs font-semibold text-gray-400 border-b border-gray-700">
                      Only show:
                    </div>
            <label className="flex items-center px-4 py-2 hover:bg-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.unseen}
                onChange={() => handleFilterToggle("unseen")}
                className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">Not rated</span>
            </label>
                    <label className="flex items-center px-4 py-2 hover:bg-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.saved}
                        onChange={() => handleFilterToggle("saved")}
                        className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Saved</span>
                    </label>
                    <label className="flex items-center px-4 py-2 hover:bg-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.notReported}
                        onChange={() => handleFilterToggle("notReported")}
                        className="mr-2 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Not Reported</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4 flex-[1] justify-end">
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <div className="w-4 h-4 rounded-full border-2 border-gray-600 bg-gray-800 relative">
                  <div className="absolute inset-0 rounded-full bg-blue-500" style={{ clipPath: "circle(50% at 50% 50%)" }} />
                </div>
                <span>{filteredSubmissions.length} projects</span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  className="rounded-lg border border-gray-700/70 bg-gray-800 p-2 transition-colors hover:bg-gray-700"
                  data-tooltip="Refresh Submissions"
                  aria-label="Refresh submissions"
                  onClick={() => {
                    setSubmissions([]);
                    setHasLoaded(false);
                    fetchSubmissions();
                  }}
                  onPointerEnter={(event) => showTooltipForElement(event.currentTarget as HTMLElement, "Refresh Submissions")}
                  onPointerMove={(event) => showTooltipForElement(event.currentTarget as HTMLElement, "Refresh Submissions")}
                  onPointerLeave={hideTooltip}
                >
                  <RefreshCw className="h-4 w-4 text-white" />
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-gray-700/70 bg-gray-800 p-2 transition-colors hover:bg-gray-700"
                  data-tooltip="Random Choice"
                  aria-label="Open a random project"
                  onClick={() => {
                    if (!filteredSubmissions.length) {
                      return;
                    }
                    const randomIndex = Math.floor(Math.random() * filteredSubmissions.length);
                    const randomSubmission = filteredSubmissions[randomIndex] ?? null;
                    if (randomSubmission) {
                      handleViewSubmission(randomSubmission);
                    }
                  }}
                  onPointerEnter={(event) => showTooltipForElement(event.currentTarget as HTMLElement, "Random Choice")}
                  onPointerMove={(event) => showTooltipForElement(event.currentTarget as HTMLElement, "Random Choice")}
                  onPointerLeave={hideTooltip}
                >
                  <Shuffle className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden" ref={isDetailView ? undefined : containerRef}>
          {isDetailView ? (
            <div className="flex h-full w-full bg-gray-950/40">
              {isDetailLoading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-gray-300">
                  Loading submission preview…
                </div>
              ) : detailError ? (
                <div className="flex flex-1 items-center justify-center text-sm text-red-400">
                  {detailError}
                </div>
              ) : hasSelectedPreview && selectedSubmissionPreview ? (
                <>
                  <div className="flex-1 border-r border-gray-800/60 bg-black">
                    <PreviewIframe
                      key={selectedSubmission?.id ?? "detail-view"}
                      htmlContent={selectedSubmissionPreview.html}
                      cssContent={selectedSubmissionPreview.css}
                      jsContent={selectedSubmissionPreview.js}
                      className="h-full w-full border-none bg-black"
                    />
                  </div>
                  <div className="flex w-80 flex-col gap-4 bg-gray-900/70 p-4">
        <div>
                      <h3 className="text-sm font-semibold text-white pb-2">Rate this submission</h3>
                      <p className="text-xs text-gray-400 pb-2">
                        Provide a score for each category from 1 (needs work) to 5 (outstanding).
                      </p>
                      {!currentUserId && (
                        <p className="mt-1 text-xs text-amber-400">
                          Sign in to submit your rating. You can still explore the criteria below.
                        </p>
                      )}
                      {isFeedbackLoading && currentUserId && (
                        <p className="mt-1 text-[11px] text-gray-500">Loading your saved rating…</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      {RATING_DIMENSIONS.map((dimension) => (
                        <div key={dimension.key} className="flex flex-col gap-1">
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                            <span>{dimension.name}: <span className="font-light">{ratingScores[dimension.key] ?? 3}</span></span>
                            <span
                              data-tooltip={dimension.description}
                              onPointerEnter={(event) =>
                                showTooltipForElement(event.currentTarget as HTMLElement, dimension.description)
                              }
                              onPointerMove={(event) =>
                                showTooltipForElement(event.currentTarget as HTMLElement, dimension.description)
                              }
                              onPointerLeave={hideTooltip}
                              onFocus={(event) =>
                                showTooltipForElement(event.currentTarget as HTMLElement, dimension.description)
                              }
                              onBlur={hideTooltip}
                              tabIndex={0}
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 text-[10px] text-gray-400 hover:border-blue-500 hover:text-blue-400"
                            >
                              ?
                            </span>
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={5}
                            step={1}
                            value={ratingScores[dimension.key] ?? 3}
                            onChange={(event) => handleScoreChange(dimension.key, Number(event.target.value))}
                            aria-label={`${dimension.name} rating`}
                            className="w-full accent-blue-500"
                          />
                          <div className="flex justify-between text-[11px] text-gray-500">
                            <span>1</span>
                            <span>2</span>
                            <span>3</span>
                            <span>4</span>
                            <span>5</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-300" htmlFor="submission-feedback">
                        Comments
                      </label>
                      <textarea
                        id="submission-feedback"
                        placeholder="Share any additional thoughts..."
                        value={ratingComment}
                        onChange={handleCommentChange}
                        className="h-24 resize-none rounded-md border border-gray-700/70 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                      {ratingSuccess && (
                        <p className="text-xs text-emerald-400">{ratingSuccess}</p>
                      )}
                      {ratingError && (
                        <p className="text-xs text-red-400">{ratingError}</p>
                      )}
        </div>
        <button
                      type="button"
                      onClick={handleSubmitRating}
                      disabled={isSubmittingRating || !currentUserId}
                      className="mt-auto rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      data-project-mode="true"
                    >
                      {isSubmittingRating ? "Submitting…" : "Submit rating"}
        </button>
      </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
                  No preview available for this submission.
                </div>
              )}
            </div>
          ) : (
        <iframe
          ref={iframeRef}
          title="Submissions Feed"
          className="h-full w-full border-none"
          srcDoc={IFRAME_TEMPLATE}
          sandbox="allow-scripts allow-same-origin"
        />
          )}
      </div>
    </div>
      {tooltipState.visible && typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              left: tooltipState.left,
              top: tooltipState.top,
              transform: tooltipState.placeAbove
                ? "translate(-50%, -100%) translateY(-4px)"
                : "translate(-50%, 4px)",
              backgroundColor: "#ffffff",
              color: "#000000",
              fontSize: "12px",
              padding: "4px 8px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
              zIndex: 100000,
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {tooltipState.text}
          </div>,
          document.body
        )}
      <ReportSubmissionModal
        show={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportingSubmissionId(null);
        }}
        onSubmit={handleReportSubmit}
        isSubmitting={isSubmittingReport}
      />
    </>
  );
};

export default SubmissionsGallery;

