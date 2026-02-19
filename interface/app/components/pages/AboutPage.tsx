'use client';

import React, { useState } from 'react';
import IRBIframe from "../auth/irb/IRBIframe";
import { irbConsentContent } from '../auth/irb/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Sun, Moon } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import UserInstructionsContent from '../ui/UserInstructionsContent';
import { useIframeTheme } from '../../context/IframeThemeContext';
import { ENV } from '../../config/env';

export default function AboutPage() {
  const [isDownloading, setIsDownloading] = useState(false);
  const { isLightMode, toggleLightMode } = useIframeTheme();
  const studyEnded = true;


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
          <UserInstructionsContent
            isLightMode={isLightMode}
            showToc={true}
            youtubeInstructionsVideoId="HQD2FS-qJ44"
            contentHeight="600px"
            className="w-full"
          />
        </div>

        {/* Compensation */}
        <div 
          id="compensation" 
          className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 p-8 scroll-mt-8 shadow-lg"
        >
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-white">
              Compensation
            </h2>
          </div>
          <p className={`leading-relaxed ${isLightMode ? 'text-gray-700' : 'text-gray-300'}`}>
            [Add compensation details here.]
          </p>
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
                {ENV.FROM_CONTACT_NAME}{" "}
                <a
                  href={`mailto:${ENV.FROM_CONTACT_EMAIL}`}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  ({ENV.FROM_CONTACT_EMAIL})
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* IRB Consent Form in iframe */}
        <div id="irb-consent" className="bg-gray-800 border border-gray-700 p-8 scroll-mt-8">
          {/* Header row: title + action buttons so they never overlap */}
          <div className="flex items-start justify-between gap-4 mb-4">
            <h2 className="text-2xl font-semibold text-white min-w-0 flex-1">Research Consent Form (IRB)</h2>
            <div className="flex gap-2 flex-shrink-0">
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
          </div>
          <div className="w-full" style={{ height: '600px' }}>
            <IRBIframe className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

