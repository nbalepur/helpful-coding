/**
 * Endpoint Parser - Parses Python code with @endpoint decorators
 * and creates Flask routes dynamically
 */

export class EndpointParser {
  constructor() {
    this.endpointRegex = /@endpoint\(['"`]([^'"`]+)['"`]\)\s*(?:@app\.route\(['"`][^'"`]+['"`]\))?\s*def\s+(\w+)/g;
    this.methodRegex = /@endpoint\(['"`]([^'"`]+)['"`],\s*methods=\[['"`]([^'"`]+)['"`]\]\)/g;
  }

  /**
   * Parse function parameters from parameter string
   * @param {string} paramString - Parameter string from function definition
   * @returns {Array} - Array of parameter objects
   */
  parseParameters(paramString) {
    if (!paramString || paramString.trim() === '') {
      return [];
    }

    const params = [];
    const paramList = paramString.split(',').map(p => p.trim());
    
    for (const param of paramList) {
      if (param === '') continue;
      
      // Handle different parameter types
      if (param.includes('=')) {
        // Default parameter: param=value
        const [name, defaultValue] = param.split('=').map(p => p.trim());
        params.push({
          name: name,
          type: 'default',
          defaultValue: defaultValue,
          required: false
        });
      } else if (param.startsWith('*')) {
        // *args or **kwargs
        if (param.startsWith('**')) {
          params.push({
            name: param.substring(2),
            type: 'kwargs',
            required: false
          });
        } else {
          params.push({
            name: param.substring(1),
            type: 'args',
            required: false
          });
        }
      } else {
        // Regular parameter
        params.push({
          name: param,
          type: 'regular',
          required: true
        });
      }
    }
    
    return params;
  }

  /**
   * Parse Python code to extract endpoint definitions
   * @param {string} pythonCode - Python code with @endpoint decorators
   * @returns {Object} - Parsed endpoints and helper functions
   */
  parseCode(pythonCode) {
    const endpoints = [];
    const helperFunctions = [];
    const lines = pythonCode.split('\n');
    
    let currentFunction = null;
    let currentEndpoint = null;
    let currentMethods = ['GET'];
    let currentParameters = [];
    let functionBody = [];
    let inFunction = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check for @endpoint decorator with methods
      const endpointWithMethodsMatch = line.match(/@endpoint\(['"`]([^'"`]+)['"`],\s*methods=\[['"`]([^'"`]+)['"`]\]\)/);
      if (endpointWithMethodsMatch) {
        currentEndpoint = endpointWithMethodsMatch[1];
        currentMethods = [endpointWithMethodsMatch[2]];
        continue;
      }
      
      // Check for @endpoint decorator without methods
      const endpointMatch = line.match(/@endpoint\(['"`]([^'"`]+)['"`]\)/);
      if (endpointMatch) {
        currentEndpoint = endpointMatch[1];
        currentMethods = ['GET'];
        continue;
      }
      
      // Check for function definition
      const funcMatch = line.match(/^def\s+(\w+)\s*\(([^)]*)\)/);
      if (funcMatch) {
        // Save previous function if it exists
        if (currentFunction && functionBody.length > 0) {
          if (currentEndpoint) {
            endpoints.push({
              name: currentFunction,
              endpoint: currentEndpoint,
              methods: currentMethods,
              body: functionBody.join('\n'),
              parameters: currentParameters
            });
          } else {
            helperFunctions.push({
              name: currentFunction,
              body: functionBody.join('\n'),
              parameters: currentParameters
            });
          }
        }
        
        // Start new function
        currentFunction = funcMatch[1];
        const paramString = funcMatch[2].trim();
        currentParameters = parseParameters(paramString);
        functionBody = [line];
        inFunction = true;
        continue;
      }
      
      // If we're in a function, collect the body
      if (inFunction) {
        functionBody.push(line);
        
        // Check if function ends (next function or end of indentation)
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextIndent = nextLine.match(/^(\s*)/)[1].length;
          const currentIndent = line.match(/^(\s*)/)[1].length;
          
          if (nextIndent <= currentIndent && nextLine.trim() !== '') {
            inFunction = false;
          }
        }
      }
    }
    
    // Don't forget the last function
    if (currentFunction && functionBody.length > 0) {
      if (currentEndpoint) {
        endpoints.push({
          name: currentFunction,
          endpoint: currentEndpoint,
          methods: currentMethods,
          body: functionBody.join('\n'),
          parameters: currentParameters
        });
      } else {
        helperFunctions.push({
          name: currentFunction,
          body: functionBody.join('\n'),
          parameters: currentParameters
        });
      }
    }
    
    return { endpoints, helperFunctions };
  }

  /**
   * Generate Flask app code from parsed endpoints
   * @param {Object} parsed - Parsed endpoints and helper functions
   * @returns {string} - Complete Flask app code
   */
  generateFlaskApp(parsed) {
    const { endpoints, helperFunctions } = parsed;
    
    let flaskCode = `
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Helper functions
`;

    // Add helper functions first
    helperFunctions.forEach(func => {
      flaskCode += `\n${func.body}\n`;
    });

    // Add endpoint routes
    endpoints.forEach(endpoint => {
      flaskCode += `\n@app.route('${endpoint.endpoint}')\n`;
      flaskCode += `def ${endpoint.name}():\n`;
      
      // Indent the function body
      const bodyLines = endpoint.body.split('\n');
      const funcStartIndex = bodyLines.findIndex(line => line.trim().startsWith('def '));
      if (funcStartIndex !== -1) {
        const functionBodyLines = bodyLines.slice(funcStartIndex + 1);
        functionBodyLines.forEach(line => {
          flaskCode += `    ${line}\n`;
        });
      }
    });

    flaskCode += `
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
`;

    return flaskCode;
  }

  /**
   * Validate Python code for endpoint decorators
   * @param {string} pythonCode - Python code to validate
   * @returns {Object} - Validation result
   */
  validateCode(pythonCode) {
    const errors = [];
    const warnings = [];
    const parsed = this.parseCode(pythonCode);
    
    if (parsed.endpoints.length === 0) {
      warnings.push('No @endpoint decorators found');
    }
    
    // Check for common issues
    const endpointNames = new Set();
    parsed.endpoints.forEach(endpoint => {
      if (endpointNames.has(endpoint.name)) {
        errors.push(`Duplicate function name: ${endpoint.name}`);
      }
      endpointNames.add(endpoint.name);
      
      if (!endpoint.endpoint.startsWith('/')) {
        errors.push(`Endpoint "${endpoint.endpoint}" should start with "/"`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      parsed
    };
  }
}

// Create a singleton instance
export const endpointParser = new EndpointParser();