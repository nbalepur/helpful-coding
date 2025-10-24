/**
 * Backend Executor - Handles execution of backend code in preview mode
 * Now with real Python subprocess execution and @endpoint decorator support!
 */

import { createMockServer, stopMockServer } from './mock_server';
import { endpointParser } from './endpoint_parser';
import { ENV } from '../config/env';

export class BackendExecutor {
  constructor() {
    this.activeServers = new Map();
    this.nextPort = 5000;
  }

  /**
   * Start a Flask backend server using real Python subprocess
   * @param {string} pythonCode - The Python code to execute (with @endpoint decorators)
   * @param {number} port - Port to run on (optional)
   * @returns {Promise<number>} - The port the server is running on
   */
  async startFlaskServer(pythonCode, port = null) {
    try {
      const serverPort = port || this.getNextAvailablePort();
      
      
      // Check if this is @endpoint decorator code
      const hasEndpointDecorators = pythonCode.includes('@endpoint');
      
      let processedCode = pythonCode;
      if (hasEndpointDecorators) {
        processedCode = await this.processEndpointCode(pythonCode);
      }
      
      // For now, we'll use a hybrid approach:
      // 1. Try to start a real Python subprocess via the backend API
      // 2. Fall back to mock server if that fails
      
      try {
        // Try to start real Python subprocess via backend API
        const realServerPort = await this.startRealPythonServer(processedCode, serverPort);
        return realServerPort;
      } catch (realServerError) {
        
        // Fall back to mock server
        return await this.startMockServer(processedCode, serverPort);
      }
      
    } catch (error) {
      throw new Error(`Backend server failed to start: ${error.message}`);
    }
  }

  /**
   * Process Python code with @endpoint decorators into Flask app
   * @param {string} pythonCode - Python code with @endpoint decorators
   * @returns {string} - Processed Flask app code
   */
  async processEndpointCode(pythonCode) {
    try {
      // Parse the code to extract endpoints
      const validation = endpointParser.validateCode(pythonCode);
      
      if (!validation.isValid) {
        // Still try to process it
      }
      
      if (validation.warnings.length > 0) {
      }
      
      // Generate Flask app from parsed endpoints
      const flaskCode = endpointParser.generateFlaskApp(validation.parsed);
      
      
      return flaskCode;
    } catch (error) {
      // Return original code as fallback
      return pythonCode;
    }
  }

