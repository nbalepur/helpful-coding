// Shared utility for injecting callAPI function into frontend code
// Used by both PreviewIframe and TestCasesPanel for consistency

export const prependCallAPIFunction = (
  jsCode: string,
  backendPort: number | null,
  backendCode: string = ''
): string => {
  let callAPIDefinition: string;

  if (!backendPort) {
    // Mock implementation when backend is not available
    callAPIDefinition = `function callAPI(endpoint, args = {}) {
  console.warn('Backend not connected. callAPI called with:', endpoint, args);
  return {
    result: null,
    error: 'Backend server not connected'
  };
}`;
  } else {
    // Real implementation for backend communication via main backend API
    // The backend code is not running as a live server - it's executed via OneCompiler
    // So we proxy the request through the main backend API at port 8000
    callAPIDefinition = `async function callAPI(endpoint, args = {}) {
  try {
    // Proxy through main backend API which executes the endpoint via OneCompiler
    const response = await fetch('http://localhost:8000/api/execute-endpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: endpoint,
        args: args,
        pythonCode: \`${backendCode.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      return {
        success: false,
        error: errorText || 'Request failed',
        result: null
      };
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('callAPI error:', error);
    return {
      success: false,
      error: error.message || 'Network error',
      result: null
    };
  }
}`;
  }

  return callAPIDefinition + '\n\n' + jsCode;
};

