'use client';

import React, { useState, useEffect, useRef } from 'react';
import IRBIframe from "../components/IRBIframe";
import { irbConsentContent } from '../data/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

export default function AboutPage() {
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const markdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch the markdown file from the public folder
    fetch('/instruction_assets/user_study_instructions.md')
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
        
        // Count videos in the markdown
        const videoCount = (processedText.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?/gi) || []).length;
        
        if (videoCount > 0) {
          // Add delay to allow videos to load metadata before showing content
          // This prevents layout shifts
          setTimeout(() => {
            setShowContent(true);
          }, 1500); // 1.5 second delay
        } else {
          // No videos, show immediately
          setShowContent(true);
        }
      })
      .catch((err) => {
        console.error('Error loading instructions:', err);
        setError('Failed to load instructions. Please try refreshing the page.');
        setIsLoading(false);
        setShowContent(true);
      });
  }, []);
  
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

  return (
    <div className="flex-1 flex flex-col items-start justify-start pt-8 pb-8 max-w-6xl mx-auto w-full">
      <h1 className="text-4xl font-semibold text-white mb-4">About</h1>
      <p className="text-gray-300 mb-8 leading-relaxed">
        This page has all information about the study. You can navigate to{' '}
        <a href="#instructions" className="text-blue-400 hover:text-blue-300 underline">Instructions</a>,{' '}
        <a href="#compensation" className="text-blue-400 hover:text-blue-300 underline">Compensation</a>,{' '}
        <a href="#contact" className="text-blue-400 hover:text-blue-300 underline">Contact</a>, or the{' '}
        <a href="#irb-consent" className="text-blue-400 hover:text-blue-300 underline">Research Consent Form (IRB)</a>.
      </p>
      <div className="flex flex-col gap-8 w-full">
        {/* User Study Instructions */}
        <div id="instructions" className="bg-gray-800 rounded-lg border border-gray-700 p-8 scroll-mt-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Instructions</h2>
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
              <div 
                ref={markdownRef}
                className="text-gray-300 leading-relaxed h-full overflow-y-auto" 
                style={{ backgroundColor: '#111827', padding: '24px', borderRadius: '8px' }}
              >
                <Markdown
                rehypePlugins={[rehypeRaw]}
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-white mb-4 mt-0">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-blue-400 mb-3 mt-6">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold text-blue-300 mb-2 mt-4">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-base font-semibold text-white mb-2 mt-4">{children}</h4>,
                  p: ({ children }) => <p className="text-gray-300 mb-3">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-4 ml-4">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-4 ml-4">{children}</ol>,
                  li: ({ children }) => <li className="text-gray-300 mb-1">{children}</li>,
                  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                  a: ({ href, children }) => (
                    <a href={href} className="text-blue-400 hover:text-blue-300 underline">
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
                    // Check if the source is a video file
                    const isVideo = src?.match(/\.(mp4|webm|ogg|avi|mov)(\?.*)?$/i);
                    
                    if (isVideo) {
                      return (
                        <div className="flex justify-center my-4">
                          {/* Container with fixed dimensions to prevent layout shift */}
                          <div 
                            className="relative"
                            style={{ 
                              width: '90%',
                              maxWidth: '800px',
                              paddingBottom: '56.25%', // 16:9 aspect ratio (9/16 = 0.5625)
                              backgroundColor: '#1f2937',
                              border: '1px solid #4b5563',
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
                                height: '100%'
                              }}
                            >
                              Your browser does not support the video tag.
                            </video>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="flex justify-center my-4">
                        <img 
                          src={src} 
                          alt={alt} 
                          className="border border-gray-400"
                          style={{ maxWidth: '90%', maxHeight: '600px', height: 'auto', width: 'auto' }}
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
        <div id="compensation" className="bg-gray-800 rounded-lg border border-gray-700 p-8 scroll-mt-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Compensation</h2>
          <div className="text-gray-300 space-y-4 leading-relaxed">
            <p>
              To be announced! This will be filled in when you are actually participating in the study.
            </p>
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
          {/* Download Button - Top Right Corner */}
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="absolute top-4 right-4 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download as PDF"
          >
            {isDownloading ? (
              <LoadingSpinner size="sm" color="blue" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
          <h2 className="text-2xl font-semibold text-white mb-4">Research Consent Form (IRB)</h2>
          <div className="w-full" style={{ height: '600px' }}>
            <IRBIframe className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

