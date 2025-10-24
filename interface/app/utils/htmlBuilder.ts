// Shared utility for building complete HTML documents from HTML/CSS/JS fragments
// Used by PreviewIframe, TestCasesPanel, and popup windows for consistency

import { prependCallAPIFunction } from './callAPIHelper';

export interface BuildHTMLOptions {
  htmlCode: string;
  cssCode?: string;
  jsCode?: string;
  backendPort?: number | null;
  backendCode?: string;
}

/**
 * Builds a complete HTML document from HTML/CSS/JS code fragments.
 * Handles both full HTML documents and HTML fragments.
 * Injects CSS, JS, and callAPI function in the correct locations.
 */
export const buildFullHTMLDocument = (options: BuildHTMLOptions): string => {
  const {
    htmlCode,
    cssCode = '',
    jsCode = '',
    backendPort = null,
    backendCode = ''
  } = options;

  // Prepend callAPI function to JavaScript
  const processedJs = prependCallAPIFunction(jsCode, backendPort, backendCode);

  let fullHtml = '';

  if (htmlCode.includes('<html') || htmlCode.includes('<!DOCTYPE')) {
    // Full HTML document - inject CSS and JS into existing structure
    fullHtml = htmlCode;

    // Inject CSS into <head>
    if (cssCode) {
      const styleTag = `<style>${cssCode}</style>`;
      if (fullHtml.includes('</head>')) {
        fullHtml = fullHtml.replace('</head>', `${styleTag}</head>`);
      } else {
        fullHtml = fullHtml.replace('<html>', `<html><head>${styleTag}</head>`);
      }
    }

    // Inject JS before </body>
    if (processedJs) {
      const scriptTag = `<script>${processedJs}</script>`;
      if (fullHtml.includes('</body>')) {
        fullHtml = fullHtml.replace('</body>', `${scriptTag}</body>`);
      } else {
        fullHtml = fullHtml + scriptTag;
      }
    }
  } else {
    // HTML fragment - wrap in complete document structure
    fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>${cssCode}</style>
        </head>
        <body>
          ${htmlCode}
          <script>${processedJs}</script>
        </body>
      </html>
    `;
  }

  return fullHtml;
};

