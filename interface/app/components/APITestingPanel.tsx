"use client";
import React, { useState, useEffect } from 'react';
import { BsCode, BsXCircle } from 'react-icons/bs';
import { ENV } from '../config/env';

// React-themed JSON syntax highlighting function
const highlightReactJSON = (text: string) => {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(text);
    const formatted = JSON.stringify(parsed, null, 2);
    
    // Apply React-themed syntax highlighting
    return formatted
      .replace(/(".*?")\s*:/g, '<span style="color: #61dafb;">$1</span>:') // Keys in React blue
      .replace(/:\s*(".*?")/g, ': <span style="color: #98c379;">$1</span>') // String values in React green
      .replace(/:\s*(true|false|null)/g, ': <span style="color: #d19a66;">$1</span>') // Booleans/null in React orange
      .replace(/:\s*(\d+\.?\d*)/g, ': <span style="color: #d19a66;">$1</span>') // Numbers in React orange
      .replace(/([{}[\]])/g, '<span style="color: #e06c75;">$1</span>'); // Brackets in React red
  } catch {
    // If not valid JSON, return original text
    return text;
  }
};

// Types for API testing
interface ParameterInfo {
  name: string;
  type: 'regular' | 'default' | 'args' | 'kwargs';
  defaultValue?: string;
  required: boolean;
}

interface EndpointInfo {
  name: string;
  endpoint: string;
  methods: string[];
  body: string;
  parameters: ParameterInfo[];
}

// Helper function to parse backend routes using Python backend
async function parseBackendEndpoints(backendCode: string): Promise<{endpoints: EndpointInfo[], error?: string}> {
  try {
    const response = await fetch(ENV.EXECUTE_ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pythonCode: backendCode,
        endpoint: "", // Empty endpoint means just get the list of endpoints
        args: {}
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { endpoints: data.endpoints || [] };
    } else {
      return { endpoints: [], error: data.error || 'Failed to parse endpoints' };
    }
  } catch (error) {
    console.error('Error parsing endpoints:', error);
    return { endpoints: [], error: error instanceof Error ? error.message : 'Unknown error occurred' };
  }
}

interface APITestingPanelProps {
  backendCode: string;
  getCurrentBackendCode?: () => string;
  onEndpointsChanged?: (endpoints: EndpointInfo[]) => void;
  shouldRefresh?: boolean;
  onRefreshComplete?: () => void;
  selectedEndpoint?: EndpointInfo | null;
  onEndpointSelect?: (endpoint: EndpointInfo | null) => void;
}

