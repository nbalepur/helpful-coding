'use client';

import { useState, useEffect, useRef } from 'react';
import { irbConsentContent } from '../data/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Loader2 } from 'lucide-react';

interface IRBConsentFormProps {
  onAgree: () => void;
  onCancel: () => void;
}

export default function IRBConsentForm({ onAgree, onCancel }: IRBConsentFormProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [markdownContent, setMarkdownContent] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Use the imported content directly
    setMarkdownContent(irbConsentContent);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 1;
    setHasScrolledToBottom(isAtBottom);
  };

  // Simple markdown to HTML converter for basic formatting
  const parseMarkdown = (text: string) => {
    return text
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-white mb-4">$1</h1>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-blue-400 mb-3 mt-6">$1</h2>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-blue-300 mb-2 mt-4">$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-white">$1</strong>')
      .replace(/^- (.*$)/gim, '<li class="ml-4 mb-1 text-gray-300">$1</li>')
      .replace(/(<li.*<\/li>)/gims, '<ul class="list-disc list-inside mb-4">$1</ul>')
      .replace(/^(?!<[h|u|l])(.*$)/gim, '<p class="mb-3 text-gray-300">$1</p>')
      .replace(/\n\n/gim, '');
  };

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
      const pdfHtml = markdownContent
        .replace(/^# (.*$)/gim, '<h1 style="font-size: 24px; font-weight: bold; margin: 20px 0 15px 0; color: #000;">$1</h1>')
        .replace(/^## (.*$)/gim, '<h2 style="font-size: 20px; font-weight: bold; margin: 18px 0 12px 0; color: #1e40af;">$1</h2>')
        .replace(/^### (.*$)/gim, '<h3 style="font-size: 16px; font-weight: bold; margin: 15px 0 10px 0; color: #3b82f6;">$1</h3>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong style="font-weight: bold; color: #000;">$1</strong>')
        .replace(/^- (.*$)/gim, '<li style="margin: 5px 0; padding-left: 20px; list-style-type: disc;">$1</li>')
        .replace(/(<li.*<\/li>)/gims, '<ul style="margin: 10px 0; padding-left: 30px;">$1</ul>')
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
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-4xl my-8 relative">
        {/* Back Button */}
        <button
          onClick={onCancel}
          className="mb-6 flex items-center text-white hover:text-blue-400 transition-all duration-200 hover:-translate-y-0.5 bg-transparent hover:bg-transparent"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>

        {/* Main Content Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 shadow-lg relative">
          {/* Download Button - Top Right Corner */}
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloading}
            className="absolute top-4 right-4 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download as PDF"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-xl text-white mb-0" style={{textAlign: 'center'}}>Please agree to the consent form before proceeding</h2>
          </div>

          {/* Scrollable Content - Improved dark theme styling */}
          <div 
            className="max-h-96 overflow-y-auto mb-8 pr-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 bg-gray-900 rounded-md p-6 border border-gray-700"
            onScroll={handleScroll}
          >
            <div 
              ref={contentRef}
              className="text-gray-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(markdownContent) }}
            />
          </div>

          {/* Scroll Indicator - Always present but invisible when scrolled */}
          <div className={`text-center mb-6 transition-opacity duration-300 ${hasScrolledToBottom ? 'opacity-0' : 'opacity-100'}`}>
            <p className="text-gray-400 text-sm">Please scroll down to read the full consent form before proceeding</p>
            <div className="mt-3">
              <svg className="w-6 h-6 text-gray-400 mx-auto animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>
          </div>

          {/* Current Date */}
          <div className="text-center mb-4">
            <p className="text-white-400 text-sm">
              Today's Date:{" "}{new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onCancel}
              className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition-colors duration-200"
            >
              Take me Back
            </button>
            <button
              onClick={onAgree}
              disabled={!hasScrolledToBottom}
              className={`px-8 py-3 font-medium rounded-md transition-all duration-200 ${
                hasScrolledToBottom
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:-translate-y-0.5'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              I Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
