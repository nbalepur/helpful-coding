'use client';

import { useState, useRef } from 'react';
import IRBIframe from "../components/IRBIframe";
import { irbConsentContent } from '../data/irbContent';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Download, Loader2 } from 'lucide-react';

export default function AboutPage() {
  const [isDownloading, setIsDownloading] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
    <div className="flex-1 flex flex-col items-start justify-start pt-8 pb-8 max-w-5xl mx-auto w-full">
      <h1 className="text-4xl font-semibold text-white mb-8">About</h1>
      <div className="flex flex-col gap-8 w-full">
        {/* About Content */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
          <h2 className="text-2xl font-semibold text-white mb-4">What We're Doing</h2>
          <div className="text-gray-300 space-y-4 leading-relaxed">
            <p>
              Welcome to Vibe Jam! We're conducting research to understand how artificial intelligence (AI) tools 
              affect coding practices, learning outcomes, and developer productivity. Our platform allows you to build 
              fun projects while helping us study how developers interact with AI-powered coding assistants.
            </p>
            <p>
              By participating in our study, you'll have access to advanced AI coding tools and may learn new programming 
              techniques. Your participation will contribute to important research about the future of software development.
            </p>
            <p>
              We collect data about your coding interactions and patterns to help improve AI-assisted development tools 
              for everyone. Your participation is confidential, and all data will be anonymized in any publications.
            </p>
          </div>
        </div>

        {/* Compensation */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Compensation</h2>
          <div className="text-gray-300 space-y-4 leading-relaxed">
            <p>
              Participants who complete the study tasks will be eligible for compensation based on their performance 
              and completion rate. Detailed compensation information will be provided upon enrollment.
            </p>
            <p>
              If you have any questions about compensation or the study, please contact the research team.
            </p>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Contact</h2>
          <div className="text-gray-300 space-y-4 leading-relaxed">
            <p>
              If you have any questions about the study, please feel free to reach out:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong className="text-white">Project Lead:</strong>{" "}
                <a 
                  href="mailto:nbalepur@umd.edu" 
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  nbalepur@umd.edu
                </a>
              </li>
              <li>
                <strong className="text-white">Principal Investigator (PI):</strong>{" "}
                <a 
                  href="mailto:ying@umd.edu" 
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  ying@umd.edu
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* IRB Consent Form in iframe */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 relative">
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
          <h2 className="text-2xl font-semibold text-white mb-4">Research Consent Form</h2>
          <div className="w-full" style={{ height: '600px' }}>
            <IRBIframe className="w-full h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

