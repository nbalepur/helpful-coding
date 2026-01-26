'use client';

import React, { useState, useEffect, useRef } from 'react';
import IRBIframe from "../components/IRBIframe";
import { irbConsentContent } from '../data/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Sun, Moon, Award, Sparkles, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { useIframeTheme } from '../utils/IframeThemeContext';
import { isStudyEnded } from '../config/study';
import { formatDateOnly } from '../utils/dateFormat';

export default function AboutPage() {
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const markdownRef = useRef<HTMLDivElement>(null);
  const { isLightMode, toggleLightMode } = useIframeTheme();
  const studyEnded = isStudyEnded();

  useEffect(() => {
    // Fetch the markdown file from the public folder
    const instructionsPath = studyEnded
      ? '/instruction_assets/user_study_instructions_post_study.md'
      : '/instruction_assets/user_study_instructions.md';
    fetch(instructionsPath)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load instructions');
        }
        return response.text();
      })
      .then((text) => {
        // Preprocess markdown: convert <br /> tags to spacing divs
        // These will be rendered as HTML using rehype-raw plugin
        const processedText = text.replace(/<br\s*\/?>/gi, '\n\n<div style="height: 1.5em; margin: 0;" data-br-spacer="true" aria-hidden="true"></div>\n\n');
        setMarkdownContent(processedText);
        setIsLoading(false);
        // Show content immediately - videos have fixed-size containers to prevent layout shifts
        setShowContent(true);
      })
      .catch((err) => {
        console.error('Error loading instructions:', err);
        setError('Failed to load instructions. Please try refreshing the page.');
        setIsLoading(false);
        setShowContent(true);
      });
  }, [studyEnded]);
  
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
    <div className="flex-1 flex flex-col items-start justify-start pt-8 pb-8 max-w-6xl mx-auto w-full">
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
          href="#compensation" 
          onClick={(e) => handleSmoothScroll(e, 'compensation')}
          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
        >
          Compensation
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
        <div id="instructions" className="bg-gray-800 rounded-lg border border-gray-700 p-8 scroll-mt-8 relative">
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
              `}</style>
              <div 
                ref={markdownRef}
                className="leading-relaxed h-full overflow-y-auto instructions-scrollable" 
                style={{ 
                  backgroundColor: isLightMode ? '#ffffff' : '#111827', 
                  color: isLightMode ? '#1f2937' : '#d1d5db',
                  padding: '24px', 
                  borderRadius: '8px' 
                }}
              >
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
                  h2: ({ children }) => (
                    <h2 
                      className="text-xl font-semibold mb-3 mt-6"
                      style={{ color: isLightMode ? '#2563eb' : '#60a5fa' }}
                    >
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 
                      className="text-lg font-semibold mb-2 mt-4"
                      style={{ color: isLightMode ? '#3b82f6' : '#93c5fd' }}
                    >
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 
                      className="text-base font-semibold mb-2 mt-4"
                      style={{ color: isLightMode ? '#111827' : '#ffffff' }}
                    >
                      {children}
                    </h4>
                  ),
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
                  a: ({ href, children }) => (
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
                  ),
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
                      const youtubeVideoId = studyEnded ? '5bmywSslJRw' : 'cMGgMO6DttE';
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
          )}
        </div>

        {/* Compensation */}
        <div 
          id="compensation" 
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-gray-700 p-8 scroll-mt-8 shadow-lg"
        >
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white">
              Compensation
            </h2>
          </div>
          
          <div className="space-y-6">
            {/* Core Study Compensation */}
            {!studyEnded && (
              <div className={`rounded-lg border p-6 transition-colors ${
                isLightMode
                  ? 'bg-white border-gray-300 hover:border-gray-400'
                  : 'bg-gray-700/30 border-gray-700/50 hover:border-gray-600/50'
              }`}>
                <div className="flex items-start gap-4 mb-4">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${
                    isLightMode ? 'bg-green-100' : 'bg-green-600/20'
                  }`}>
                    <Award className={`w-5 h-5 ${
                      isLightMode ? 'text-green-600' : 'text-green-400'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-xl font-semibold mb-3 ${
                      isLightMode ? 'text-gray-900' : 'text-white'
                    }`}>
                      Main Study Compensation
                    </h3>
                    <div className={`space-y-3 leading-relaxed ${
                      isLightMode ? 'text-gray-700' : 'text-gray-300'
                    }`}>
                      <p>
                        All users who participate in our main research study (pre-test, three website-building projects, post-test) for coursework extra credit will receive the agreed-upon amount of credit from their instructor. 
                        
                        Users who participate in the study for monetary compensation will receive{' '}
                        <span className={`font-bold ${
                          isLightMode ? 'text-blue-600' : 'text-blue-400'
                        }`}>
                          $75
                        </span>
                        .
                      </p>
                      <p>
                         The creators of the 10 highest-scoring websites for the three required website-building projects (30 users total) will receive <span className={`font-bold ${
                           isLightMode ? 'text-blue-600' : 'text-blue-400'
                         }`}>$10</span> each. External human judges will evaluate submissions on task fulfillment, style, enjoyment, and creativity at the end of the study, and the website scores will be computed as the average of these scores. The same user can win multiple bonus rewards across the three projects.
                      </p>

                      <p>
                        This compensation will be available until <span className={`font-bold ${
                           isLightMode ? 'text-blue-600' : 'text-blue-400'
                         }`}>{formatDateOnly(process.env.NEXT_PUBLIC_STUDY_END_DATE)}</span>. Any changes to this date will be announced on this page and over email.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Public Tasks Compensation */}
            <div className={`rounded-lg border p-6 transition-colors ${
              isLightMode
                ? 'bg-white border-gray-300 hover:border-gray-400'
                : 'bg-gray-700/30 border-gray-700/50 hover:border-gray-600/50'
            }`}>
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isLightMode ? 'bg-purple-100' : 'bg-purple-600/20'
                }`}>
                  <Sparkles className={`w-5 h-5 ${
                    isLightMode ? 'text-purple-600' : 'text-purple-400'
                  }`} />
                </div>
                <div className="flex-1">
                  <h3 className={`text-xl font-semibold mb-3 ${
                    isLightMode ? 'text-gray-900' : 'text-white'
                  }`}>
                    Public VibeJam Tasks Compensation
                  </h3>
                  <div className={`space-y-3 leading-relaxed ${
                    isLightMode ? 'text-gray-700' : 'text-gray-300'
                  }`}>
                    <p>
                      We will also offer monetary rewards for users who complete the 50+ public projects in VibeJam. The 10 users who submit the most projects, or the first 10 users to submit all projects, will each receive <span className={`font-bold ${
                        isLightMode ? 'text-blue-600' : 'text-blue-400'
                      }`}>$10</span>. The three users with the highest website scores per project will each receive <span className={`font-bold ${
                        isLightMode ? 'text-blue-600' : 'text-blue-400'
                      }`}>$5</span>. The same user can win multiple bonus rewards across projects.
                    </p>
                    <p>
                      We also plan to award <span className={`font-bold ${
                        isLightMode ? 'text-blue-600' : 'text-blue-400'
                      }`}>$100</span> in bonus compensation for particularly creative, popular, or well-designed websites. You will be notified via email if you are eligible for this reward.
                    </p>

                    <p>
                      This compensation will be available until <span className={`font-bold ${
                         isLightMode ? 'text-blue-600' : 'text-blue-400'
                       }`}>
                         {formatDateOnly(process.env.NEXT_PUBLIC_STUDY_END_DATE_OVERALL)}
                       </span>. Any changes to this date will be announced on this page and over email.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Multiple Rewards Available */}
            <p className="text-gray-300 leading-relaxed">
              You can win <strong className="text-white">multiple rewards</strong> across tasks. Each high-performing submission qualifies for its own reward, allowing you to accumulate earnings across all projects. At the end of the study, all monetary rewards will be distributed via email (online gift cards with Tango). We will intermittently send user study progress updates to your registered email. If you have any questions, please email <a href="mailto:nbalepur@umd.edu" className="text-blue-400 hover:text-blue-300 underline">nbalepur@umd.edu</a>.
            </p>

            {/* Additional Warnings and Notes - Minimal Badge */}
            <div className="bg-red-600/10 border-l-4 border-red-500 rounded-r p-4">
              <p className="text-white font-medium mb-2 flex items-center text-lg">
                <AlertTriangle className="w-5 h-5 mr-2 text-red-400 flex-shrink-0" />
                Warnings
              </p>
              <ul className="text-gray-300 space-y-2 list-disc list-inside">
                <li>There will be attention checks scattered throughout the skill-check questions to make sure you are paying attention. We may withdraw your compensation if you fail all checks</li>
                <li>Any detected attempts to game our user study or submit offensive websites in any way will result in immediate account termination.</li>
                <li>Please do not look up the answers to any skill assessment questions. You are not being rewarded for answering more accurately; our research study just wants to understand where students succeed and struggle when using AI assistants.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div id="contact" className="bg-gray-800 rounded-lg border border-gray-700 p-8 scroll-mt-8">
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
        <div id="irb-consent" className="bg-gray-800 rounded-lg border border-gray-700 p-8 relative scroll-mt-8">
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

