'use client';

import { useEffect, useRef } from 'react';
import { irbConsentContent } from '../data/irbContent';
import { useIframeTheme } from '../utils/IframeThemeContext';

interface IRBIframeProps {
  className?: string;
}

export default function IRBIframe({ className }: IRBIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isLightMode } = useIframeTheme();

  useEffect(() => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (!doc) return;

    // Simple markdown to HTML converter for basic formatting
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
        .replace(/(<li.*<\/li>)/gims, '<ul style="list-style-type: disc; list-style-position: inside; margin-bottom: 1rem;">$1</ul>')
        .replace(/^(?!<[h|u|l])(.*$)/gim, `<p style="margin-bottom: 0.75rem; color: ${textColor};">$1</p>`)
        .replace(/\n\n/gim, '');
    };

    const bgColor = isLightMode ? '#ffffff' : '#111827';
    const textColor = isLightMode ? '#1f2937' : '#e5e7eb';

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
            /* Thin scrollbar styling */
            ::-webkit-scrollbar { width: 4px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: ${isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)'}; border-radius: 2px; }
            ::-webkit-scrollbar-thumb:hover { background: ${isLightMode ? 'rgba(107, 114, 128, 0.6)' : 'rgba(107, 114, 128, 0.7)'}; }
            /* Firefox scrollbar styling */
            * { scrollbar-width: thin; scrollbar-color: ${isLightMode ? 'rgba(107, 114, 128, 0.4)' : 'rgba(107, 114, 128, 0.5)'} transparent; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
              background: ${bgColor};
              color: ${textColor};
              padding: 24px;
              line-height: 1.6;
              overflow-y: auto;
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
  }, [isLightMode]);

  return (
    <iframe
      key={isLightMode ? 'light' : 'dark'}
      ref={iframeRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: isLightMode ? '#ffffff' : '#111827'
      }}
      sandbox="allow-same-origin"
      title="IRB Consent Form"
    />
  );
}

