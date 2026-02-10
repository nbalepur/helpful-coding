'use client';

import React, { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import LoadingSpinner from './LoadingSpinner';
import { ENV } from '../../config/env';

const INSTRUCTIONS_PATH = '/instruction_assets/user_instructions.md';

function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractHeadings(markdown: string): Array<{ id: string; text: string; level: number }> {
  const headings: Array<{ id: string; text: string; level: number }> = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const h3Match = line.match(/^### (.*)$/);
    const h4Match = line.match(/^#### (.*)$/);
    if (h3Match) {
      const text = h3Match[1].trim();
      headings.push({ id: generateHeadingId(text), text, level: 2 });
    } else if (h4Match) {
      const text = h4Match[1].trim();
      headings.push({ id: generateHeadingId(text), text, level: 3 });
    }
  }
  return headings;
}

export interface UserInstructionsContentProps {
  /** Light mode for About page; dark for modal */
  isLightMode?: boolean;
  /** Show table of contents sidebar (default true) */
  showToc?: boolean;
  /** When set, instructions.mp4 is rendered as YouTube embed; otherwise native <video> */
  youtubeInstructionsVideoId?: string;
  /** Fixed height for scrollable area (e.g. '600px' for About). Omit for flex-1 (modal). */
  contentHeight?: string;
  /** Optional class for the outer wrapper */
  className?: string;
}

export default function UserInstructionsContent({
  isLightMode = false,
  showToc = true,
  youtubeInstructionsVideoId,
  contentHeight,
  className = '',
}: UserInstructionsContentProps) {
  const [markdownContent, setMarkdownContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableOfContents, setTableOfContents] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [activeSection, setActiveSection] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const markdownRef = useRef<HTMLDivElement>(null);
  const headingRefs = useRef<Map<string, HTMLHeadingElement>>(new Map());

  useEffect(() => {
    fetch(INSTRUCTIONS_PATH)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load instructions');
        return res.text();
      })
      .then((text) => {
        const withContactEmail = text.replace(/nbalepur@umd\.edu/g, ENV.FROM_CONTACT_EMAIL);
        const processed = withContactEmail.replace(
          /<br\s*\/?>/gi,
          '\n\n<div style="height: 1.5em; margin: 0;" data-br-spacer="true" aria-hidden="true"></div>\n\n'
        );
        setMarkdownContent(processed);
        const headings = extractHeadings(text);
        setTableOfContents(headings);
        setActiveSection(headings.length > 0 ? headings[0].id : '');
      })
      .catch((err) => {
        console.error('Error loading instructions:', err);
        setError('Failed to load instructions.');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const scrollToSection = (id: string) => {
    const heading = headingRefs.current.get(id);
    if (heading && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headingTop = heading.offsetTop - container.offsetTop;
      container.scrollTo({ top: headingTop - 20, behavior: 'smooth' });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const scrollPosition = container.scrollTop + 100;
    for (let i = tableOfContents.length - 1; i >= 0; i--) {
      const heading = headingRefs.current.get(tableOfContents[i].id);
      if (heading) {
        const headingTop = heading.offsetTop - container.offsetTop;
        if (headingTop <= scrollPosition) {
          setActiveSection(tableOfContents[i].id);
          break;
        }
      }
    }
  };

  const textColor = isLightMode ? '#1f2937' : '#d1d5db';
  const linkColor = isLightMode ? '#1e40af' : '#60a5fa';
  const scrollbarThumb = isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)';
  const scrollbarThumbHover = isLightMode ? 'rgba(107, 114, 128, 0.6)' : 'rgba(107, 114, 128, 0.7)';

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <LoadingSpinner size="md" color="blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-400 ${className}`}>
        {error}
      </div>
    );
  }

  const tocBorder = isLightMode ? 'rgba(209, 213, 219, 0.5)' : 'rgba(148, 163, 184, 0.2)';
  const tocBg = isLightMode ? '#e5e7eb' : '#000000';
  const contentBg = isLightMode ? '#ffffff' : '#111827';

  return (
    <div
      className={className}
      style={
        contentHeight
          ? { height: contentHeight, overflow: 'hidden' }
          : { height: '100%', minHeight: 0, overflow: 'hidden' }
      }
    >
      <style>{`
        .user-instructions-scrollable::-webkit-scrollbar { width: 4px; }
        .user-instructions-scrollable::-webkit-scrollbar-track { background: transparent; }
        .user-instructions-scrollable::-webkit-scrollbar-thumb { background: ${scrollbarThumb}; border-radius: 2px; }
        .user-instructions-scrollable::-webkit-scrollbar-thumb:hover { background: ${scrollbarThumbHover}; }
        .user-instructions-scrollable { scrollbar-width: thin; scrollbar-color: ${scrollbarThumb} transparent; }
        .user-instructions-toc::-webkit-scrollbar { width: 4px; }
        .user-instructions-toc::-webkit-scrollbar-track { background: transparent; }
        .user-instructions-toc::-webkit-scrollbar-thumb { background: ${scrollbarThumb}; border-radius: 2px; }
        .user-instructions-toc::-webkit-scrollbar-thumb:hover { background: ${scrollbarThumbHover}; }
        .user-instructions-toc { scrollbar-width: thin; scrollbar-color: ${scrollbarThumb} transparent; }
      `}</style>
      <div
        style={{
          display: 'flex',
          height: contentHeight ? '100%' : '100%',
          overflow: 'hidden',
          minHeight: 0,
          backgroundColor: !isLightMode && showToc ? '#000000' : undefined,
        }}
      >
        {showToc && tableOfContents.length > 0 && (
          <div
            className="user-instructions-toc"
            style={{
              width: '240px',
              minWidth: '240px',
              borderRight: `1px solid ${tocBorder}`,
              backgroundColor: tocBg,
              overflowY: 'auto',
              padding: '16px',
              height: '100%',
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isLightMode ? '#374151' : '#9ca3af',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${tocBorder}`,
                flexShrink: 0,
              }}
            >
              Table of Contents
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: 0 }}>
              {tableOfContents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    fontSize: item.level === 2 ? '13px' : '12px',
                    fontWeight: item.level === 2 ? 500 : 400,
                    color: activeSection === item.id
                      ? (isLightMode ? '#2563eb' : '#60a5fa')
                      : (isLightMode ? '#6b7280' : '#9ca3af'),
                    backgroundColor: activeSection === item.id
                      ? (isLightMode ? 'rgba(37, 99, 235, 0.1)' : 'rgba(96, 165, 250, 0.1)')
                      : 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: 'none',
                    marginLeft: item.level === 3 ? '12px' : 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  onMouseEnter={(e) => {
                    if (activeSection !== item.id) {
                      e.currentTarget.style.backgroundColor = isLightMode
                        ? 'rgba(107, 114, 128, 0.1)'
                        : 'rgba(148, 163, 184, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeSection !== item.id) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  title={item.text}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="user-instructions-scrollable flex-1 min-h-0 leading-relaxed overflow-y-auto"
          style={{
            backgroundColor: contentBg,
            color: textColor,
            padding: '24px',
          }}
        >
          <div ref={markdownRef}>
            <Markdown
              rehypePlugins={[rehypeRaw]}
              components={{
                h1: ({ children }) => (
                  <h1
                    className="text-2xl font-bold mb-4 mt-0"
                    style={{ color: isLightMode ? '#111827' : '#ffffff' }}
                  >
                    {children}
                  </h1>
                ),
                h2: ({ children }) => {
                  const text = typeof children === 'string' ? children : React.Children.toArray(children).join('');
                  const id = generateHeadingId(text);
                  return (
                    <h2
                      id={id}
                      ref={(el) => { if (el) headingRefs.current.set(id, el); }}
                      className="text-xl font-semibold mb-3 mt-6"
                      style={{
                        color: isLightMode ? '#2563eb' : '#60a5fa',
                        scrollMarginTop: '20px',
                      }}
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children }) => {
                  const text = typeof children === 'string' ? children : React.Children.toArray(children).join('');
                  const id = generateHeadingId(text);
                  return (
                    <h3
                      id={id}
                      ref={(el) => { if (el) headingRefs.current.set(id, el); }}
                      className="text-lg font-semibold mb-2 mt-4"
                      style={{
                        color: isLightMode ? '#3b82f6' : '#93c5fd',
                        scrollMarginTop: '20px',
                      }}
                    >
                      {children}
                    </h3>
                  );
                },
                h4: ({ children }) => {
                  const text = typeof children === 'string' ? children : React.Children.toArray(children).join('');
                  const id = generateHeadingId(text);
                  return (
                    <h4
                      id={id}
                      ref={(el) => { if (el) headingRefs.current.set(id, el); }}
                      className="text-base font-semibold mb-2 mt-4"
                      style={{
                        color: isLightMode ? '#111827' : '#ffffff',
                        scrollMarginTop: '20px',
                      }}
                    >
                      {children}
                    </h4>
                  );
                },
                p: ({ children, ...props }: any) => {
                  if (props.style) {
                    return (
                      <p {...props} className={props.className || 'mb-3'}>
                        {children}
                      </p>
                    );
                  }
                  return (
                    <p className="mb-3" style={{ color: textColor }}>
                      {children}
                    </p>
                  );
                },
                ul: ({ children }) => <ul className="list-disc list-inside mb-4 ml-4">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-4 ml-4">{children}</ol>,
                li: ({ children }) => (
                  <li className="mb-1" style={{ color: textColor }}>
                    {children}
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold" style={{ color: isLightMode ? '#111827' : '#ffffff' }}>
                    {children}
                  </strong>
                ),
                a: ({ href, children }) => (
                  <a
                    href={href}
                    className="underline hover:opacity-90"
                    style={{ color: linkColor }}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                  >
                    {children}
                  </a>
                ),
                div: ({ children, ...props }: any) => {
                  if ((props as any)['data-br-spacer'] === 'true') {
                    return <div style={{ height: '1.5em', margin: 0 }} aria-hidden="true" />;
                  }
                  return <div {...props}>{children}</div>;
                },
                img: ({ src, alt }) => {
                  if (!src) return null;
                  const isInstructionsVideo = src?.includes('instructions.mp4');
                  const isVideo = src?.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i);

                  if (isInstructionsVideo && youtubeInstructionsVideoId) {
                    const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeInstructionsVideoId}?modestbranding=1&rel=0&iv_load_policy=3&fs=1&playsinline=1&enablejsapi=0`;
                    return (
                      <div className="flex justify-center my-4 w-full">
                        <div
                          className="relative"
                          style={{
                            width: '90%',
                            maxWidth: '800px',
                            paddingBottom: '56.25%',
                            backgroundColor: isLightMode ? '#f3f4f6' : '#1f2937',
                            border: isLightMode ? '1px solid #d1d5db' : '1px solid #4b5563',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <iframe
                            src={youtubeEmbedUrl}
                            className="absolute top-0 left-0 w-full h-full"
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    );
                  }

                  if (isInstructionsVideo) {
                    const videoSrc = src.startsWith('/') ? src : `/${src}`;
                    return (
                      <div className="my-4 rounded overflow-hidden bg-black/40 aspect-video">
                        <video
                          src={videoSrc}
                          controls
                          className="w-full h-full object-contain"
                          playsInline
                        >
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    );
                  }

                  if (isVideo) {
                    return (
                      <div className="flex justify-center my-4 w-full">
                        <div
                          className="relative"
                          style={{
                            width: '90%',
                            maxWidth: '800px',
                            paddingBottom: '56.25%',
                            backgroundColor: isLightMode ? '#f3f4f6' : '#1f2937',
                            border: isLightMode ? '1px solid #d1d5db' : '1px solid #4b5563',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            position: 'relative',
                          }}
                        >
                          <video
                            src={src}
                            controls
                            preload="metadata"
                            className="absolute top-0 left-0 w-full h-full object-contain"
                            style={{ width: '100%', height: '100%', display: 'block', margin: '0 auto' }}
                          >
                            Your browser does not support the video tag.
                          </video>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="flex justify-center my-4 w-full">
                      <img
                        src={src}
                        alt={alt || ''}
                        className="border border-gray-400"
                        style={{
                          maxWidth: '90%',
                          maxHeight: '600px',
                          height: 'auto',
                          width: 'auto',
                          display: 'block',
                          margin: '0 auto',
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
        </div>
      </div>
    </div>
  );
}