  /**
   * Start a real Python subprocess via backend API
   * @param {string} pythonCode - The Python Flask code to execute
   * @param {number} port - Port to run on
   * @returns {Promise<number>} - The port the server is running on
   */
  async startRealPythonServer(pythonCode, port) {
    try {
      // Call the backend API to start a real Python subprocess
      const response = await fetch(`${ENV.BACKEND_URL}/api/start-python-server`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pythonCode: pythonCode,
          port: port
        })
      });

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      // Store server info
      this.activeServers.set(port, {
        type: 'flask',
        code: pythonCode,
        status: 'running',
        startTime: Date.now(),
        processId: result.processId,
        isRealServer: true
      });

      return port;

    } catch (error) {
      throw error;
    }
  }

  /**
   * Start a mock server (fallback)
   * @param {string} pythonCode - The Python Flask code to execute
   * @param {number} port - Port to run on
   * @returns {Promise<number>} - The port the server is running on
   */
  async startMockServer(pythonCode, port) {
    // Create mock responses based on the Flask code
    const mockResponses = this.createMockResponses(pythonCode);
    
    // Start the mock server
    const mockServer = createMockServer(port, mockResponses);
    await mockServer.start();
    
    // Give the mock server a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Store server info
    this.activeServers.set(port, {
      type: 'flask',
      code: pythonCode,
      status: 'running',
      startTime: Date.now(),
      mockResponses: mockResponses,
      mockServer: mockServer,
      isRealServer: false
    });
    
    // Also store globally for debugging
    if (typeof window !== 'undefined') {
      window.activeBackendServer = {
        port: port,
        mockServer: mockServer,
        mockResponses: mockResponses
      };
    }
    
    return port;
  }

  /**
   * Create mock responses based on the Flask code
   * @param {string} pythonCode - The Python Flask code (or @endpoint code)
   * @returns {Object} - Mock response handlers
   */
  createMockResponses(pythonCode) {
    const responses = {};
    
    // Check if this is @endpoint decorator code
    if (pythonCode.includes('@endpoint')) {
      try {
        const validation = endpointParser.validateCode(pythonCode);
        const { endpoints } = validation.parsed;
        
        endpoints.forEach(endpoint => {
          // Create mock response based on endpoint
          if (endpoint.endpoint === '/') {
            responses['/'] = {
              message: "Welcome to my personal website!",
              status: "Server is running (Preview Mode)",
              features: ["Dynamic content", "Contact form", "API endpoints", "Real-time updates"],
              timestamp: "2024-01-01T12:00:00Z"
            };
          } else if (endpoint.endpoint === '/about') {
            responses['/about'] = {
              name: "Alex Developer",
              bio: "Software developer passionate about creating amazing experiences",
              skills: ["Python", "JavaScript", "React", "Node.js", "Flask"],
              experience_years: 5
            };
          } else if (endpoint.endpoint === '/contact') {
            responses['/contact'] = {
              message: "Thank you for reaching out! (Preview Mode)",
              received: "Form data would be processed here",
              success: true,
              timestamp: "2024-01-01T12:00:00Z"
            };
          } else if (endpoint.endpoint === '/api/status') {
            responses['/api/status'] = {
              status: "healthy",
              version: "1.0.0",
              uptime: "00:05:30",
              endpoints: ["/", "/about", "/contact", "/api/status"]
            };
          }
        });
        
        return responses;
      } catch (error) {
      }
    }
    
    // Fallback: Parse routes from traditional Flask code
    const routeMatches = pythonCode.match(/@app\.route\(['"`]([^'"`]+)['"`]/g);
    if (routeMatches) {
      routeMatches.forEach(match => {
        const route = match.match(/['"`]([^'"`]+)['"`]/)[1];
        
        // Create mock response based on route
        if (route === '/') {
          responses['/'] = {
            message: "Welcome to my personal website!",
            status: "Server is running (Preview Mode)",
            features: ["Dynamic content", "Contact form", "API endpoints"]
          };
        } else if (route === '/about') {
          responses['/about'] = {
            name: "Your Name",
            bio: "Software developer passionate about creating amazing experiences",
            skills: ["Python", "JavaScript", "React", "Node.js"]
          };
        } else if (route === '/contact') {
          responses['/contact'] = {
            message: "Thank you for reaching out! (Preview Mode)",
            received: "Form data would be processed here"
          };
        }
      });
    }
    
    return responses;
  }

  /**
   * Stop a backend server
   * @param {number} port - Port of the server to stop
   */
  async stopServer(port) {
    const server = this.activeServers.get(port);
    if (server) {
      
      if (server.isRealServer) {
        // Stop real Python server via backend API
        try {
          const response = await fetch(`${ENV.BACKEND_URL}/api/stop-python-server`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ port: port })
          });
          
          if (response.ok) {
          } else {
          }
        } catch (error) {
        }
      } else {
        // Stop the mock server
        if (server.mockServer) {
          server.mockServer.stop();
        }
      }
      
      this.activeServers.delete(port);
    }
  }

  /**
   * Stop all active servers
   */
  async stopAllServers() {
    const ports = Array.from(this.activeServers.keys());
    await Promise.all(ports.map(port => this.stopServer(port)));
    
    // Also stop the global mock server
    stopMockServer();
  }

  /**
   * Get the next available port
   * @returns {number} - Next available port
   */
  getNextAvailablePort() {
    while (this.activeServers.has(this.nextPort)) {
      this.nextPort++;
    }
    return this.nextPort++;
  }

  /**
   * Check if a server is running on a port
   * @param {number} port - Port to check
   * @returns {boolean} - Whether a server is running
   */
  isServerRunning(port) {
    return this.activeServers.has(port);
  }

  /**
   * Get all active servers
   * @returns {Array} - List of active servers
   */
  getActiveServers() {
    return Array.from(this.activeServers.entries()).map(([port, server]) => ({
      port,
      ...server
    }));
  }

  /**
   * Validate Python Flask code (including @endpoint decorator code)
   * @param {string} code - Python code to validate
   * @returns {Object} - Validation result
   */
  validateFlaskCode(code) {
    const errors = [];
    const warnings = [];

    // Check if this is @endpoint decorator code
    if (code.includes('@endpoint')) {
      try {
        const validation = endpointParser.validateCode(code);
        return validation;
      } catch (error) {
        // Fall through to traditional validation
      }
    }

    // Traditional Flask validation
    // Check for required imports
    if (!code.includes('from flask import') && !code.includes('import flask')) {
      errors.push('Missing Flask import');
    }

    if (!code.includes('app = Flask')) {
      errors.push('Missing Flask app initialization');
    }

    // Check for common issues
    if (!code.includes('@app.route')) {
      warnings.push('No routes defined');
    }

    if (!code.includes('app.run')) {
      warnings.push('No app.run() call found');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Create a singleton instance
export const backendExecutor = new BackendExecutor();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    backendExecutor.stopAllServers();
  });
}
