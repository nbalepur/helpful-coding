/**
 * Interactive Test Runner for frontend_interactive test cases
 * Executes test steps (actions and assertions) in an iframe
 */

import { ENV } from '../config/env';

// Global configuration for test execution
export const DEFAULT_WAIT_DURATION = 500; // Default wait duration in milliseconds

interface MockConfig {
  endpoint: string;
  method?: string;
  response?: any;
  sequence?: any[];
  delay?: number;
}

interface TestStep {
  action?: string;
  assert?: string;
  selector?: string;
  value?: string;
  text?: string; // For 'set' action to set element text
  duration?: number;
  expected?: any;
  attribute?: string;
  property?: string;
  description?: string;
}

interface TestCase {
  title: string;
  name: string;
  description: string;
  type?: string;
  setup?: {
    mocks?: MockConfig[];
    localStorage?: Record<string, any>;
    cookies?: Record<string, any>;
  };
  steps?: TestStep[];
}

interface TestResult {
  success: boolean;
  message: string;
  failedStep?: TestStep;
  stepIndex?: number;
  stepResults?: Array<{
    success: boolean;
    description?: string;
    action?: string;
    assert?: string;
    error?: string;
  }>;
}

/**
 * Execute a frontend_interactive test case
 */
export async function executeInteractiveTest(
  testCase: TestCase,
  htmlCode: string,
  cssCode: string,
  jsCode: string,
  backendPort: number | null,
  backendCode: string
): Promise<TestResult> {
  let iframe: HTMLIFrameElement | null = null;
  
  try {
    if (!testCase.steps || testCase.steps.length === 0) {
      throw new Error('No test steps defined');
    }
    
    // Create iframe for test execution
    iframe = createTestIframe();
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Could not access iframe document');
    }
    
    // Set up mocks in the iframe
    const mockState = setupMocks(iframeDoc, testCase.setup?.mocks || []);
    
    // Build and inject the HTML document
    const fullHtml = buildTestDocument(htmlCode, cssCode, jsCode, backendPort, backendCode, mockState);
    iframeDoc.open();
    iframeDoc.write(fullHtml);
    iframeDoc.close();
    
    // Wait for initial load
    await waitForIframeLoad(iframe);
    await new Promise(resolve => setTimeout(resolve, DEFAULT_WAIT_DURATION)); // Wait for JS initialization
    
    // Execute test steps and collect results
    const stepResults: Array<{
      success: boolean;
      description?: string;
      action?: string;
      assert?: string;
      error?: string;
    }> = [];
    
    for (let i = 0; i < testCase.steps.length; i++) {
      const step = testCase.steps[i];
      
      try {
        if (step.action) {
          await executeAction(iframeDoc, step);
        } else if (step.assert) {
          await executeAssertion(iframeDoc, step);
        }
        
        // Step succeeded
        stepResults.push({
          success: true,
          description: step.description,
          action: step.action,
          assert: step.assert
        });
      } catch (error) {
        // Step failed
        const errorMessage = error instanceof Error ? error.message : String(error);
        stepResults.push({
          success: false,
          description: step.description,
          action: step.action,
          assert: step.assert,
          error: errorMessage
        });
        
        return {
          success: false,
          message: `Step ${i + 1} failed: ${errorMessage}`,
          failedStep: step,
          stepIndex: i,
          stepResults
        };
      }
    }
    
    return {
      success: true,
      message: 'All test steps passed successfully',
      stepResults
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Test execution error: ${error instanceof Error ? error.message : String(error)}`
    };
  } finally {
    // Cleanup
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}

/**
 * Create a hidden iframe for test execution
 * The iframe is positioned off-screen but fully rendered to ensure proper DOM behavior
 */
function createTestIframe(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px'; // Off-screen but still rendered
  iframe.style.top = '0';
  iframe.style.width = '1024px';
  iframe.style.height = '768px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden'; // Additional hiding for security
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-same-origin');
  iframe.setAttribute('data-test-iframe', 'true'); // Mark for debugging
  return iframe;
}

/**
 * Wait for iframe to load
 */
function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    if (iframe.contentDocument?.readyState === 'complete') {
      resolve();
    } else {
      iframe.addEventListener('load', () => resolve(), { once: true });
    }
  });
}

/**
 * Set up API mocks and return the mock state to inject
 * NOTE: Mocks are now deprecated in favor of using student's real backend code
 */
function setupMocks(iframeDoc: Document, mocks: MockConfig[]): {
  mocks: Record<string, any>;
  sequences: Record<string, { responses: any[]; currentIndex: number }>;
} {
  // Return empty mock state - we'll use real backend instead
  return {
    mocks: {},
    sequences: {}
  };
}

/**
 * Build the complete HTML document with real backend integration
 */
function buildTestDocument(
  htmlCode: string,
  cssCode: string,
  jsCode: string,
  backendPort: number | null,
  backendCode: string,
  mockState: { mocks: Record<string, any>; sequences: Record<string, any> }
): string {
  // Create the real callAPI function (same as PreviewIframe.tsx)
  const realCallAPIScript = `
    <script>
      // Real callAPI function that executes student's backend code
      window.callAPI = function(endpoint, args = {}) {
        
        const xhr = new XMLHttpRequest();
        const url = '${ENV.EXECUTE_ENDPOINT_URL}';
        
        xhr.open('POST', url, false); // false = synchronous for simplicity
        xhr.setRequestHeader('Content-Type', 'application/json');
        
        const requestData = {
          endpoint: endpoint,
          args: args,
          pythonCode: \`${backendCode.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`
        };
        
        try {
          xhr.send(JSON.stringify(requestData));
          
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            
            // Return consistent format with success, data, and error fields
            if (data.error) {
              return { success: false, data: null, error: data.error };
            }
            return { success: true, data: data.result, error: null };
          } else {
            // Try to get detailed error from response body
            let errorMsg = \`HTTP \${xhr.status}: \${xhr.statusText}\`;
            try {
              const errorData = JSON.parse(xhr.responseText);
              if (errorData.error) {
                errorMsg = errorData.error;
              }
            } catch (e) {
              // If parsing fails, use the default error message
            }
            return { success: false, data: null, error: errorMsg };
          }
        } catch (error) {
          const errorMsg = 'Backend server not available: ' + error.message;
          return { success: false, data: null, error: errorMsg };
        }
      };
      
      // Provide showError helper if not defined
      if (typeof showError === 'undefined') {
        window.showError = function(message) {
        };
      }
    </script>
  `;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Test Execution</title>
      <style>${cssCode}</style>
    </head>
    <body>
      ${htmlCode}
      ${realCallAPIScript}
      <script>${jsCode}</script>
    </body>
    </html>
  `;
}

/**
 * Execute an action step
 */
async function executeAction(iframeDoc: Document, step: TestStep): Promise<void> {
  switch (step.action) {
    case 'click':
      await executeClick(iframeDoc, step.selector!);
      break;
    case 'input':
      await executeInput(iframeDoc, step.selector!, step.value!);
      break;
    case 'set':
      await executeSet(iframeDoc, step.selector!, step.text!);
      break;
    case 'wait':
      await executeWait(step.duration!);
      break;
    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

/**
 * Execute a click action
 */
async function executeClick(iframeDoc: Document, selector: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  // Use iframe's HTMLElement for instanceof check to avoid cross-document context issues
  const iframeWindow = iframeDoc.defaultView;
  if (!iframeWindow) {
    throw new Error(`Could not access iframe window for element: ${selector}`);
  }
  
  if (element instanceof iframeWindow.HTMLElement) {
    element.click();
  } else {
    throw new Error(`Element is not clickable: ${selector}`);
  }
}

/**
 * Execute an input action
 */
async function executeInput(iframeDoc: Document, selector: string, value: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  // Use iframe's constructors for instanceof checks
  const iframeWindow = iframeDoc.defaultView;
  if (!iframeWindow) {
    throw new Error(`Could not access iframe window for element: ${selector}`);
  }
  
  if (element instanceof iframeWindow.HTMLInputElement || element instanceof iframeWindow.HTMLTextAreaElement) {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    throw new Error(`Element is not an input: ${selector}`);
  }
}

/**
 * Execute a set action (directly set element text content)
 * Useful for setting up specific board states in tests
 */
async function executeSet(iframeDoc: Document, selector: string, text: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  element.textContent = text;
}

/**
 * Execute a wait action
 */
async function executeWait(duration: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, duration));
}

/**
 * Execute an assertion step
 */
async function executeAssertion(iframeDoc: Document, step: TestStep): Promise<void> {
  switch (step.assert) {
    case 'elementText':
      await assertElementText(iframeDoc, step.selector!, step.expected);
      break;
    case 'elementTextContains':
      await assertElementTextContains(iframeDoc, step.selector!, step.expected);
      break;
    case 'elementVisible':
      await assertElementVisible(iframeDoc, step.selector!, step.expected);
      break;
    case 'elementExists':
      await assertElementExists(iframeDoc, step.selector!, step.expected);
      break;
    case 'elementAttribute':
      await assertElementAttribute(iframeDoc, step.selector!, step.attribute!, step.expected);
      break;
    case 'elementValue':
      await assertElementValue(iframeDoc, step.selector!, step.expected);
      break;
    case 'elementCount':
      await assertElementCount(iframeDoc, step.selector!, step.expected);
      break;
    case 'elementCSS':
      await assertElementCSS(iframeDoc, step.selector!, step.property!, step.expected);
      break;
    default:
      throw new Error(`Unknown assertion: ${step.assert}`);
  }
}

/**
 * Assert element text matches exactly
 */
async function assertElementText(iframeDoc: Document, selector: string, expected: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const actual = element.textContent?.trim() || '';
  if (actual !== expected) {
    throw new Error(`Element ${selector}: Expected textContent to be "${expected}" but got "${actual}"`);
  }
}

/**
 * Assert element text contains substring (case insensitive)
 */
async function assertElementTextContains(iframeDoc: Document, selector: string, expected: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const actual = (element.textContent || '').toLowerCase();
  const expectedLower = expected.toLowerCase();
  if (!actual.includes(expectedLower)) {
    throw new Error(`Element ${selector}: Expected textContent to contain "${expected}" but got "${element.textContent}"`);
  }
}

/**
 * Assert element visibility
 */
async function assertElementVisible(iframeDoc: Document, selector: string, expected: boolean): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const iframeWindow = iframeDoc.defaultView;
  if (!iframeWindow) {
    throw new Error(`Could not access iframe window for element: ${selector}`);
  }
  
  if (!(element instanceof iframeWindow.HTMLElement)) {
    throw new Error(`Element is not an HTMLElement: ${selector}`);
  }
  
  const isVisible = element.offsetParent !== null && 
                    iframeWindow.getComputedStyle(element).display !== 'none' &&
                    iframeWindow.getComputedStyle(element).visibility !== 'hidden';
  
  if (isVisible !== expected) {
    throw new Error(`Element ${selector}: Expected to be ${expected ? 'visible' : 'hidden'} but it was ${isVisible ? 'visible' : 'hidden'}`);
  }
}

/**
 * Assert element exists in DOM
 */
async function assertElementExists(iframeDoc: Document, selector: string, expected: boolean): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  const exists = element !== null;
  
  if (exists !== expected) {
    throw new Error(`Element ${selector}: Expected ${expected ? 'to exist' : 'not to exist'} but it ${exists ? 'exists' : 'does not exist'}`);
  }
}

/**
 * Assert element attribute value
 */
async function assertElementAttribute(iframeDoc: Document, selector: string, attribute: string, expected: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const actual = element.getAttribute(attribute);
  if (actual !== expected) {
    throw new Error(`Element ${selector}: Expected attribute "${attribute}" to be "${expected}" but got "${actual}" (reading from getAttribute())`);
  }
}

/**
 * Assert input element value
 */
async function assertElementValue(iframeDoc: Document, selector: string, expected: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const iframeWindow = iframeDoc.defaultView;
  if (!iframeWindow) {
    throw new Error(`Could not access iframe window for element: ${selector}`);
  }
  
  if (element instanceof iframeWindow.HTMLInputElement || element instanceof iframeWindow.HTMLTextAreaElement) {
    const actual = element.value;
    if (actual !== expected) {
      throw new Error(`Element ${selector}: Expected value property to be "${expected}" but got "${actual}"`);
    }
  } else {
    throw new Error(`Element is not an input: ${selector}`);
  }
}

/**
 * Assert element count
 */
async function assertElementCount(iframeDoc: Document, selector: string, expected: number): Promise<void> {
  const elements = iframeDoc.querySelectorAll(selector);
  const actual = elements.length;
  
  if (actual !== expected) {
    throw new Error(`Selector ${selector}: Expected ${expected} elements but found ${actual}`);
  }
}

/**
 * Assert element CSS property value
 */
async function assertElementCSS(iframeDoc: Document, selector: string, property: string, expected: string): Promise<void> {
  const element = iframeDoc.querySelector(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  
  const iframeWindow = iframeDoc.defaultView;
  if (!iframeWindow) {
    throw new Error(`Could not access iframe window for element: ${selector}`);
  }
  
  if (!(element instanceof iframeWindow.HTMLElement)) {
    throw new Error(`Element is not an HTMLElement: ${selector}`);
  }
  
  const actual = iframeWindow.getComputedStyle(element).getPropertyValue(property);
  if (actual !== expected) {
    throw new Error(`Element ${selector}: Expected CSS property "${property}" to be "${expected}" but got "${actual}" (reading from getComputedStyle())`);
  }
}

