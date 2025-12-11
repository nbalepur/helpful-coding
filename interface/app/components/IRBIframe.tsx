'use client';

import { useEffect, useRef } from 'react';
import { irbConsentContent } from '../data/irbContent';

interface IRBIframeProps {
  className?: string;
}

export default function IRBIframe({ className }: IRBIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (!doc) return;

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

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
              background: #111827;
              color: #e5e7eb;
              padding: 24px;
              line-height: 1.6;
            }
            h1 {
              font-size: 1.5rem;
              font-weight: 700;
              color: #ffffff;
              margin-bottom: 1rem;
            }
            h2 {
              font-size: 1.25rem;
              font-weight: 600;
              color: #60a5fa;
              margin-bottom: 0.75rem;
              margin-top: 1.5rem;
            }
            h3 {
              font-size: 1.125rem;
              font-weight: 600;
              color: #93c5fd;
              margin-bottom: 0.5rem;
              margin-top: 1rem;
            }
            p {
              margin-bottom: 0.75rem;
              color: #d1d5db;
            }
            ul {
              list-style-type: disc;
              list-style-position: inside;
              margin-bottom: 1rem;
            }
            li {
              margin-left: 1rem;
              margin-bottom: 0.25rem;
              color: #d1d5db;
            }
            strong {
              color: #ffffff;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          ${parseMarkdown(irbConsentContent)}
        </body>
      </html>
    `;

    doc.open();
    doc.write(htmlContent);
    doc.close();
  }, []);

  return (
    <iframe
      ref={iframeRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '8px',
        background: '#111827'
      }}
      sandbox="allow-same-origin"
      title="IRB Consent Form"
    />
  );
}

