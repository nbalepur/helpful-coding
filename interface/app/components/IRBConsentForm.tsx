'use client';

import { useState, useEffect } from 'react';
import { irbConsentContent } from '../data/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Sun, Moon } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { formatTodayDate } from '../utils/dateFormat';
import { useIframeTheme } from '../utils/IframeThemeContext';

interface IRBConsentFormProps {
  onAgree: () => void;
  onCancel: () => void;
}

export default function IRBConsentForm({ onAgree, onCancel }: IRBConsentFormProps) {
  const [markdownContent, setMarkdownContent] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [todayDate, setTodayDate] = useState<string>('');
  const { isLightMode, toggleLightMode } = useIframeTheme();

  useEffect(() => {
    // Use the imported content directly
    setMarkdownContent(irbConsentContent);
    // Set today's date on client side only to avoid hydration mismatch
    setTodayDate(formatTodayDate());
  }, []);

  // Simple markdown to HTML converter for basic formatting with theme support
  const parseMarkdown = (text: string) => {
    const h1Color = isLightMode ? '#111827' : '#ffffff';
    const h2Color = isLightMode ? '#2563eb' : '#60a5fa';
    const h3Color = isLightMode ? '#3b82f6' : '#93c5fd';
    const textColor = isLightMode ? '#1f2937' : '#d1d5db';
    const strongColor = isLightMode ? '#111827' : '#ffffff';
    
    return text
      .replace(/^# (.*$)/gim, `<h1 style="font-size: 1.5rem; font-weight: 700; color: ${h1Color}; margin-bottom: 1rem;">$1</h1>`)
      .replace(/^## (.*$)/gim, `<h2 style="font-size: 1.25rem; font-weight: 600; color: ${h2Color}; margin-bottom: 0.75rem; margin-top: 1.5rem;">$1</h2>`)
      .replace(/^### (.*$)/gim, `<h3 style="font-size: 1.125rem; font-weight: 600; color: ${h3Color}; margin-bottom: 0.5rem; margin-top: 1rem;">$1</h3>`)
      .replace(/\*\*(.*?)\*\*/gim, `<strong style="color: ${strongColor}; font-weight: 600;">$1</strong>`)
      .replace(/^- (.*$)/gim, `<li style="margin-left: 1rem; margin-bottom: 0.25rem; color: ${textColor};">$1</li>`)
      .replace(/(<li[^>]*>.*?<\/li>)/gim, '<ul style="list-style-type: disc; list-style-position: inside; margin-bottom: 1rem;">$1</ul>')
      .replace(/^(?!<[h|u|l])(.*$)/gim, `<p style="margin-bottom: 0.75rem; color: ${textColor};">$1</p>`)
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
        .replace(/(<li[^>]*>.*?<\/li>)/gim, '<ul style="margin: 10px 0; padding-left: 30px;">$1</ul>')
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
      alert('Failed to generate PDF. Please try again! If the problem persists, please contact <a href="mailto:nbalepur@umd.edu">us</a>!');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 relative z-20">
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

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-xl text-white mb-0" style={{textAlign: 'center'}}>Please agree to the consent form before proceeding</h2>
          </div>

          {/* Content - No max-height constraint, page is scrollable */}
          <div 
            className="mb-8 pr-4 rounded-md p-6 border border-gray-700"
            style={{ 
              backgroundColor: isLightMode ? '#ffffff' : '#111827',
              color: isLightMode ? '#1f2937' : '#d1d5db'
            }}
          >
            <div 
              className="leading-relaxed"
              dangerouslySetInnerHTML={{ __html: parseMarkdown(markdownContent) }}
            />
          </div>

          {/* Current Date */}
          {todayDate && (
            <div className="text-center mb-4">
              <p className="text-white-400 text-sm">
                Today's Date: {todayDate}
              </p>
            </div>
          )}

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
              className="px-8 py-3 font-medium rounded-md transition-all duration-200 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:-translate-y-0.5"
            >
              I Agree
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
