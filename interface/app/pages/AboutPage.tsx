'use client';

import React, { useState, useEffect, useRef } from 'react';
import IRBIframe from "../components/IRBIframe";
import { irbConsentContent } from '../data/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Sun, Moon } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { useIframeTheme } from '../utils/IframeThemeContext';
import { useAuth } from '../utils/auth';
import { getStudyTaskMode } from '../config/tasks';
import { isWebsiteRequirementsSkippedFromSettings } from '../utils/userSettings';
import { PRE_TEST_SKIPPED_KEY } from '../components/UserStudyPopupProvider';

// Generate ID from heading text
const generateHeadingId = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .trim();
};

const extractYouTubeVideoId = (url?: string): string | null => {
  if (!url) return null;
  const trimmed = url.trim();

  const shortMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (shortMatch?.[1]) return shortMatch[1];

  const embedMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i);
  if (embedMatch?.[1]) return embedMatch[1];

  const watchMatch = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watchMatch?.[1]) return watchMatch[1];

  return null;
};

export default function AboutPage() {
  const { user } = useAuth();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [tableOfContents, setTableOfContents] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [activeSection, setActiveSection] = useState<string>('');
  const markdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headingRefs = useRef<Map<string, HTMLHeadingElement>>(new Map());
  const { isLightMode, toggleLightMode } = useIframeTheme();

  // Extract headings from markdown
  const extractHeadings = (markdown: string): Array<{ id: string; text: string; level: number }> => {
    const headings: Array<{ id: string; text: string; level: number }> = [];
    const lines = markdown.split('\n');
    
    for (const line of lines) {
      // Match ### (h3 in markdown, but we'll treat as level 2 for TOC hierarchy)
      const h3Match = line.match(/^### (.*)$/);
      // Match #### (h4 in markdown, but we'll treat as level 3 for TOC hierarchy)
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
  };

  // Scroll to section when TOC item is clicked
  const scrollToSection = (id: string) => {
    const heading = headingRefs.current.get(id);
    if (heading && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headingTop = heading.offsetTop - container.offsetTop;
      container.scrollTo({
        top: headingTop - 20, // Small offset from top
        behavior: 'smooth'
      });
    }
  };

  // Handle scroll to update active section
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollPosition = container.scrollTop + 100; // Offset for sticky header
      
      // Find the section that's currently in view
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
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const loadInstructions = async () => {
      setIsLoading(true);
      setError(null);
      setShowContent(false);

      const websiteInstructionsPath = '/instruction_assets/user_study_instructions.md';
      const gameInstructionsPath = '/instruction_assets/user_study_phase_two_instructions.md';

      let instructionsPath = websiteInstructionsPath;

      try {
        const fromSettingsOrLocal = isWebsiteRequirementsSkippedFromSettings(user?.settings);
        const fromSessionSkip =
          typeof window !== 'undefined' && sessionStorage.getItem(PRE_TEST_SKIPPED_KEY) === 'true';
        const websiteRequirementsSkipped = fromSettingsOrLocal || fromSessionSkip;
        let mode = getStudyTaskMode([], websiteRequirementsSkipped);

        const tasksResponse = await fetch('/api/tasks');
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          const tasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
          const nonPlaygroundTasks = tasks.filter((task: any) => task.id !== 'playground');
          mode = getStudyTaskMode(nonPlaygroundTasks, websiteRequirementsSkipped);
        }

        instructionsPath = mode === 'game' ? gameInstructionsPath : websiteInstructionsPath;
      } catch (modeError) {
        console.error('Error determining study mode for about instructions:', modeError);
      }

      try {
        const response = await fetch(instructionsPath);
        if (!response.ok) {
          throw new Error('Failed to load instructions');
        }
        const text = await response.text();
        if (isCancelled) return;

        // Preprocess markdown: convert <br /> tags to spacing divs
        // These will be rendered as HTML using rehype-raw plugin
        const processedText = text.replace(/<br\s*\/?>/gi, '\n\n<div style="height: 1.5em; margin: 0;" data-br-spacer="true" aria-hidden="true"></div>\n\n');
        setMarkdownContent(processedText);
        const headings = extractHeadings(text);
        setTableOfContents(headings);
        setActiveSection(headings.length > 0 ? headings[0].id : '');
        setIsLoading(false);
        // Show content immediately - videos have fixed-size containers to prevent layout shifts
        setShowContent(true);
      } catch (err) {
        if (isCancelled) return;
        console.error('Error loading instructions:', err);
        setError('Failed to load instructions. Please try refreshing the page.');
        setIsLoading(false);
        setShowContent(true);
      }
    };

    loadInstructions();

    return () => {
      isCancelled = true;
    };
  }, [user?.settings]);
  
  // Track when videos have loaded their metadata and show content
  useEffect(() => {
    if (!showContent || !markdownRef.current) return;
    
    const videos = markdownRef.current.querySelectorAll('video');
    if (videos.length === 0) return;
    
    let loadedCount = 0;
    const totalVideos = videos.length;
    const loadHandlers: Array<() => void> = [];
    
    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount === totalVideos) {
        // All videos have loaded metadata - content is already shown
        loadHandlers.forEach(cleanup => cleanup());
      }
    };
    
    videos.forEach((video) => {
      if (video.readyState >= 1) {
        // Already has metadata
        loadedCount++;
        if (loadedCount === totalVideos) {
          loadHandlers.forEach(cleanup => cleanup());
        }
      } else {
        const handler = () => checkAllLoaded();
        video.addEventListener('loadedmetadata', handler);
        loadHandlers.push(() => video.removeEventListener('loadedmetadata', handler));
      }
    });
    
    return () => {
      loadHandlers.forEach(cleanup => cleanup());
    };
  }, [showContent]);


  // Convert markdown to PDF
  const handleDownloadPDF = async () => {
    if (isDownloading) return;
    
    setIsDownloading(true);
    try {
      // Create a temporary container with proper styling for PDF
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '800px';
      tempContainer.style.padding = '40px';
      tempContainer.style.backgroundColor = '#ffffff';
      tempContainer.style.color = '#000000';
      tempContainer.style.fontFamily = 'Arial, sans-serif';
      tempContainer.style.fontSize = '12px';
      tempContainer.style.lineHeight = '1.6';
      
      // Convert markdown to HTML with PDF-friendly styling
      const pdfHtml = irbConsentContent
        .replace(/^# (.*$)/gim, '<h1 style="font-size: 24px; font-weight: bold; margin: 20px 0 15px 0; color: #000;">$1</h1>')
        .replace(/^## (.*$)/gim, '<h2 style="font-size: 20px; font-weight: bold; margin: 18px 0 12px 0; color: #1e40af;">$1</h2>')
        .replace(/^### (.*$)/gim, '<h3 style="font-size: 16px; font-weight: bold; margin: 15px 0 10px 0; color: #3b82f6;">$1</h3>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong style="font-weight: bold; color: #000;">$1</strong>')
        .replace(/^- (.*$)/gim, '<li style="margin: 5px 0; padding-left: 20px; list-style-type: disc;">$1</li>')
        .replace(/(<li.*<\/li>)/gim, '<ul style="margin: 10px 0; padding-left: 30px;">$1</ul>')
        .replace(/^(?!<[h|u|l])(.*$)/gim, '<p style="margin: 10px 0; color: #333;">$1</p>')
        .replace(/\n\n/gim, '');
      
      tempContainer.innerHTML = pdfHtml;
      document.body.appendChild(tempContainer);
      
      // Wait a bit for rendering
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Convert to canvas and then to PDF
      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      
      document.body.removeChild(tempContainer);
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate dimensions - fit to page width with margins
      const margin = 10;
      const imgWidth = pdfWidth - (2 * margin);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // Calculate how many pages we need
      const pageCount = Math.ceil(imgHeight / (pdfHeight - (2 * margin)));
      
      // Add image to PDF, splitting across pages if needed
      for (let i = 0; i < pageCount; i++) {
        if (i > 0) {
          pdf.addPage();
        }
        
        // Calculate the portion of the image to show on this page
        const sourceY = (canvas.height / pageCount) * i;
        const sourceHeight = Math.min(canvas.height / pageCount, canvas.height - sourceY);
        
        // Create a temporary canvas for this page slice
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const pageCtx = pageCanvas.getContext('2d');
        
        if (pageCtx) {
          pageCtx.drawImage(
            canvas,
            0, sourceY, canvas.width, sourceHeight,
            0, 0, canvas.width, sourceHeight
          );
          
          const pageImgData = pageCanvas.toDataURL('image/png');
          const pageImgHeight = (sourceHeight * imgWidth) / canvas.width;
          
          pdf.addImage(pageImgData, 'PNG', margin, margin, imgWidth, pageImgHeight);
        }
      }
      
      pdf.save('IRB_Consent_Form.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle smooth scrolling for anchor links
  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex-1 flex flex-col items-start justify-start pt-8 pb-8 max-w-7xl mx-auto w-full px-4">
      <h1 className="text-4xl font-semibold text-white mb-4">About</h1>
      <p className="text-gray-300 mb-8 leading-relaxed">
        This page has all information about the study. You can navigate to{' '}
        <a 
          href="#instructions" 
          onClick={(e) => handleSmoothScroll(e, 'instructions')}
          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
        >
          Instructions
        </a>
        ,{' '}
        <a 
          href="#contact" 
          onClick={(e) => handleSmoothScroll(e, 'contact')}
          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
        >
          Contact
        </a>
        , or the{' '}
        <a 
          href="#irb-consent" 
          onClick={(e) => handleSmoothScroll(e, 'irb-consent')}
          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
        >
          Research Consent Form (IRB)
        </a>
        .
      </p>
      <div className="flex flex-col gap-8 w-full">
        {/* User Study Instructions */}
        <div id="instructions" className="bg-gray-800 border border-gray-700 p-8 scroll-mt-8 relative">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-white">Instructions</h2>
            <button
              onClick={toggleLightMode}
              className="rounded transition-all"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '4px',
                border: '1px solid rgba(107, 114, 128, 0.3)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                background: isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.9)',
                color: isLightMode ? '#1f2937' : '#d1d5db',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
            >
              {isLightMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" color="blue" />
            </div>
          ) : error ? (
            <div className="text-red-400">{error}</div>
          ) : !showContent ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" color="blue" />
            </div>
          ) : (
            <div className="w-full" style={{ height: '600px' }}>
              <style>{`
                .instructions-scrollable::-webkit-scrollbar { width: 4px; }
                .instructions-scrollable::-webkit-scrollbar-track { background: transparent; }
                .instructions-scrollable::-webkit-scrollbar-thumb { background: ${isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)'}; border-radius: 2px; }
                .instructions-scrollable::-webkit-scrollbar-thumb:hover { background: ${isLightMode ? 'rgba(107, 114, 128, 0.6)' : 'rgba(107, 114, 128, 0.7)'}; }
                .instructions-scrollable { scrollbar-width: thin; scrollbar-color: ${isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)'} transparent; }
                .toc-scrollable::-webkit-scrollbar { width: 4px; }
                .toc-scrollable::-webkit-scrollbar-track { background: transparent; }
                .toc-scrollable::-webkit-scrollbar-thumb { background: ${isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)'}; border-radius: 2px; }
                .toc-scrollable::-webkit-scrollbar-thumb:hover { background: ${isLightMode ? 'rgba(107, 114, 128, 0.6)' : 'rgba(107, 114, 128, 0.7)'}; }
                .toc-scrollable { scrollbar-width: thin; scrollbar-color: ${isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)'} transparent; }
              `}</style>
              <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                {/* Table of Contents Sidebar */}
                {tableOfContents.length > 0 && (
                  <div
                    className="toc-scrollable"
                    style={{
                      width: '240px',
                      minWidth: '240px',
                      borderRight: `1px solid ${isLightMode ? 'rgba(209, 213, 219, 0.5)' : 'rgba(148, 163, 184, 0.2)'}`,
                      backgroundColor: isLightMode ? '#e5e7eb' : '#030712',
                      overflowY: 'auto',
                      padding: '16px',
                      height: '100%',
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
                        borderBottom: `1px solid ${isLightMode ? 'rgba(209, 213, 219, 0.5)' : 'rgba(148, 163, 184, 0.2)'}`,
                        flexShrink: 0,
                      }}
                    >
                      Table of Contents
                    </div>
                    <nav
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        flex: 1,
                        minHeight: 0,
                      }}
                    >
                      {tableOfContents.map((item) => (
                        <button
                          key={item.id}
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
                            marginLeft: item.level === 3 ? '12px' : '0',
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

                {/* Scrollable Content */}
                <div 
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="leading-relaxed h-full overflow-y-auto instructions-scrollable flex-1" 
                  style={{ 
                    backgroundColor: isLightMode ? '#ffffff' : '#111827', 
                    color: isLightMode ? '#1f2937' : '#d1d5db',
                    padding: '24px'
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
                        ref={(el) => {
                          if (el) {
                            headingRefs.current.set(id, el);
                          }
                        }}
                        className="text-xl font-semibold mb-3 mt-6"
                        style={{ 
                          color: isLightMode ? '#2563eb' : '#60a5fa',
                          scrollMarginTop: '20px'
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
                        ref={(el) => {
                          if (el) {
                            headingRefs.current.set(id, el);
                          }
                        }}
                        className="text-lg font-semibold mb-2 mt-4"
                        style={{ 
                          color: isLightMode ? '#3b82f6' : '#93c5fd',
                          scrollMarginTop: '20px'
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
                        ref={(el) => {
                          if (el) {
                            headingRefs.current.set(id, el);
                          }
                        }}
                        className="text-base font-semibold mb-2 mt-4"
                        style={{ 
                          color: isLightMode ? '#111827' : '#ffffff',
                          scrollMarginTop: '20px'
                        }}
                      >
                        {children}
                      </h4>
                    );
                  },
                  p: ({ children, ...props }: any) => {
                    // If there are inline styles from the markdown HTML, use them and merge with defaults
                    if (props.style) {
                      return (
                        <p 
                          {...props}
                          className={props.className || "mb-3"}
                          style={{
                            ...props.style,
                          }}
                        >
                          {children}
                        </p>
                      );
                    }
                    return (
                      <p 
                        className="mb-3"
                        style={{ color: isLightMode ? '#1f2937' : '#d1d5db' }}
                      >
                        {children}
                      </p>
                    );
                  },
                  ul: ({ children }) => <ul className="list-disc list-inside mb-4 ml-4">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-4 ml-4">{children}</ol>,
                  li: ({ children }) => (
                    <li 
                      className="mb-1"
                      style={{ color: isLightMode ? '#1f2937' : '#d1d5db' }}
                    >
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => (
                    <strong 
                      className="font-semibold"
                      style={{ color: isLightMode ? '#111827' : '#ffffff' }}
                    >
                      {children}
                    </strong>
                  ),
                  a: ({ href, children }) => {
                    const youtubeVideoId = extractYouTubeVideoId(href);

                    if (youtubeVideoId) {
                      const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?modestbranding=1&rel=0&iv_load_policy=3&fs=1&playsinline=1&enablejsapi=0`;
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
                              position: 'relative'
                            }}
                          >
                            <iframe
                              src={youtubeEmbedUrl}
                              title="Tutorial video"
                              className="absolute top-0 left-0 w-full h-full"
                              style={{
                                width: '100%',
                                height: '100%',
                                border: 'none'
                              }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      );
                    }

                    return (
                      <a
                        href={href}
                        className="underline"
                        style={{
                          color: isLightMode ? '#1e40af' : '#60a5fa',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = isLightMode ? '#2563eb' : '#93c5fd';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = isLightMode ? '#1e40af' : '#60a5fa';
                        }}
                      >
                        {children}
                      </a>
                    );
                  },
                  div: ({ children, ...props }: any) => {
                    // Handle spacer divs
                    if ((props as any)['data-br-spacer'] === 'true') {
                      return (
                        <div 
                          style={{ height: '1.5em', margin: '0' }}
                          aria-hidden="true"
                        />
                      );
                    }
                    return <div {...props}>{children}</div>;
                  },
                  img: ({ src, alt }) => {
                    // Check if the source is a video file or instructions.mp4 (which we'll replace with YouTube)
                    const isVideo = src?.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i);
                    const isInstructionsVideo = src?.includes('instructions.mp4');
                    
                    // Replace instructions.mp4 with YouTube iframe
                    if (isInstructionsVideo) {
                      const youtubeVideoId = 'cMGgMO6DttE';
                      const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?modestbranding=1&rel=0&iv_load_policy=3&fs=1&playsinline=1&enablejsapi=0`;
                      
                      return (
                        <div className="flex justify-center my-4 w-full">
                          <div 
                            className="relative"
                            style={{ 
                              width: '90%',
                              maxWidth: '800px',
                              paddingBottom: '56.25%', // 16:9 aspect ratio (9/16 = 0.5625)
                              backgroundColor: isLightMode ? '#f3f4f6' : '#1f2937',
                              border: isLightMode ? '1px solid #d1d5db' : '1px solid #4b5563',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              position: 'relative'
                            }}
                          >
                            <iframe
                              src={youtubeEmbedUrl}
                              className="absolute top-0 left-0 w-full h-full"
                              style={{ 
                                width: '100%',
                                height: '100%',
                                border: 'none'
                              }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      );
                    }
                    
                    if (isVideo) {
                      return (
                        <div className="flex justify-center my-4 w-full">
                          {/* Container with fixed dimensions to prevent layout shift */}
                          <div 
                            className="relative"
                            style={{ 
                              width: '90%',
                              maxWidth: '800px',
                              paddingBottom: '56.25%', // 16:9 aspect ratio (9/16 = 0.5625)
                              backgroundColor: isLightMode ? '#f3f4f6' : '#1f2937',
                              border: isLightMode ? '1px solid #d1d5db' : '1px solid #4b5563',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              position: 'relative'
                            }}
                          >
                            <video 
                              src={src}
                              controls
                              preload="metadata"
                              className="absolute top-0 left-0 w-full h-full object-contain"
                              style={{ 
                                width: '100%',
                                height: '100%',
                                display: 'block',
                                margin: '0 auto'
                              }}
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
                          alt={alt} 
                          className="border border-gray-400"
                          style={{ maxWidth: '90%', maxHeight: '600px', height: 'auto', width: 'auto', display: 'block', margin: '0 auto' }}
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
          )}
        </div>

        {/* Contact */}
        <div id="contact" className="bg-gray-800 border border-gray-700 p-8 scroll-mt-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Contact</h2>
          <div className="text-gray-300 space-y-4 leading-relaxed">
            <p>
              If you have any questions about the study, please feel free to reach out:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong className="text-white">Project Lead:</strong>{" "}
                Nishant Balepur <a 
                  href="mailto:nbalepur@umd.edu" 
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  (nbalepur@umd.edu)
                </a>
              </li>
              <li>
                <strong className="text-white">Principal Investigator (PI):</strong>{" "}
                Professor Jordan Boyd-Graber <a 
                  href="mailto:ying@umd.edu" 
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  (ying@umd.edu)
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* IRB Consent Form in iframe */}
        <div id="irb-consent" className="bg-gray-800 border border-gray-700 p-8 relative scroll-mt-8">
          {/* Action Buttons - Top Right Corner */}
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={toggleLightMode}
              className="rounded transition-all"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '4px',
                border: '1px solid rgba(107, 114, 128, 0.3)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                background: isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(17, 24, 39, 0.9)',
                color: isLightMode ? '#1f2937' : '#d1d5db',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
            >
              {isLightMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '4px',
                border: '1px solid rgba(107, 114, 128, 0.3)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                background: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (!isDownloading) {
                  e.currentTarget.style.background = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (!isDownloading) {
                  e.currentTarget.style.background = '#2563eb';
                }
              }}
              title="Download as PDF"
            >
              {isDownloading ? (
                <LoadingSpinner size="sm" color="blue" />
              ) : (
                <Download size={16} />
              )}
            </button>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-4">Research Consent Form (IRB)</h2>
          <div className="w-full" style={{ height: '600px' }}>
            <IRBIframe className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

