"use client";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import Markdown from "react-markdown";
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
}

export const UserStudyPopupContext = createContext<UserStudyPopupContextType | undefined>(undefined);

export function useUserStudyPopup() {
  const context = useContext(UserStudyPopupContext);
  if (!context) {
    throw new Error('useUserStudyPopup must be used within UserStudyPopupProvider');
  }
  return context;
}

function UserStudyPopupInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { popupState, setPopupState } = useUserStudyPopup();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [hasStartedVideo, setHasStartedVideo] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load markdown content for tutorial
  useEffect(() => {
    if (popupState === 'tutorial') {
      setIsLoading(true);
      fetch('/instruction_assets/user_study_instructions.md')
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to load instructions');
          }
          return response.text();
        })
        .then((text) => {
          // Preprocess markdown: convert <br /> tags to newlines
          const processedText = text.replace(/<br\s*\/?>/gi, '\n\n');
          setMarkdownContent(processedText);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Error loading instructions:', err);
          setIsLoading(false);
        });
    }
  }, [popupState]);

  // Handle scroll for tutorial
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
    // Once scrolled to bottom, keep it enabled (don't set back to false)
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  // Handle video play for tutorial
  const handleVideoPlay = () => {
    setHasStartedVideo(true);
  };

  // Check if tutorial modal can be closed
  const canCloseTutorial = hasScrolledToBottom || hasStartedVideo;

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

  // Mark tutorial as seen when user scrolls to bottom or starts video
  useEffect(() => {
    if (popupState === 'tutorial' && canCloseTutorial) {
      const currentState = (getCookie(TUTORIAL_COOKIE_NAME) as TutorialCookieState | null) || 'unseen';
      if (currentState !== 'dismissed') {
        setTutorialCookie('seen');
      }
    }
  }, [popupState, canCloseTutorial]);

  // Handle navigation to skill-check
  const handleNavigateToSkillCheck = () => {
    router.push('/skill-check');
  };

  // Don't show pre-test/post-test on skill-check or landing page
  const shouldShowPopup = () => {
    if (popupState === 'none') return false;
    if (popupState === 'tutorial') {
      // Check cookie to prevent showing if dismissed
      const tutorialState = (getCookie(TUTORIAL_COOKIE_NAME) as TutorialCookieState | null) || 'unseen';
      if (tutorialState === 'dismissed') {
        return false;
      }
      return true;
    }
    // For pre-test and post-test, don't show on skill-check or landing page
    if ((popupState === 'pre-test' || popupState === 'post-test') && 
        (pathname === '/skill-check' || pathname === '/landing')) {
      return false;
    }
    return true;
  };

  if (!shouldShowPopup()) {
    return null;
  }

  const handleClose = () => {
    // Only allow closing if it's tutorial and conditions are met, or if explicitly allowed
    if (popupState === 'tutorial' && !canCloseTutorial) {
      return;
    }
    // Mark tutorial as seen when user closes it (unless already dismissed)
    if (popupState === 'tutorial') {
      const currentState = (getCookie(TUTORIAL_COOKIE_NAME) as TutorialCookieState | null) || 'unseen';
      if (currentState !== 'dismissed') {
        setTutorialCookie('seen');
      }
    }
    setPopupState('none');
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
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3b82f6';
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
            {canCloseTutorial && (
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close instructions modal"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9ca3af',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  lineHeight: 1,
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9ca3af';
                }}
              >
                ✕
              </button>
            )}
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
                  components={{
                    h1: ({ children }) => (
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
                    h2: ({ children }) => (
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
                    h3: ({ children }) => (
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
                    p: ({ children }) => (
                      <p
                        style={{
                          marginBottom: '12px',
                          color: '#e5e7eb',
                        }}
                      >
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
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
                    ol: ({ children }) => (
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
                    li: ({ children }) => (
                      <li
                        style={{
                          marginBottom: '4px',
                          color: '#e5e7eb',
                        }}
                      >
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong
                        style={{
                          fontWeight: 'bold',
                          color: '#ffffff',
                        }}
                      >
                        {children}
                      </strong>
                    ),
                    a: ({ href, children }) => (
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
                    img: ({ src, alt }) => {
                      // Check if the source is a video file
                      const isVideo = src?.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i);
                      
                      // Resolve relative paths to absolute paths
                      // Markdown references like videos/xxx.mp4 should resolve to /videos/xxx.mp4
                      let resolvedSrc = src || '';
                      if (resolvedSrc && !resolvedSrc.startsWith('/') && !resolvedSrc.startsWith('http') && !resolvedSrc.startsWith('data:')) {
                        resolvedSrc = '/' + resolvedSrc;
                      }

                      if (isVideo) {
                        return (
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              margin: '16px 0',
                            }}
                          >
                            <video
                              src={resolvedSrc}
                              controls
                              onPlay={handleVideoPlay}
                              style={{
                                maxWidth: '90%',
                                maxHeight: '600px',
                                height: 'auto',
                                width: 'auto',
                                border: '1px solid #4b5563',
                              }}
                            >
                              Your browser does not support the video tag.
                            </video>
                          </div>
                        );
                      }

                      return (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
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
                            }}
                          />
                        </div>
                      );
                    },
                  }}
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
              onClick={handleClose}
              disabled={!canCloseTutorial}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                cursor: canCloseTutorial ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.2s ease',
                opacity: canCloseTutorial ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                if (canCloseTutorial) {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }
              }}
              onMouseLeave={(e) => {
                if (canCloseTutorial) {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
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
