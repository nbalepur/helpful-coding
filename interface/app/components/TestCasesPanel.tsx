import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import html2canvas from 'html2canvas';
import { ENV } from '../config/env';
import { buildFullHTMLDocument } from '../utils/htmlBuilder';
import { executeInteractiveTest } from '../utils/interactiveTestRunner';

interface TestCase {
  title: string;
  name: string;
  description: string;
  public?: boolean;
  type?: string; // 'frontend_interactive' for interactive tests
  // Frontend interactive test fields
  setup?: {
    mocks?: Array<{
      endpoint: string;
      method?: string;
      response?: any;
      sequence?: any[];
      delay?: number;
    }>;
    localStorage?: Record<string, any>;
    cookies?: Record<string, any>;
  };
  steps?: Array<{
    action?: string;
    assert?: string;
    selector?: string;
    value?: string;
    duration?: number;
    expected?: any;
    attribute?: string;
    property?: string;
    description?: string;
  }>;
  // Backend test fields
  endpoint?: string;
  input?: any;
  expected?: any;
  // Legacy metadata format
  metadata?: {
    type: string;
    endpoint: string;
    input: any;
    expected: any;
    [key: string]: any;
  };
}

interface TestCaseGroup {
  title: string;
  tests: TestCase[];
}

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'error' | 'skip';
  message: string;
  expected?: any;
  actual?: any;
  screenshot?: string; // Base64 screenshot for frontend tests
  originalStatus?: 'pass' | 'fail' | 'error' | 'skip'; // Original status before override
  isOverridden?: boolean; // Whether the result was manually overridden
  overrideReason?: string; // Reason provided for the override
  stepResults?: Array<{
    success: boolean;
    description?: string;
    action?: string;
    assert?: string;
    error?: string;
  }>; // Step-by-step results for interactive tests
}

interface TestCasesPanelProps {
  testCases: TestCaseGroup[];
  backendCode: string;
  backendPort?: number | null; // Backend port for callAPI
  htmlCode?: string | (() => string); // HTML code for frontend tests (or getter function)
  cssCode?: string | (() => string); // CSS code for frontend tests (or getter function)
  jsCode?: string | (() => string); // JavaScript code for frontend tests (or getter function)
  onTestsExecuted?: (results: TestResult[]) => void;
  onSelectedCountChange?: (count: number) => void;
  onRunningStateChange?: (isRunning: boolean) => void;
  onAllTestsPassedChange?: (allPassed: boolean) => void;
  onTestResultsChange?: (results: TestResult[]) => void;
}

export interface TestCasesPanelRef {
  runAllTests: () => void;
  runSelectedTests: () => void;
  clearResults: () => void;
  selectedTestsCount: number;
  isRunning: boolean;
}

// Helper function to determine if a test is a frontend visual test
const isFrontendTest = (test: TestCase): boolean => {
  // Frontend tests don't have endpoint field
  return !test.endpoint && !test.metadata?.endpoint;
};

// Helper function to determine if a test is a frontend interactive test
const isFrontendInteractiveTest = (test: TestCase): boolean => {
  return test.type === 'frontend_interactive' && !!test.steps;
};

// Capture screenshot by rendering HTML/CSS/JS in an iframe (same as PreviewIframe)
const captureHTMLScreenshot = async (htmlCode: string, cssCode: string, jsCode: string = '', backendPort: number | null = null, backendCode: string = ''): Promise<string | null> => {
  let tempIframe: HTMLIFrameElement | null = null;
  
  try {
    // Create a temporary hidden iframe
    tempIframe = document.createElement('iframe');
    tempIframe.style.position = 'fixed';
    tempIframe.style.left = '-9999px';
    tempIframe.style.top = '0';
    tempIframe.style.width = '1024px'; // Standard desktop width
    tempIframe.style.height = '768px';
    tempIframe.style.border = 'none';
    tempIframe.sandbox.add('allow-scripts');
    tempIframe.sandbox.add('allow-same-origin');
    document.body.appendChild(tempIframe);
    
    // Build complete HTML document using shared utility
    const fullHtml = buildFullHTMLDocument({
      htmlCode,
      cssCode,
      jsCode,
      backendPort,
      backendCode
    });
    
    // Write content to iframe
    const iframeDoc = tempIframe.contentDocument || tempIframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(fullHtml);
      iframeDoc.close();
    }
    
    // Wait for content to render
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Capture the iframe content body at high resolution for LLM
    if (iframeDoc && iframeDoc.body) {
      const canvas = await html2canvas(iframeDoc.body, {
        allowTaint: true,
        useCORS: true,
        backgroundColor: '#ffffff',
        scale: 2, // High resolution capture for detailed LLM analysis
        logging: false,
        width: 1024,
        height: 768
      });
      
      // Convert to base64 data URL with good quality for LLM
      const screenshot = canvas.toDataURL('image/png', 0.95); // 95% quality for LLM
      
      return screenshot;
    }
    
    return null;
  } catch (error) {
    console.error('Error capturing HTML screenshot:', error);
    return null;
  } finally {
    // Clean up: remove the temporary iframe
    if (tempIframe && tempIframe.parentNode) {
      tempIframe.parentNode.removeChild(tempIframe);
    }
  }
};

