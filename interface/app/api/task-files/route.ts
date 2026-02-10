import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const userId = searchParams.get('userId');
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    // API routes run server-side, so use internal backend URL directly
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    
    // Build query string with taskId and optionally userId
    const queryParams = new URLSearchParams({ taskId });
    if (userId) {
      queryParams.append('userId', userId);
    }
    
    const res = await fetch(`${backendBaseUrl}/api/task-files-db?${queryParams.toString()}`, {
      cache: 'no-store', // Prevent Next.js from caching this request
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    if (!res.ok) {
      throw new Error(`Backend error ${res.status}`);
    }
    const data = await res.json();
    // Prevent caching of the response
    const jsonResponse = NextResponse.json(data);
    jsonResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    jsonResponse.headers.set('Pragma', 'no-cache');
    jsonResponse.headers.set('Expires', '0');
    return jsonResponse;
  } catch (error) {
    console.error('Error proxying task files:', error);
    const cause = error instanceof Error ? error.cause : null;
    const code = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code: string }).code : null;
    const isUnreachable = code === 'ECONNREFUSED';
    if (isUnreachable) {
      return NextResponse.json(
        { error: 'Backend unavailable', code: 'BACKEND_UNREACHABLE', files: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to load task files', files: [] }, { status: 502 });
  }
}
