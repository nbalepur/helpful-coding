import { NextRequest, NextResponse } from 'next/server';
import { ENV } from '@/app/config/env';

export const runtime = 'nodejs';

/**
 * Catch-all proxy route for backend API requests
 * Proxies requests from /api/backend-proxy/* to the actual backend server
 * This allows the frontend to access the backend even when it's not publicly accessible
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params, 'DELETE');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params, 'PATCH');
}

async function proxyRequest(
  request: NextRequest,
  params: { path: string[] },
  method: string
) {
  try {
    const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
    const url = new URL(request.url);
    
    // Use internal backend URL (127.0.0.1:4828) since this runs on the server
    // This allows the server to connect to the backend even if it's not publicly accessible
    const internalBackendUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    
    // Reconstruct the backend URL with the path and query string
    // Forward the path as-is to the backend
    // e.g., /api/backend-proxy/login -> /login
    //       /api/backend-proxy/api/execute-endpoint -> /api/execute-endpoint
    const pathArray = Array.isArray(params.path) ? params.path : [params.path];
    let backendPath = '';
    
    if (pathArray.length > 0) {
      // Join all path segments and forward directly to backend
      backendPath = '/' + pathArray.join('/');
    } else {
      backendPath = '/';
    }
    
    const targetUrl = `${internalBackendUrl}${backendPath}${url.search}`;
    
    // Get request body if present
    let body: BodyInit | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await request.text();
      } catch {
        body = undefined;
      }
    }
    
    // Forward headers (excluding host)
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'host') {
        headers.set(key, value);
      }
    });
    
    // Make the request to the backend
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });
    
    // Get response body
    const responseBody = await response.text();
    
    // Forward the response with status and headers
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Error proxying backend request:', error);
    return NextResponse.json(
      { error: 'Failed to proxy request to backend', details: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

