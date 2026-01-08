"use client";
import React, { useState, useEffect, useRef, createContext, useContext, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { getCookie, setCookie } from "../utils/cookies";
import { ENV } from "../config/env";

export type PopupState = 'none' | 'pre-test' | 'post-test' | 'tutorial';

type TutorialCookieState = 'unseen' | 'seen' | 'dismissed';

const TUTORIAL_COOKIE_NAME = `${ENV.COOKIE_PREFIX}tutorial_state`;

interface UserStudyPopupContextType {
  popupState: PopupState;
  setPopupState: (state: PopupState) => void;
  recalculateState?: () => Promise<void>;
  isCalculating?: boolean;
  onTutorialClose?: () => void;
  preTestCompleted?: boolean | null;
  postTestCompleted?: boolean | null;
}

export const UserStudyPopupContext = createContext<UserStudyPopupContextType | undefined>(undefined);

export function useUserStudyPopup() {
  const context = useContext(UserStudyPopupContext);
  if (!context) {
    throw new Error('useUserStudyPopup must be used within UserStudyPopupProvider');
  }
  return context;
}

const VIDEO_THRESHOLD_SECONDS = 30;

function UserStudyPopupInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { popupState, setPopupState, recalculateState, onTutorialClose } = useUserStudyPopup();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [hasWatchedEnough, setHasWatchedEnough] = useState(false);
  const [windowOrigin, setWindowOrigin] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<any>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set window origin after mount to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowOrigin(window.location.origin);
    }
  }, []);

  // Load markdown content for tutorial
  useEffect(() => {
    if (popupState === 'tutorial') {
      setIsLoading(true);
      fetch('/instruction_assets/user_study_instructions.md')
        .then((response) => {
          if (!response.ok) throw new Error('Failed to load instructions');
          return response.text();
        })
        .then((text) => {
          setMarkdownContent(text);
          setIsLoading(false);
        });
    }
  }, [popupState]);

  // Handle scroll for tutorial
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  // Poll YouTube player for current time
  const startProgressPolling = useCallback(() => {
    if (progressIntervalRef.current) return;
    
    progressIntervalRef.current = setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player) return;
      
      const time = player.getCurrentTime();
      if (typeof time === 'number' && !isNaN(time)) {
        const seconds = Math.floor(time);
        if (seconds >= VIDEO_THRESHOLD_SECONDS) {
          setHasWatchedEnough(true);
        }
      }
    }, 500);
  }, []);

  const stopProgressPolling = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Initialize YouTube player
  const initYoutubePlayer = useCallback((iframe: HTMLIFrameElement) => {
    if (youtubePlayerRef.current) return;
    if (!(window as any).YT?.Player) return;

    youtubePlayerRef.current = new (window as any).YT.Player(iframe, {
      events: {
        onStateChange: (event: any) => {
          // 1 = playing, 0 = ended, 2 = paused
          if (event.data === 1) {
            startProgressPolling();
          } else if (event.data === 0 || event.data === 2) {
            stopProgressPolling();
          }
        }
      }
    });
  }, [startProgressPolling, stopProgressPolling]);

  // Load YouTube API when tutorial opens
  useEffect(() => {
    if (popupState !== 'tutorial') return;

    const loadYouTubeAPI = () => {
      if ((window as any).YT?.Player) return;
      
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    };

    loadYouTubeAPI();

    return () => {
      stopProgressPolling();
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy?.();
        youtubePlayerRef.current = null;
      }
    };
  }, [popupState]);

  // Check if tutorial modal can be closed - video must pass threshold or user scrolled to bottom
  const canCloseTutorial = hasScrolledToBottom || hasWatchedEnough;

  // Memoize Markdown components to prevent iframe recreation on re-render
  // Must be before any conditional returns to follow Rules of Hooks
  const markdownComponents = useMemo(() => ({
    h1: ({ children }: any) => (
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#ffffff',
          marginBottom: '16px',
          marginTop: 0,
        }}
      >
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 'semibold',
          color: '#60a5fa',
          marginBottom: '12px',
          marginTop: '24px',
        }}
      >
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3
        style={{
          fontSize: '18px',
          fontWeight: 'semibold',
          color: '#93c5fd',
          marginBottom: '8px',
          marginTop: '16px',
        }}
      >
        {children}
      </h3>
    ),
    h4: ({ children }: any) => (
      <h4
        style={{
          fontSize: '17px',
          fontWeight: 'bold',
          color: '#ffffff',
          marginBottom: '8px',
          marginTop: '16px',
        }}
      >
        {children}
      </h4>
    ),
    p: ({ children }: any) => {
      // Check if children contain block elements (div, img, video, etc.)
      // If so, wrap in div instead of p to avoid hydration errors
      const hasBlockElements = React.Children.toArray(children).some((child: any) => {
        if (typeof child === 'object' && child !== null) {
          const type = child.type;
          if (typeof type === 'string') {
            return ['div', 'img', 'video', 'iframe', 'table', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(type);
          }
        }
        return false;
      });
      
      if (hasBlockElements) {
        return (
          <div
            style={{
              marginBottom: '12px',
              color: '#e5e7eb',
            }}
          >
            {children}
          </div>
        );
      }
      
      return (
        <p
          style={{
            marginBottom: '12px',
            color: '#e5e7eb',
          }}
        >
          {children}
        </p>
      );
    },
    ul: ({ children }: any) => (
      <ul
        style={{
          listStyleType: 'disc',
          paddingLeft: '20px',
          marginBottom: '16px',
        }}
      >
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol
        style={{
          listStyleType: 'decimal',
          paddingLeft: '20px',
          marginBottom: '16px',
        }}
      >
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li
        style={{
          marginBottom: '4px',
          color: '#e5e7eb',
        }}
      >
        {children}
      </li>
    ),
    strong: ({ children }: any) => (
      <strong
        style={{
          fontWeight: 'bold',
          color: '#ffffff',
        }}
      >
        {children}
      </strong>
    ),
    a: ({ href, children }: any) => (
      <span
        style={{
          color: '#9ca3af',
          textDecoration: 'none',
          cursor: 'default',
        }}
      >
        {children}
      </span>
    ),
    img: ({ src, alt }: any) => {
      // Check if the source is a video file or instructions.mp4 (which we'll replace with YouTube)
      const isVideo = src?.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i);
      const isInstructionsVideo = src?.includes('instructions.mp4');
      
      // Resolve relative paths to absolute paths
      // Markdown references like videos/xxx.mp4 should resolve to /videos/xxx.mp4
      let resolvedSrc = src || '';
      if (resolvedSrc && !resolvedSrc.startsWith('/') && !resolvedSrc.startsWith('http') && !resolvedSrc.startsWith('data:')) {
        resolvedSrc = '/' + resolvedSrc;
      }

      // Replace instructions.mp4 with YouTube iframe
      if (isInstructionsVideo) {
        const youtubeVideoId = 'cMGgMO6DttE';
        // Use windowOrigin state to avoid hydration mismatch (Safari is stricter about this)
        // Only render iframe after windowOrigin is set to prevent hydration errors
        const origin = windowOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
        
        // Don't render iframe until we have a valid origin (prevents Safari hydration errors)
        if (!origin) {
          return (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                margin: '16px 0',
                minHeight: '200px',
                backgroundColor: '#1f2937',
                border: '1px solid #4b5563',
                borderRadius: '8px',
              }}
            >
              <p style={{ color: '#9ca3af' }}>Loading video...</p>
            </div>
          );
        }
        
        const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?enablejsapi=1&origin=${origin}&modestbranding=1&rel=0&iv_load_policy=3&fs=1&playsinline=1`;
        
        return (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              margin: '16px 0',
            }}
          >
            <iframe
              ref={(el) => {
                if (el && !youtubePlayerRef.current) {
                  // Wait for YT API, then init
                  const tryInit = () => {
                    if ((window as any).YT?.Player) {
                      initYoutubePlayer(el);
                    } else {
                      setTimeout(tryInit, 100);
                    }
                  };
                  tryInit();
                }
              }}
              src={youtubeEmbedUrl}
              style={{
                width: '90%',
                maxWidth: '900px',
                aspectRatio: '16 / 9',
                maxHeight: '600px',
                height: 'auto',
                border: '1px solid #4b5563',
                display: 'block',
                margin: '0 auto',
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }

      if (isVideo) {
        return (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
              margin: '16px 0',
            }}
          >
            <video
              src={resolvedSrc}
              controls
              playsInline
              onTimeUpdate={(e) => {
                const seconds = Math.floor(e.currentTarget.currentTime);
                if (seconds >= VIDEO_THRESHOLD_SECONDS) {
                  setHasWatchedEnough(true);
                }
              }}
              style={{
                width: '90%',
                maxWidth: '900px',
                aspectRatio: '16 / 9',
                maxHeight: '600px',
                height: 'auto',
                border: '1px solid #4b5563',
                backgroundColor: '#000',
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto',
              }}
            />
          </div>
        );
      }

      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
            margin: '16px 0',
          }}
        >
          <img
            src={resolvedSrc}
            alt={alt}
            style={{
              maxWidth: '90%',
              maxHeight: '600px',
              height: 'auto',
              width: 'auto',
              border: '1px solid #4b5563',
              display: 'block',
              margin: '0 auto',
            }}
          />
        </div>
      );
    },
  }), [initYoutubePlayer, windowOrigin]);

  // Helper function to set tutorial cookie
  const setTutorialCookie = (state: TutorialCookieState) => {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1); // 1 year from now
    setCookie(TUTORIAL_COOKIE_NAME, state, {
      expires,
      maxAge: 365 * 24 * 60 * 60, // 1 year in seconds
      sameSite: 'lax'
    });
  };

  // Disable all keyboard inputs when modal is open
  useEffect(() => {
    // Check if modal should be shown (inline logic from shouldShowPopup)
    let shouldShow = false;
    if (popupState !== 'none') {
      if (popupState === 'tutorial') {
        const tutorialState = (getCookie(TUTORIAL_COOKIE_NAME) as TutorialCookieState | null) || 'unseen';
        if (tutorialState !== 'dismissed') {
          shouldShow = true;
        }
      } else if (popupState === 'pre-test' || popupState === 'post-test') {
        if (pathname !== '/skill-check' && pathname !== '/landing') {
          shouldShow = true;
        }
      }
    }
    
    if (!shouldShow) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Allow keyboard events within the modal itself (e.g., video controls, scrolling, buttons)
      const target = event.target as HTMLElement;
      const isWithinModal = target.closest('[data-modal-content]');
      
      // Prevent all keyboard events that are outside the modal
      if (!isWithinModal) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    // Use capture phase to catch events early, before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyDown, true);
    window.addEventListener('keypress', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyDown, true);
      window.removeEventListener('keypress', handleKeyDown, true);
    };
  }, [popupState, pathname]);

  // Handle navigation to skill-check
  const handleNavigateToSkillCheck = () => {
    router.push('/skill-check');
  };

  // Track tutorial cookie state to avoid calling getCookie during render
  const [tutorialCookieState, setTutorialCookieState] = useState<TutorialCookieState | null>(null);
  
  // Load tutorial cookie state after mount to avoid hydration mismatch
  useEffect(() => {
    if (popupState === 'tutorial') {
      const state = (getCookie(TUTORIAL_COOKIE_NAME) as TutorialCookieState | null) || 'unseen';
      setTutorialCookieState(state);
    }
  }, [popupState]);

  // Don't show popup on landing page (where login happens) or skill-check page
  const shouldShowPopup = () => {
    if (popupState === 'none') return false;
    // Never show popup on landing page - it blocks login
    if (pathname === '/landing') {
      return false;
    }
    if (popupState === 'tutorial') {
      // Use state instead of calling getCookie during render to avoid hydration mismatch
      // Default to 'unseen' during SSR/initial render
      const tutorialState = tutorialCookieState || 'unseen';
      if (tutorialState === 'dismissed') {
        return false;
      }
      return true;
    }
    // For pre-test and post-test, don't show on skill-check page
    if ((popupState === 'pre-test' || popupState === 'post-test') && 
        pathname === '/skill-check') {
      return false;
    }
    return true;
  };

  if (!shouldShowPopup()) {
    return null;
  }

  const handleClose = async () => {
    // Only allow closing if it's tutorial and conditions are met, or if explicitly allowed
    if (popupState === 'tutorial' && !canCloseTutorial) {
      return;
    }
    // When tutorial closes, directly transition to pre-test (no API calls needed)
    if (popupState === 'tutorial' && onTutorialClose) {
      onTutorialClose();
    } else {
      setPopupState('none');
    }
  };


  // Pre-test and post-test modal (not closeable)
  if (popupState === 'pre-test' || popupState === 'post-test') {
    const headerText = popupState === 'pre-test' 
      ? 'Next Step: Complete Pre-Test Assessment' 
      : 'Next Step: Complete Post-Test Assessment';
    const bodyText = popupState === 'pre-test'
      ? "Thanks for reading the instructions! For your first task, you need to complete a pre-test where we measure your coding abilities."
      : "Thanks for building all required websites in VibeJam! For your final task, you need to complete a post-test where we measure your coding abilities.";

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
      >
        <div
          data-modal-content
          style={{
            backgroundColor: '#1f2937',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '24px 24px 16px 24px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <h2
              style={{
                color: '#e2e8f0',
                fontSize: '22px',
                fontWeight: 600,
                letterSpacing: '0.01em',
                margin: 0,
              }}
            >
              {headerText}
            </h2>
          </div>

          {/* Content */}
          <div
            style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <p
              style={{
                color: '#e5e7eb',
                fontSize: '16px',
                lineHeight: '1.6',
                margin: 0,
              }}
            >
              {bodyText}
            </p>

            <button
              onClick={handleNavigateToSkillCheck}
              style={{
                padding: '12px 24px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                width: '100%',
                marginBottom: '8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1d4ed8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }}
            >
              Take me there!
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tutorial modal (closeable only if video started or scrolled to bottom)
  if (popupState === 'tutorial') {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
        onClick={(e) => {
          if (canCloseTutorial && e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          data-modal-content
          style={{
            backgroundColor: '#1f2937',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '24px 24px 16px 24px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
            }}
          >
            <h2
              style={{
                color: '#e2e8f0',
                fontSize: '22px',
                fontWeight: 600,
                letterSpacing: '0.01em',
                margin: 0,
              }}
            >
              Instructions
            </h2>
          </div>

          {/* Scrollable Content */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              minHeight: 0,
              paddingBottom: '16px',
            }}
          >
            {isLoading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '40px',
                  color: '#9ca3af',
                }}
              >
                Loading instructions...
              </div>
            ) : (
              <div
                ref={contentRef}
                style={{
                  backgroundColor: '#111827',
                  padding: '24px',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  lineHeight: '1.6',
                }}
              >
                <Markdown
                  rehypePlugins={[rehypeRaw]}
                  components={markdownComponents}
                >
                  {markdownContent}
                </Markdown>
              </div>
            )}
          </div>

          {/* Footer with buttons */}
          <div
            style={{
              padding: '16px 24px 24px 24px',
              borderTop: '1px solid rgba(148, 163, 184, 0.2)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
            }}
          >
            <button
              type="button"
              onClick={async () => {
                const currentState = tutorialCookieState || 'unseen';
                if (currentState !== 'dismissed') {
                  setTutorialCookie('seen');
                  setTutorialCookieState('seen');
                }
                await handleClose();
              }}
              disabled={!canCloseTutorial}
              style={{
                padding: '10px 24px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: canCloseTutorial ? 'pointer' : 'not-allowed',
                opacity: canCloseTutorial ? 1 : 0.6,
                transition: 'background-color 0.2s ease, opacity 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (canCloseTutorial) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (canCloseTutorial) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function UserStudyPopup() {
  // The context provider is now in UserStudyPopupProvider, so we just render the inner component
  return <UserStudyPopupInner />;
}