// Call OpenAI LLM judge for frontend visual tests
const callLLMJudge = async (testCase: TestCase, screenshot: string | null, htmlCode: string): Promise<{ judgment: 'pass' | 'fail', explanation: string }> => {
  // Log test info (no screenshot data to keep console clean)
  
  if (!screenshot) {
    return {
      judgment: 'fail',
      explanation: 'No screenshot available to evaluate'
    };
  }
  
  try {
    // Call the backend LLM judge endpoint
    const response = await fetch(`${ENV.BACKEND_URL}/api/llm-judge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        screenshot: screenshot,
        testCase: {
          name: testCase.name,
          description: testCase.description
        },
        htmlCode: htmlCode
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('LLM Judge API error:', errorData);
      return {
        judgment: 'fail',
        explanation: `API Error: ${errorData.error || response.statusText}`
      };
    }
    
    const result = await response.json();
    
    return {
      judgment: result.judgment,
      explanation: result.explanation
    };
    
  } catch (error) {
    console.error('Error calling LLM judge:', error);
    return {
      judgment: 'fail',
      explanation: `Failed to call LLM judge: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

const TestCasesPanel = forwardRef<TestCasesPanelRef, TestCasesPanelProps>(({ testCases, backendCode, backendPort, htmlCode, cssCode, jsCode, onTestsExecuted, onSelectedCountChange, onRunningStateChange, onAllTestsPassedChange, onTestResultsChange }, ref) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Map<string, TestResult>>(new Map());
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [modalScreenshot, setModalScreenshot] = useState<{screenshot: string, testName: string} | null>(null);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    runAllTests,
    runSelectedTests,
    clearResults,
    selectedTestsCount: selectedTests.size,
    isRunning
  }), [selectedTests.size, isRunning]);

  // Auto-expand all groups on mount
  useEffect(() => {
    const allGroups = new Set(testCases.map(group => group.title));
    setExpandedGroups(allGroups);
  }, [testCases]);

  // Auto-select all tests on mount
  useEffect(() => {
    const allTestNames = new Set<string>();
    testCases.forEach(group => {
      group.tests.forEach(test => {
        allTestNames.add(test.name);
      });
    });
    setSelectedTests(allTestNames);
  }, [testCases]);

  // Notify parent of selected tests count changes
  useEffect(() => {
    onSelectedCountChange?.(selectedTests.size);
  }, [selectedTests.size, onSelectedCountChange]);

  // Notify parent of running state changes
  useEffect(() => {
    onRunningStateChange?.(isRunning);
  }, [isRunning, onRunningStateChange]);

  // Update iframe content whenever test data changes
  useEffect(() => {
    if (!iframeRef.current) return;

    const generateIframeContent = () => {
      const getTestIcon = (testName: string) => {
        const result = testResults.get(testName);
        if (!result) return '';

        switch (result.status) {
          case 'pass':
            return '<span style="color: #10b981;">✓</span>';
          case 'fail':
            return '<span style="color: #ef4444;">✗</span>';
          case 'error':
            return '<span style="color: #eab308;">⚠</span>';
          case 'skip':
            return '<span style="color: #9ca3af;">⚠</span>';
          default:
            return '';
        }
      };

      const getTestStatusClass = (testName: string) => {
        const result = testResults.get(testName);
        if (!result) return '';

        switch (result.status) {
          case 'pass':
            return 'border-color: #10b981; background-color: rgba(16, 185, 129, 0.2);';
          case 'fail':
            return 'border-color: #ef4444; background-color: rgba(239, 68, 68, 0.2);';
          case 'error':
            return 'border-color: #eab308; background-color: rgba(234, 179, 8, 0.2);';
          case 'skip':
            return 'border-color: #9ca3af; background-color: rgba(156, 163, 175, 0.2);';
          default:
            return '';
        }
      };

      let html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #2d2d2d;
              color: #e5e7eb;
              padding: 0 12px 12px 12px;
              font-size: 14px;
            }
            /* Custom scrollbar styling */
            ::-webkit-scrollbar {
              width: 4px;
            }
            ::-webkit-scrollbar-track {
              background: transparent;
            }
            ::-webkit-scrollbar-thumb {
              background: #4a5568;
              border-radius: 2px;
            }
            ::-webkit-scrollbar-thumb:hover {
              background: #5a6678;
            }
            .test-group {
              background: rgba(0, 0, 0, 0.3);
              border-radius: 6px;
              padding: 8px;
              margin-bottom: 12px;
            }
            .test-group-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .test-group-header button {
              background: none;
              border: none;
              color: #e5e7eb;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .test-group-header button:hover {
              color: #ffffff;
            }
            .api-label {
              color: #9ca3af;
              font-weight: 400;
            }
            .select-all-btn {
              font-size: 12px;
              color: #60a5fa;
              margin-right: 8px;
            }
            .select-all-btn:hover {
              color: #93c5fd;
            }
            .test-group-content {
              margin-top: 8px;
            }
            .test-case-item {
              margin-bottom: 4px;
              padding: 0;
              border-radius: 4px;
              flex: 1;
              background-color: #374151;
            }
            .test-case-item > div:first-child {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .test-case-item.selected {
            }
            .toggle-switch {
              position: relative;
              display: inline-block;
              width: 28px;
              height: 16px;
              flex-shrink: 0;
              margin-top: 6px;
            }
            .toggle-switch input {
              opacity: 0;
              width: 0;
              height: 0;
            }
            .toggle-slider {
              position: absolute;
              cursor: pointer;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: #4b5563;
              transition: 0.3s;
              border-radius: 16px;
            }
            .toggle-slider:before {
              position: absolute;
              content: "";
              height: 10px;
              width: 10px;
              left: 3px;
              bottom: 3px;
              background-color: white;
              transition: 0.3s;
              border-radius: 50%;
            }
            .toggle-switch input:checked + .toggle-slider {
              background-color: rgba(107, 163, 227, 0.4);
            }
            .toggle-switch input:checked + .toggle-slider.pass {
              background-color: rgba(16, 185, 129, 0.5);
            }
            .toggle-switch input:checked + .toggle-slider.fail {
              background-color: rgba(239, 68, 68, 0.5);
            }
            .toggle-switch input:checked + .toggle-slider:before {
              transform: translateX(12px);
            }
            .test-case-name {
              font-size: 13px;
              color: #e5e7eb;
            }
            .test-case-status-badge {
              margin-left: auto;
              flex-shrink: 0;
              padding: 2px 8px;
              border-radius: 10px;
              font-size: 11px;
              font-weight: 600;
            }
            .test-case-status-badge.pass {
              background: rgba(16, 185, 129, 0.2);
              color: #10b981;
            }
            .test-case-status-badge.fail {
              background: rgba(239, 68, 68, 0.2);
              color: #ef4444;
            }
            .test-case-status-badge.pending {
              background: rgba(107, 114, 128, 0.2);
              color: #9ca3af;
            }
            .test-case-status-badge.loading {
              background: transparent;
              color: #9ca3af;
            }
            .test-badge {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 10px;
              font-size: 11px;
              font-weight: 600;
              margin-left: 8px;
            }
            .test-badge.pass {
              background: rgba(16, 185, 129, 0.2);
              color: #10b981;
            }
            .test-badge.fail {
              background: rgba(239, 68, 68, 0.2);
              color: #ef4444;
            }
            .test-badge.pending {
              background: rgba(107, 114, 128, 0.2);
              color: #9ca3af;
            }
            .test-badge.loading {
              background: rgba(107, 163, 227, 0.2);
              color: #6ba3e3;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .spinner-wrapper {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              margin-left: auto;
              padding: 0 4px;
            }
            .spinner {
              display: inline-block;
              width: 10px;
              height: 10px;
              border: 2px solid rgba(107, 163, 227, 0.3);
              border-top-color: #6ba3e3;
              border-radius: 50%;
              animation: spin 0.6s linear infinite;
            }
            .chevron {
              display: inline-block;
              width: 0;
              height: 0;
              border-left: 5px solid transparent;
              border-right: 5px solid transparent;
              border-top: 5px solid #e5e7eb;
              margin-right: 4px;
            }
            .chevron.collapsed {
              border-top: none;
              border-left: 5px solid #e5e7eb;
              border-top: 5px solid transparent;
              border-bottom: 5px solid transparent;
            }
            .test-details {
              margin-top: 0;
              padding: 10px;
              background: rgba(0, 0, 0, 0.3);
              border-radius: 0 0 4px 4px;
              font-size: 12px;
              color: #d1d5db;
            }
            .test-details-section {
              margin-bottom: 10px;
            }
            .test-details-section:last-child {
              margin-bottom: 0;
            }
            .test-details-label {
              color: #9ca3af;
              font-weight: 600;
              margin-bottom: 4px;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.5px;
            }
            .test-details-content {
              background: rgba(0, 0, 0, 0.4);
              padding: 8px;
              border-radius: 3px;
              font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
              white-space: pre-wrap;
              word-break: break-word;
              color: #e5e7eb;
            }
            .test-details-content.error {
              color: #f87171;
            }
            .test-details-content.success {
              color: #34d399;
            }
            .test-case-item-wrapper {
              margin-bottom: 6px;
              display: flex;
              align-items: flex-start;
              gap: 8px;
              transition: opacity 0.3s ease;
            }
            .test-case-item-wrapper.disabled {
              opacity: 0.4;
            }
            .test-case-item-wrapper.enabled {
              opacity: 1;
            }
            .test-case-item {
              margin-bottom: 0;
              transition: background-color 0.15s ease;
            }
            .test-case-header {
              cursor: pointer;
              padding: 6px 8px;
              margin: 0;
              border-radius: 4px;
              transition: background-color 0.15s ease;
            }
            .test-case-header:hover {
              background-color: rgba(107, 114, 128, 0.4);
            }
            .test-case-expand-icon {
              font-size: 10px;
              color: #9ca3af;
              margin-right: 4px;
              transition: transform 0.2s ease;
            }
            .test-case-expand-icon.expanded {
              transform: rotate(90deg);
            }
            .header-bar {
              padding: 10px 14px;
              border-bottom: 1px solid #374151;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            }
            .header-left {
              font-size: 14px;
              color: #e5e7eb;
              font-weight: 500;
            }
            .header-right {
              display: flex;
              gap: 16px;
              font-size: 13px;
            }
            .header-link {
              color: #60a5fa;
              cursor: pointer;
              text-decoration: none;
            }
            .header-link:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div class="header-left">${passedTests}/${totalTests} tests passed</div>
            <div class="header-right">
              <span class="header-link" onclick="parent.postMessage({type: 'toggleSelectAll'}, '*')">
                ${allSelected ? 'Deselect All' : 'Select All'}
              </span>
              <span class="header-link" onclick="parent.postMessage({type: 'toggleExpandAll'}, '*')">
                ${allExpanded ? 'Collapse All' : 'Expand All'}
              </span>
            </div>
          </div>
      `;

      testCases.forEach((group) => {
        const isExpanded = expandedGroups.has(group.title);
        const groupTestNames = group.tests.map(t => t.name);
        const allSelected = groupTestNames.every(name => selectedTests.has(name));
        
        // Calculate passed/total for badge
        let passedCount = 0;
        group.tests.forEach(test => {
          const result = testResults.get(test.name);
          if (result && result.status === 'pass') {
            passedCount++;
          }
        });
        const totalCount = group.tests.length;
        const badgeClass = passedCount === totalCount && totalCount > 0 ? 'pass' : 'pending';

        // Split title into main part and API part
        const titleMatch = group.title.match(/^(.+?)\s*(\(.+\))$/);
        const mainTitle = titleMatch ? titleMatch[1] : group.title;
        const apiPart = titleMatch ? titleMatch[2] : '';

        html += `
          <div class="test-group">
            <div class="test-group-header">
              <button onclick="parent.postMessage({type: 'toggleGroup', groupTitle: '${group.title}'}, '*')">
                <span class="chevron ${isExpanded ? '' : 'collapsed'}"></span>
                ${mainTitle} ${apiPart ? `<span class="api-label">${apiPart}</span>` : ''}
                <span class="test-badge ${badgeClass}">${passedCount}/${totalCount} passed</span>
              </button>
              ${isExpanded ? `
                <button class="select-all-btn" onclick="parent.postMessage({type: '${allSelected ? 'deselectAllInGroup' : 'selectAllInGroup'}', groupTitle: '${group.title}'}, '*')">
                  ${allSelected ? 'Deselect All' : 'Select All'}
                </button>
              ` : ''}
            </div>
        `;

        if (isExpanded) {
          html += '<div class="test-group-content">';

          group.tests.forEach((test) => {
            const isSelected = selectedTests.has(test.name);
            const result = testResults.get(test.name);
            const statusClass = getTestStatusClass(test.name);
            const isTestExpanded = expandedTests.has(test.name);
            
            let statusBadge = '';
            const isRunningTest = runningTests.has(test.name);
            
            if (result) {
              const overrideText = result.isOverridden ? ' (OVERRIDDEN)' : '';
              if (result.status === 'pass') {
                statusBadge = `<span class="test-case-status-badge pass">✓ Pass${overrideText}</span>`;
              } else if (result.status === 'fail') {
                statusBadge = `<span class="test-case-status-badge fail">✗ Fail${overrideText}</span>`;
              } else if (result.status === 'error') {
                statusBadge = `<span class="test-case-status-badge fail">⚠ Error${overrideText}</span>`;
              }
            } else if (isRunningTest) {
              statusBadge = '<span class="test-case-status-badge loading"><span class="spinner"></span></span>';
            } else {
              statusBadge = '<span class="test-case-status-badge pending">—</span>';
            }

            // Format JSON for display - one line per key
            const formatJSON = (obj: any) => {
              if (typeof obj === 'object' && obj !== null) {
                if (Array.isArray(obj)) {
                  return JSON.stringify(obj);
                }
                // Format object with one line per key-value pair
                const entries = Object.entries(obj).map(([key, value]) => {
                  return `  "${key}": ${JSON.stringify(value)}`;
                });
                return '{\n' + entries.join(',\n') + '\n}';
              }
              return JSON.stringify(obj);
            };

            // Check if this is a frontend test
            const isFrontendTestCase = !test.endpoint && !test.metadata?.endpoint;
            
            const inputDisplay = isFrontendTestCase ? null : formatJSON(test.metadata?.input || test.input || 'N/A');
            const expectedDisplay = isFrontendTestCase ? null : formatJSON(test.metadata?.expected || test.expected || 'N/A');
            
            let actualDisplay = '';
            let actualClass = '';
            if (result) {
              if (result.status === 'error') {
                actualDisplay = result.message || 'Error occurred';
                actualClass = 'error';
              } else if (isFrontendTestCase) {
                // For frontend tests (including HTML), show the judge explanation
                actualDisplay = result.message || result.actual || 'No output';
                actualClass = result.status === 'pass' ? 'success' : '';
              } else if (result.actual !== undefined) {
                actualDisplay = formatJSON(result.actual);
                actualClass = result.status === 'pass' ? 'success' : '';
              } else {
                actualDisplay = result.message || 'No output';
              }
            } else {
              actualDisplay = 'Not yet executed';
              actualClass = '';
            }

            const sliderClass = result?.status === 'pass' ? 'pass' : (result?.status === 'fail' || result?.status === 'error' ? 'fail' : '');
            
            html += `
              <div class="test-case-item-wrapper ${isSelected ? 'enabled' : 'disabled'}">
                <label class="toggle-switch">
                  <input type="checkbox" ${isSelected ? 'checked' : ''} 
                    onchange="event.stopPropagation(); parent.postMessage({type: 'toggleTest', testName: '${test.name}'}, '*')" />
                  <span class="toggle-slider ${sliderClass}"></span>
                </label>
                <div class="test-case-item ${isSelected ? 'selected' : ''}" style="${statusClass}">
                  <div class="test-case-header" onclick="parent.postMessage({type: 'toggleTestDetails', testName: '${test.name}'}, '*')">
                    <span class="test-case-expand-icon ${isTestExpanded ? 'expanded' : ''}">▶</span>
                    <span class="test-case-name">${test.name}</span>
                    ${statusBadge}
                  </div>
                  ${isTestExpanded ? `
                    <div class="test-details">
                      ${isFrontendTestCase ? `
                        <div class="test-details-section">
                          <div class="test-details-label">Description</div>
                          <div class="test-details-content">${test.description}</div>
                        </div>
                        ${result?.screenshot ? `
                          <div class="test-details-section">
                            <div class="test-details-label">Screenshot Preview</div>
                            <div style="position: relative; display: inline-block; margin-top: 4px;">
                              <img src="${result.screenshot}" 
                                style="max-width: 200px; border: 1px solid #444; border-radius: 4px; display: block; cursor: pointer;" 
                                alt="Screenshot of rendered page" 
                                title="Click to view full resolution"
                                onclick="event.stopPropagation(); parent.postMessage({type: 'openScreenshotModal', screenshot: '${result.screenshot}', testName: '${test.name}'}, '*')" />
                              <button 
                                onclick="event.stopPropagation(); parent.postMessage({type: 'openScreenshotModal', screenshot: '${result.screenshot}', testName: '${test.name}'}, '*')"
                                style="position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.7); border: 1px solid #555; color: white; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 10px; display: flex; align-items: center; gap: 3px;"
                                title="View full resolution"
                                onmouseover="this.style.background='rgba(0,0,0,0.85)'"
                                onmouseout="this.style.background='rgba(0,0,0,0.7)'">
                                ⤢
                              </button>
                            </div>
                          </div>
                        ` : ''}
                        ${result && !result.stepResults ? `
                          <div class="test-details-section">
                            <div class="test-details-label">Judge Result: <span style="color: ${result.status === 'pass' ? '#10b981' : '#ef4444'}; font-weight: 600;">${result.status.toUpperCase()}${result.isOverridden ? ' (OVERRIDDEN)' : ''}</span></div>
                            <div class="test-details-content ${result.status === 'pass' ? 'success' : ''}">${result.message || result.actual || 'No explanation available'}</div>
                          </div>
                        ` : ''}
                        ${result?.stepResults ? `
                          <div class="test-details-section">
                            <div class="test-details-label">Execution: <span style="color: ${result.status === 'pass' ? '#10b981' : '#ef4444'}; font-weight: 600;">${result.status.toUpperCase()}${result.isOverridden ? ' (OVERRIDDEN)' : ''}</span></div>
                            <div style="background: rgba(0, 0, 0, 0.4); padding: 6px; border-radius: 3px; margin-top: 4px; max-height: 120px; overflow-y: auto;">
                              ${result.stepResults.map((stepResult, index) => `
                                <div style="display: flex; align-items: center; gap: 6px; padding: 1px 0; font-size: 12px;">
                                  <span style="color: ${stepResult.success ? '#10b981' : '#ef4444'}; font-weight: 600; min-width: 16px;">
                                    ${stepResult.success ? '✓' : '✗'}
                                  </span>
                                  <span style="color: #e5e7eb; font-family: 'Monaco', 'Menlo', 'Courier New', monospace; font-size: 12px; line-height: 1.4;">
                                    ${stepResult.description || stepResult.action || stepResult.assert || 'Unknown step'}
                                  </span>
                                </div>
                              `).join('')}
                            </div>
                          </div>
                        ` : ''}
                        ${result?.stepResults && result.stepResults.some(step => !step.success && step.error) ? `
                          <div class="test-details-section">
                            <div class="test-details-label">Result:</div>
                            <div class="test-details-content error">${(result.stepResults.find(step => !step.success && step.error)?.error || 'Test failed').trim()}</div>
                          </div>
                        ` : ''}
                          ${result ? `
                            <div class="test-details-section" style="margin-top: 12px;">
                              <div class="test-details-label">Override Decision</div>
                              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                              <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                                <div class="test-details-content" style="flex: 1; min-width: 0; padding: 0 8px; display: flex; align-items: center; height: 30px;">
                                  <input 
                                    type="text" 
                                    placeholder="Reason (minimum 20 characters)"
                                    value="${result.overrideReason || ''}"
                                    ${result.isOverridden ? 'disabled' : ''}
                                    onkeydown="event.stopPropagation();"
                                    onkeyup="event.stopPropagation();"
                                    oninput="(function(){ const input = this; const v = input.value ? input.value.trim().length : 0; const flexContainer = input.parentElement.parentElement; const buttons = flexContainer.querySelectorAll('button'); buttons.forEach(function(btn){ if(btn.id && btn.id.includes('override')){ btn.disabled = v < 20; btn.style.opacity = v < 20 ? '0.5' : '1'; btn.style.cursor = v < 20 ? 'not-allowed' : 'pointer'; } }); }).call(this)"
                                    style="width: 100%; background: transparent; border: none; color: #e5e7eb; padding: 0 8px; font-size: 12px; outline: none; height: 100%; line-height: 1; box-sizing: border-box; ${result.isOverridden ? 'opacity: 0.6;' : ''}"
                                    id="override-reason-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}"
                                  />
                                </div>
                                ${result.isOverridden ? `
                                  <button 
                                    onclick="event.stopPropagation(); parent.postMessage({type: 'revertJudgment', testName: '${test.name}'}, '*')"
                                    style="background: rgba(107, 114, 128, 0.2); border: 1px solid #6b7280; color: #9ca3af; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;"
                                    onmouseover="this.style.background='rgba(107, 114, 128, 0.3)'"
                                    onmouseout="this.style.background='rgba(107, 114, 128, 0.2)'"
                                    title="Revert to original judgment">
                                    ↶ Revert Back
                                  </button>
                                ` : result.status === 'fail' ? `
                                  <button 
                                    id="override-pass-btn-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}"
                                    disabled
                                    onclick="event.stopPropagation(); (function(){ const el = document.getElementById('override-reason-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}'); const reason = el ? el.value : ''; parent.postMessage({type: 'overrideJudgment', testName: '${test.name}', newStatus: 'pass', reason}, '*'); })()"
                                    style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 300; opacity: 0.5; cursor: not-allowed;"
                                    onmouseover="if(!this.disabled){ this.style.background='rgba(16, 185, 129, 0.3)'; }"
                                    onmouseout="if(!this.disabled){ this.style.background='rgba(16, 185, 129, 0.2)'; }"
                                    title="Override this test to pass">
                                    ✓ Override to Pass
                                  </button>
                                ` : result.status === 'pass' ? `
                                  <button 
                                    id="override-fail-btn-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}"
                                    disabled
                                    onclick="event.stopPropagation(); (function(){ const el = document.getElementById('override-reason-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}'); const reason = el ? el.value : ''; parent.postMessage({type: 'overrideJudgment', testName: '${test.name}', newStatus: 'fail', reason}, '*'); })()"
                                    style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 300; opacity: 0.5; cursor: not-allowed;"
                                    onmouseover="if(!this.disabled){ this.style.background='rgba(239, 68, 68, 0.3)'; }"
                                    onmouseout="if(!this.disabled){ this.style.background='rgba(239, 68, 68, 0.2)'; }"
                                    title="Override this test to fail">
                                    ✗ Override to Fail
                                  </button>
                                ` : ''}
                              </div>
                              </div>
                            </div>
                          ` : ''}
                        </div>
                      ` : `
                        <div class="test-details-section">
                          <div class="test-details-label">Description</div>
                          <div class="test-details-content">${test.description}</div>
                        </div>
                        ${result ? `
                        <div class="test-details-section">
                          <div class="test-details-label">Result: <span style="color: ${result?.status === 'pass' ? '#10b981' : result?.status === 'fail' ? '#ef4444' : '#eab308'}; font-weight: 600;">${result?.status?.toUpperCase()}${result?.isOverridden ? ' (OVERRIDDEN)' : ''}</span></div>
                          <div class="test-details-content ${actualClass}">${actualDisplay}</div>
                              <div class="test-details-section" style="margin-top: 12px;">
                                <div class="test-details-label">Override Decision</div>
                                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                              <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
                                <div class="test-details-content" style="flex: 1; min-width: 0; padding: 0 8px; display: flex; align-items: center; height: 30px;">
                                  <input 
                                    type="text" 
                                    placeholder="Reason (minimum 20 characters)"
                                    value="${result.overrideReason || ''}"
                                    ${result.isOverridden ? 'disabled' : ''}
                                    onkeydown="event.stopPropagation();"
                                    onkeyup="event.stopPropagation();"
                                    oninput="(function(){ const input = this; const v = input.value ? input.value.trim().length : 0; const flexContainer = input.parentElement.parentElement; const buttons = flexContainer.querySelectorAll('button'); buttons.forEach(function(btn){ if(btn.id && btn.id.includes('override')){ btn.disabled = v < 20; btn.style.opacity = v < 20 ? '0.5' : '1'; btn.style.cursor = v < 20 ? 'not-allowed' : 'pointer'; } }); }).call(this)"
                                    style="width: 100%; background: transparent; border: none; color: #e5e7eb; padding: 0 8px; font-size: 12px; outline: none; height: 100%; line-height: 1; box-sizing: border-box; ${result.isOverridden ? 'opacity: 0.6;' : ''}"
                                    id="override-reason-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}"
                                  />
                                </div>
                                ${result.isOverridden ? `
                                  <button 
                                    onclick="event.stopPropagation(); parent.postMessage({type: 'revertJudgment', testName: '${test.name}'}, '*')"
                                    style="background: rgba(107, 114, 128, 0.2); border: 1px solid #6b7280; color: #9ca3af; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;"
                                    onmouseover="this.style.background='rgba(107, 114, 128, 0.3)'"
                                    onmouseout="this.style.background='rgba(107, 114, 128, 0.2)'"
                                    title="Revert to original judgment">
                                    ↶ Revert Back
                                  </button>
                                ` : result?.status === 'fail' ? `
                                  <button 
                                    id="override-pass-btn-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}"
                                    disabled
                                    onclick="event.stopPropagation(); (function(){ const el = document.getElementById('override-reason-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}'); const reason = el ? el.value : ''; parent.postMessage({type: 'overrideJudgment', testName: '${test.name}', newStatus: 'pass', reason}, '*'); })()"
                                    style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #10b981; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 300; opacity: 0.5; cursor: not-allowed;"
                                    onmouseover="if(!this.disabled){ this.style.background='rgba(16, 185, 129, 0.3)'; }"
                                    onmouseout="if(!this.disabled){ this.style.background='rgba(16, 185, 129, 0.2)'; }"
                                    title="Override this test to pass">
                                    ✓ Override to Pass
                                  </button>
                                ` : result?.status === 'pass' ? `
                                  <button 
                                    id="override-fail-btn-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}"
                                    disabled
                                    onclick="event.stopPropagation(); (function(){ const el = document.getElementById('override-reason-${test.name.replace(/[^a-zA-Z0-9_-]/g, '_')}'); const reason = el ? el.value : ''; parent.postMessage({type: 'overrideJudgment', testName: '${test.name}', newStatus: 'fail', reason}, '*'); })()"
                                    style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 300; opacity: 0.5; cursor: not-allowed;"
                                    onmouseover="if(!this.disabled){ this.style.background='rgba(239, 68, 68, 0.3)'; }"
                                    onmouseout="if(!this.disabled){ this.style.background='rgba(239, 68, 68, 0.2)'; }"
                                    title="Override this test to fail">
                                    ✗ Override to Fail
                                  </button>
                                ` : ''}
                              </div>
                                </div>
                              </div>
                        ` : ''}
                        </div>
                      `}
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          });

          html += '</div>';
        }

        html += '</div>';
      });

      html += `
          <script>
            // Check and set initial button states for override inputs
            document.addEventListener('DOMContentLoaded', function() {
              const inputs = document.querySelectorAll('input[id^="override-reason-"]');
              inputs.forEach(function(input) {
                const v = input.value ? input.value.trim().length : 0;
                const flexContainer = input.parentElement.parentElement;
                const buttons = flexContainer.querySelectorAll('button');
                buttons.forEach(function(btn) {
                  if (btn.id && btn.id.includes('override')) {
                    btn.disabled = v < 20;
                    btn.style.opacity = v < 20 ? '0.5' : '1';
                    btn.style.cursor = v < 20 ? 'not-allowed' : 'pointer';
                  }
                });
              });
            });
          </script>
        </body>
        </html>
      `;

      return html;
    };

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(generateIframeContent());
      doc.close();
    }
  }, [testCases, expandedGroups, selectedTests, testResults, expandedTests, runningTests]);

  const toggleGroup = (groupTitle: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupTitle)) {
        newSet.delete(groupTitle);
      } else {
        newSet.add(groupTitle);
      }
      return newSet;
    });
  };

  const toggleTestSelection = (testName: string) => {
    setSelectedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testName)) {
        newSet.delete(testName);
      } else {
        newSet.add(testName);
      }
      return newSet;
    });
  };

  const toggleTestDetails = (testName: string) => {
    setExpandedTests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(testName)) {
        newSet.delete(testName);
      } else {
        newSet.add(testName);
      }
      return newSet;
    });
  };

  const selectAllInGroup = (group: TestCaseGroup) => {
    const groupTestNames = group.tests.map(t => t.name);
    setSelectedTests(prev => {
      const newSet = new Set(prev);
      groupTestNames.forEach(name => newSet.add(name));
      return newSet;
    });
  };

  const deselectAllInGroup = (group: TestCaseGroup) => {
    const groupTestNames = new Set(group.tests.map(t => t.name));
    setSelectedTests(prev => {
      const newSet = new Set(prev);
      groupTestNames.forEach(name => newSet.delete(name));
      return newSet;
    });
  };

  const runSelectedTests = async () => {
    if (selectedTests.size === 0) {
      alert('Please select at least one test to run');
      return;
    }

    // Clear previous results for tests that are about to be re-run
    setTestResults(prev => {
      const resultsMap = new Map(prev);
      selectedTests.forEach(testName => {
        resultsMap.delete(testName);
      });
      return resultsMap;
    });

    setIsRunning(true);
    setRunningTests(new Set(selectedTests));
    
    try {
      // Collect all selected test cases IN THE ORDER THEY APPEAR
      const testsToRun: TestCase[] = [];
      
      testCases.forEach(group => {
        group.tests.forEach(test => {
          if (selectedTests.has(test.name)) {
            testsToRun.push(test);
          }
        });
      });
      

      const allResults: TestResult[] = [];

      // Run tests IN ORDER, one at a time
      for (const test of testsToRun) {
        try {
          // Determine test type and execute accordingly
          if (isFrontendInteractiveTest(test)) {
            // Interactive test with steps
            const html = typeof htmlCode === 'function' ? htmlCode() : (htmlCode || '');
            const css = typeof cssCode === 'function' ? cssCode() : (cssCode || '');
            const js = typeof jsCode === 'function' ? jsCode() : (jsCode || '');
            
            
            const result = await executeInteractiveTest(
              test,
              html,
              css,
              js,
              backendPort !== undefined && backendPort !== null ? backendPort : null,
              backendCode
            );
            
            const status: 'pass' | 'fail' = result.success ? 'pass' : 'fail';
            const testResult: TestResult = {
              testName: test.name,
              status,
              message: result.message,
              actual: result.message,
              stepResults: result.stepResults
            };
            
            allResults.push(testResult);
            
            // Update results incrementally so user sees progress - preserve overrides
            setTestResults(prev => {
              const resultsMap = new Map(prev);
              const existingResult = resultsMap.get(test.name);
              // Only update if not overridden
              if (!existingResult || !existingResult.isOverridden) {
                resultsMap.set(test.name, testResult);
              }
              return resultsMap;
            });
            
          } else if (isFrontendTest(test)) {
            // Visual test using LLM judge
            const html = typeof htmlCode === 'function' ? htmlCode() : (htmlCode || '');
            const css = typeof cssCode === 'function' ? cssCode() : (cssCode || '');
            const js = typeof jsCode === 'function' ? jsCode() : (jsCode || '');
            
            // Capture screenshot for this test
            let screenshot: string | null = null;
            if (html) {
              screenshot = await captureHTMLScreenshot(html, css, js, backendPort, backendCode);
            }
            
            // Call LLM judge with screenshot and HTML code
            const judgeResult = await callLLMJudge(test, screenshot, html);
            
            const status: 'pass' | 'fail' = judgeResult.judgment === 'pass' ? 'pass' : 'fail';
            const testResult: TestResult = {
              testName: test.name,
              status,
              message: judgeResult.explanation,
              actual: judgeResult.explanation,
              screenshot: screenshot || undefined
            };
            
            allResults.push(testResult);
            
            // Update results incrementally so user sees progress - preserve overrides
            setTestResults(prev => {
              const resultsMap = new Map(prev);
              const existingResult = resultsMap.get(test.name);
              // Only update if not overridden
              if (!existingResult || !existingResult.isOverridden) {
                resultsMap.set(test.name, testResult);
              }
              return resultsMap;
            });
            
          } else {
            // Backend test with endpoint
            
            try {
              const response = await fetch(ENV.TEST_CASES_ENDPOINT_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  testCases: [test],
                  backendCode: backendCode,
                  port: 5000
                }),
              });

              const data = await response.json();
              
              if (data.results && data.results.length > 0) {
                const result = data.results[0];
                allResults.push(result);
                
                // Update results incrementally - preserve overrides
                setTestResults(prev => {
                  const resultsMap = new Map(prev);
                  const existingResult = resultsMap.get(test.name);
                  // Only update if not overridden
                  if (!existingResult || !existingResult.isOverridden) {
                    resultsMap.set(test.name, result);
                  }
                  return resultsMap;
                });
                
              }
            } catch (error) {
              console.error('Error running backend test:', error);
              const errorResult: TestResult = {
                testName: test.name,
                status: 'error',
                message: 'Failed to execute backend test. Make sure the backend server is running.'
              };
              allResults.push(errorResult);
              
              // Update results - preserve overrides
              setTestResults(prev => {
                const resultsMap = new Map(prev);
                const existingResult = resultsMap.get(test.name);
                // Only update if not overridden
                if (!existingResult || !existingResult.isOverridden) {
                  resultsMap.set(test.name, errorResult);
                }
                return resultsMap;
              });
            }
          }
        } catch (error) {
          console.error(`Error running test "${test.name}":`, error);
          const errorResult: TestResult = {
            testName: test.name,
            status: 'error',
            message: `Failed to execute test: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
          allResults.push(errorResult);
          
          // Update results - preserve overrides
          setTestResults(prev => {
            const resultsMap = new Map(prev);
            const existingResult = resultsMap.get(test.name);
            // Only update if not overridden
            if (!existingResult || !existingResult.isOverridden) {
              resultsMap.set(test.name, errorResult);
            }
            return resultsMap;
          });
        }
      }

      // Final update of all results - preserve any overrides that were made during test execution
      setTestResults(prev => {
        const resultsMap = new Map(prev);
        allResults.forEach((result: TestResult) => {
          // Check if this test was overridden during execution
          const existingResult = resultsMap.get(result.testName);
          if (existingResult && existingResult.isOverridden) {
            // Preserve the override - don't overwrite with new test result
          } else {
            // No override exists, update with new result
            resultsMap.set(result.testName, result);
          }
        });
        return resultsMap;
      });
      
      if (onTestsExecuted) {
        onTestsExecuted(allResults);
      }
      
    } catch (error) {
      console.error('Error running tests:', error);
    } finally {
      setIsRunning(false);
      setRunningTests(new Set());
    }
  };

  const runAllTests = async () => {
    // Select all tests
    const allTestNames = testCases.flatMap(group => group.tests.map(t => t.name));
    setSelectedTests(new Set(allTestNames));
    
    // Wait for state update then run
    setTimeout(() => {
      runSelectedTests();
    }, 100);
  };

  const clearResults = () => {
    setTestResults(new Map());
  };

  const overrideJudgment = (testName: string, newStatus: 'pass' | 'fail', reason: string) => {
    setTestResults(prev => {
      const resultsMap = new Map(prev);
      const existingResult = resultsMap.get(testName);
      
      if (existingResult) {
        // Store original status if not already stored
        const originalStatus = existingResult.originalStatus || existingResult.status;
        
        // Only mark as override if going against the original judgment
        const isGoingAgainstOriginal = newStatus !== originalStatus;
        
        const updatedResult: TestResult = {
          ...existingResult,
          originalStatus: originalStatus,
          status: newStatus,
          isOverridden: isGoingAgainstOriginal,
          overrideReason: reason,
          message: existingResult.message.split('\n\n[Manually')[0] // Remove any existing override message
        };
        resultsMap.set(testName, updatedResult);
      }
      
      return resultsMap;
    });
  };

  const revertJudgment = (testName: string) => {
    setTestResults(prev => {
      const resultsMap = new Map(prev);
      const existingResult = resultsMap.get(testName);
      
      if (existingResult && existingResult.originalStatus) {
        const updatedResult: TestResult = {
          ...existingResult,
          status: existingResult.originalStatus,
          isOverridden: false,
          // Keep the overrideReason so user doesn't have to retype it
          message: existingResult.message.split('\n\n[Manually')[0] // Remove any existing override message
        };
        resultsMap.set(testName, updatedResult);
      }
      
      return resultsMap;
    });
  };

  // no-op stubs removed; inline override will directly call overrideJudgment

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, groupTitle, testName, screenshot, newStatus } = event.data;

      if (type === 'toggleGroup') {
        toggleGroup(groupTitle);
      } else if (type === 'toggleTest') {
        toggleTestSelection(testName);
      } else if (type === 'toggleTestDetails') {
        toggleTestDetails(testName);
      } else if (type === 'selectAllInGroup') {
        const group = testCases.find(g => g.title === groupTitle);
        if (group) {
          selectAllInGroup(group);
        }
      } else if (type === 'deselectAllInGroup') {
        const group = testCases.find(g => g.title === groupTitle);
        if (group) {
          deselectAllInGroup(group);
        }
      } else if (type === 'openScreenshotModal') {
        setModalScreenshot({ screenshot, testName });
      } else if (type === 'overrideJudgment') {
        // inline override expects reason provided in event.data.reason
        const reason = (event.data && typeof event.data.reason === 'string') ? event.data.reason : '';
        const minLength = 20;
        if (!reason || reason.trim().length < minLength) {
          alert(`Please provide a reason with at least ${minLength} characters to override this test result.`);
        } else {
          overrideJudgment(testName, newStatus, reason.trim());
        }
      } else if (type === 'revertJudgment') {
        revertJudgment(testName);
      } else if (type === 'toggleSelectAll') {
        handleToggleSelectAll();
      } else if (type === 'toggleExpandAll') {
        handleToggleExpandAll();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [testCases, selectedTests, expandedGroups, expandedTests]);

  const handleSelectAll = () => {
    const allTestNames = testCases.flatMap(group => group.tests.map(t => t.name));
    setSelectedTests(new Set(allTestNames));
  };

  const handleDeselectAll = () => {
    setSelectedTests(new Set());
  };

  const handleExpandAll = () => {
    const allGroups = new Set(testCases.map(group => group.title));
    setExpandedGroups(allGroups);
  };

  const handleCollapseAll = () => {
    setExpandedGroups(new Set());
  };

  // Calculate passed/total tests
  const totalTests = testCases.flatMap(group => group.tests).length;
  const passedTests = Array.from(testResults.values()).filter(result => result.status === 'pass').length;

  // Check if all tests are selected
  const allTestNames = testCases.flatMap(group => group.tests.map(t => t.name));
  const allSelected = allTestNames.every(name => selectedTests.has(name));

  // Notify parent when all tests have been passed
  useEffect(() => {
    if (onAllTestsPassedChange) {
      const allTestsPassed = totalTests > 0 && passedTests === totalTests;
      onAllTestsPassedChange(allTestsPassed);
    }
  }, [testResults, totalTests, passedTests, onAllTestsPassedChange]);

  // Notify parent when test results change
  useEffect(() => {
    if (onTestResultsChange) {
      const resultsArray = Array.from(testResults.values());
      onTestResultsChange(resultsArray);
    }
  }, [testResults, onTestResultsChange]);

  if (!testCases || testCases.length === 0) {
    return (
      <div className="api-panel-compact">
        <div className="output-section">
          <div className="output-content-container">
            <div className="output-placeholder">
              <span>No test cases available for this task</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if all groups are expanded
  const allGroupTitles = testCases.map(group => group.title);
  const allExpanded = allGroupTitles.every(title => expandedGroups.has(title));

  const handleToggleSelectAll = () => {
    if (allSelected) {
      handleDeselectAll();
    } else {
      handleSelectAll();
    }
  };

  const handleToggleExpandAll = () => {
    if (allExpanded) {
      handleCollapseAll();
    } else {
      handleExpandAll();
    }
  };

  return (
    <div className="test-cases-panel">
      <iframe
        ref={iframeRef}
        className="test-cases-iframe"
        title="Test Cases"
      />
      
      {/* Screenshot Modal */}
      {modalScreenshot && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => setModalScreenshot(null)}
        >
          <div style={{
            position: 'relative',
            maxWidth: '90vw',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'white',
              fontSize: '16px',
              fontWeight: '500'
            }}>
              <span>Full Resolution Screenshot: {modalScreenshot.testName}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setModalScreenshot(null);
                }}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ✕ Close
              </button>
            </div>
            <img 
              src={modalScreenshot.screenshot}
              alt="Full resolution screenshot"
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(90vh - 60px)',
                objectFit: 'contain',
                border: '2px solid #444',
                borderRadius: '4px',
                backgroundColor: 'white'
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <div style={{
              color: '#9ca3af',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              Click outside to close
            </div>
          </div>
        </div>
      )}

      {/* Inline override reason is rendered within each test's details; modal removed */}
    </div>
  );
});

TestCasesPanel.displayName = 'TestCasesPanel';

export default TestCasesPanel;

