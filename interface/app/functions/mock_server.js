/**
 * Mock Server - Provides mock responses for preview mode
 * This simulates a real backend server for preview purposes
 */

export class MockServer {
  constructor(port, mockResponses = {}) {
    this.port = port;
    this.mockResponses = mockResponses;
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    
    // Override fetch for this specific port
    this.interceptFetch();
    
    // Also set up a global reference so we can debug
    window.mockServer = this;
    
    return Promise.resolve(this.port);
  }

  stop() {
    this.isRunning = false;
  }

    interceptFetch() {
      // Store original fetch
      if (!window.originalFetch) {
        window.originalFetch = window.fetch;
      }

      // Override fetch to intercept requests to our mock server
      window.fetch = (url, options = {}) => {
        try {
          const urlObj = new URL(url, window.location.origin);
          
          // Check if this is a request to our mock server
          const isLocalhostRequest = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
          const isCorrectPort = urlObj.port === this.port.toString() || 
                               (urlObj.port === '' && this.port === 80);
          
          if (isLocalhostRequest && isCorrectPort) {
            return this.handleMockRequest(urlObj.pathname, options);
          } else {
          }
        } catch (error) {
        }
        
        // For all other requests, use original fetch
        return window.originalFetch(url, options);
      };
    }

  async handleMockRequest(pathname, options) {
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Get mock response for this endpoint
    const response = this.mockResponses[pathname] || this.getDefaultResponse(pathname);
    
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }),
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response))
    };
  }

  getDefaultResponse(pathname) {
    return {
      message: `Mock response for ${pathname}`,
      status: 'simulated',
      path: pathname,
      timestamp: new Date().toISOString()
    };
  }

  setMockResponse(pathname, response) {
    this.mockResponses[pathname] = response;
  }

  getMockResponses() {
    return this.mockResponses;
  }
}

// Global mock server instance
let globalMockServer = null;

export function createMockServer(port, mockResponses) {
  if (globalMockServer) {
    globalMockServer.stop();
  }
  
  globalMockServer = new MockServer(port, mockResponses);
  return globalMockServer;
}

export function getMockServer() {
  return globalMockServer;
}

export function stopMockServer() {
  if (globalMockServer) {
    globalMockServer.stop();
    globalMockServer = null;
  }
  
  // Restore original fetch
  if (window.originalFetch) {
    window.fetch = window.originalFetch;
    delete window.originalFetch;
  }
}