const APITestingPanel: React.FC<APITestingPanelProps> = ({ backendCode, getCurrentBackendCode, onEndpointsChanged, shouldRefresh, onRefreshComplete, selectedEndpoint, onEndpointSelect }) => {
  const [endpoints, setEndpoints] = useState<EndpointInfo[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string>('');
  const [previousParameters, setPreviousParameters] = useState<ParameterInfo[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  
  // State for draggable split
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(33.3); // Default 33.3% left, 66.7% right
  const [isDragging, setIsDragging] = useState(false);

  // Drag handlers for resizing panels
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const container = document.querySelector('.api-panel-layout') as HTMLElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const mouseX = e.clientX - containerRect.left;
    const containerWidth = containerRect.width;
    const newLeftWidth = (mouseX / containerWidth) * 100;
    
    // Constrain between 25% and 75%
    const constrainedWidth = Math.max(25, Math.min(75, newLeftWidth));
    setLeftPanelWidth(constrainedWidth);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add global mouse event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  // Helper function to compare parameters
  const parametersChanged = (oldParams: ParameterInfo[], newParams: ParameterInfo[]): boolean => {
    if (oldParams.length !== newParams.length) return true;
    
    return oldParams.some((oldParam, index) => {
      const newParam = newParams[index];
      return !newParam || 
             oldParam.name !== newParam.name ||
             oldParam.type !== newParam.type ||
             oldParam.required !== newParam.required ||
             oldParam.defaultValue !== newParam.defaultValue;
    });
  };

  // Parse endpoints from backend code (only on initial load or when backendCode changes)
  useEffect(() => {
    const loadEndpoints = async () => {
      
      // Use current backend code if available, otherwise fall back to prop
      const currentCode = getCurrentBackendCode ? getCurrentBackendCode() : backendCode;
      
      if (!currentCode.trim()) {
        setEndpoints([]);
        setParseError('');
        if (onEndpointSelect) {
          onEndpointSelect(null);
        }
        setPreviousParameters([]);
        setIsInitializing(false);
        return;
      }
      
      const result = await parseBackendEndpoints(currentCode);
      setEndpoints(result.endpoints);
      setParseError(result.error || '');
      
      // Update selected endpoint logic
      if (result.endpoints.length > 0) {
        if (selectedEndpoint) {
          // Try to find the currently selected endpoint in the new list
          const updatedSelectedEndpoint = result.endpoints.find(ep => ep.endpoint === selectedEndpoint.endpoint);
          if (updatedSelectedEndpoint) {
            // Check if parameters have changed
            const currentParams = updatedSelectedEndpoint.parameters || [];
            const paramsChanged = parametersChanged(previousParameters, currentParams);
            
            // Update the selected endpoint with new data
            if (onEndpointSelect) {
              onEndpointSelect(updatedSelectedEndpoint);
            }
            
            // Only clear inputs and output if parameters have changed
            if (paramsChanged) {
              setInputs({});
              setOutput('');
            }
            
            // Update previous parameters for next comparison
            setPreviousParameters(currentParams);
          } else {
            // Selected endpoint no longer exists, select the first one
            if (onEndpointSelect) {
              onEndpointSelect(result.endpoints[0]);
            }
            // Clear inputs and output when switching endpoints
            setInputs({});
            setOutput('');
            setPreviousParameters(result.endpoints[0].parameters || []);
          }
        } else {
          // No endpoint selected, select the first one
          if (onEndpointSelect) {
            onEndpointSelect(result.endpoints[0]);
          }
          setPreviousParameters(result.endpoints[0].parameters || []);
        }
      } else {
        if (onEndpointSelect) {
          onEndpointSelect(null);
        }
        setPreviousParameters([]);
      }
      
      setIsInitializing(false);
    };
    
    loadEndpoints();
  }, [backendCode]); // Removed selectedEndpoint dependency to avoid infinite loops

  // Manual refresh function for parsing endpoints
  const refreshEndpoints = async () => {
    if (!getCurrentBackendCode) return;
    
    const currentCode = getCurrentBackendCode();
    if (!currentCode.trim()) {
      setEndpoints([]);
      setParseError('');
      if (onEndpointSelect) {
        onEndpointSelect(null);
      }
      setPreviousParameters([]);
      setIsInitializing(false);
      return;
    }
    
    setLoading(true);
    setIsInitializing(true);
    try {
      const result = await parseBackendEndpoints(currentCode);
      setEndpoints(result.endpoints);
      setParseError(result.error || '');
      
      // Update selected endpoint logic
      if (result.endpoints.length > 0) {
        if (selectedEndpoint) {
          // Try to find the currently selected endpoint in the new list
          const updatedSelectedEndpoint = result.endpoints.find(ep => ep.endpoint === selectedEndpoint.endpoint);
          if (updatedSelectedEndpoint) {
            // Check if parameters have changed
            const currentParams = updatedSelectedEndpoint.parameters || [];
            const paramsChanged = parametersChanged(previousParameters, currentParams);
            
            // Update the selected endpoint with new data
            if (onEndpointSelect) {
              onEndpointSelect(updatedSelectedEndpoint);
            }
            
            // Only clear inputs and output if parameters have changed
            if (paramsChanged) {
              setInputs({});
              setOutput('');
            }
            
            // Update previous parameters for next comparison
            setPreviousParameters(currentParams);
          } else {
            // Selected endpoint no longer exists, select the first one
            if (onEndpointSelect) {
              onEndpointSelect(result.endpoints[0]);
            }
            // Clear inputs and output when switching endpoints
            setInputs({});
            setOutput('');
            setPreviousParameters(result.endpoints[0].parameters || []);
          }
        } else {
          // No endpoint selected, select the first one
          if (onEndpointSelect) {
            onEndpointSelect(result.endpoints[0]);
          }
          setPreviousParameters(result.endpoints[0].parameters || []);
        }
      } else {
        if (onEndpointSelect) {
          onEndpointSelect(null);
        }
        setPreviousParameters([]);
      }
    } catch (error) {
      console.error('Error refreshing endpoints:', error);
    } finally {
      setLoading(false);
      setIsInitializing(false);
    }
  };

  // Watch for refresh trigger from save event
  useEffect(() => {
    if (shouldRefresh) {
      refreshEndpoints();
      if (onRefreshComplete) {
        onRefreshComplete();
      }
    }
  }, [shouldRefresh, onRefreshComplete]);

  // Notify parent when endpoints change
  useEffect(() => {
    if (onEndpointsChanged) {
      onEndpointsChanged(endpoints);
    }
  }, [endpoints, onEndpointsChanged]);

  // Execute the selected endpoint
  const executeEndpoint = async () => {
    if (!selectedEndpoint || !getCurrentBackendCode) return;
    
    setLoading(true);
    setOutput('');
    
    try {
      const currentCode = getCurrentBackendCode();
      
      const response = await fetch(ENV.EXECUTE_ENDPOINT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pythonCode: currentCode,
          endpoint: selectedEndpoint.endpoint,
          args: inputs
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Try to format as JSON if it's a string that looks like JSON
        let formattedOutput = data.result;
        if (typeof data.result === 'string') {
          try {
            const parsed = JSON.parse(data.result);
            formattedOutput = JSON.stringify(parsed, null, 2);
          } catch {
            // If it's not valid JSON, use as-is
            formattedOutput = data.result;
          }
        } else {
          formattedOutput = JSON.stringify(data.result, null, 2);
        }
        setOutput(formattedOutput);
      } else {
        setOutput(data.error);
      }
    } catch (error) {
      setOutput(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Initialize inputs with default values when endpoint changes
  useEffect(() => {
    if (selectedEndpoint && selectedEndpoint.parameters) {
      const userParams = selectedEndpoint.parameters.filter(param => 
        param.type === 'regular' || param.type === 'default'
      );
      
      const newInputs: Record<string, string> = {};
      userParams.forEach(param => {
        if (param.type === 'default' && param.defaultValue && !(param.name in inputs)) {
          newInputs[param.name] = param.defaultValue;
        }
      });
      
      if (Object.keys(newInputs).length > 0) {
        setInputs(prev => ({ ...prev, ...newInputs }));
      }
    }
  }, [selectedEndpoint]);

  // Generate input fields based on endpoint parameters
  const generateInputFields = () => {
    if (!selectedEndpoint || !selectedEndpoint.parameters) return null;
    
    // Filter out *args and **kwargs as they're not typically user inputs
    const userParams = selectedEndpoint.parameters.filter(param => 
      param.type === 'regular' || param.type === 'default'
    );
    
    if (userParams.length === 0) {
      return null;
    }
    
    return userParams.map((param, index) => (
      <div key={index} className="input-field">
        <span>
          {param.name}
          {param.required && <span className="required">*</span>}
          &nbsp;=&nbsp;
        </span>
        <textarea
          value={(inputs as any)[param.name] || ''}
          onChange={(e) => setInputs(prev => ({ ...prev, [param.name]: e.target.value }))}
          placeholder={`Enter ${param.name}...`}
          rows={1}
        />
      </div>
    ));
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div></div>
    );
  }

  if (endpoints.length === 0) {
    return (
      <div className="api-panel-compact">
        {parseError ? (
          <div className="compilation-errors">
            <div className="compilation-header">
              <div className="flex items-center gap-2">
                <BsXCircle className="text-red-500" />
                <span className="font-medium text-red-400">
                  Compilation failed with 1 error(s)
                </span>
              </div>
            </div>
            <div className="compilation-details">
              <div className="compilation-error">
                <div className="flex items-start gap-2">
                  <BsXCircle className="text-white mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="font-medium text-white">
                      backend.py
                    </div>
                    <div className="text-white text-sm text-left">{parseError}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="compilation-hint">
              <p className="hint text-sm">Fix the errors and save before trying again</p>
            </div>
          </div>
        ) : (
          <div className="no-endpoints">
            <p>No endpoints found in backend code</p>
            <p className="hint">Make sure your backend.py has @endpoint decorators</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="api-panel-compact">
      {selectedEndpoint && (
        <div className="api-panel-layout">
          {/* Left half: Parameters and Execute button */}
          <div 
            className="api-panel-left"
            style={{ width: `${leftPanelWidth}%` }}
          >
            <div className="input-section">
              <div className="input-header">
                <span className="input-label">Inputs</span>
              </div>
              <div className="input-content-container">
                {generateInputFields() ? (
                  <div className="input-content">
                    {generateInputFields()}
                  </div>
                ) : (
                  <div className="input-placeholder">
                    <span>No parameters required</span>
                  </div>
                )}
              </div>
              <div className="execute-section">
                <button 
                  onClick={executeEndpoint}
                  disabled={loading}
                  className="execute-btn"
                >
                  {loading ? 'Executing...' : 'Execute'}
                </button>
              </div>
            </div>
          </div>

          {/* Draggable divider */}
          <div 
            className="api-panel-divider"
            onMouseDown={handleMouseDown}
          />

          {/* Right half: Output area */}
          <div 
            className="api-panel-right"
            style={{ width: `${100 - leftPanelWidth}%` }}
          >
            <div className="output-section">
              <div className="output-header">
                <span className="output-label">Output</span>
              </div>
              <div className="output-content-container">
                {output ? (
                  <div className="output-content">
                    <pre 
                      className="output-pre"
                      dangerouslySetInnerHTML={{ 
                        __html: highlightReactJSON(output) 
                      }}
                    />
                  </div>
                ) : (
                  <div className="output-placeholder">
                    <span>Output will appear here...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transparent overlay for mouse tracking during drag */}
          {isDragging && (
            <div 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'transparent',
                zIndex: 9999,
                cursor: 'col-resize',
                pointerEvents: 'all'
              }}
              onMouseMove={(e) => handleMouseMove(e.nativeEvent)}
              onMouseUp={handleMouseUp}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default APITestingPanel;