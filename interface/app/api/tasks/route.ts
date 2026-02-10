import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // API routes run server-side, so use internal backend URL directly
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const queryString = userId ? `?userId=${userId}` : '';
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    const res = await fetch(`${backendUrl}/api/tasks-db${queryString}`, {
      cache: 'no-store' // Prevent Next.js from caching this request
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
    console.error('Error proxying tasks:', error);
    const cause = error instanceof Error ? error.cause : null;
    const code = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code: string }).code : null;
    const isUnreachable = code === 'ECONNREFUSED';
    if (isUnreachable) {
      return NextResponse.json(
        { error: 'Backend unavailable', code: 'BACKEND_UNREACHABLE', tasks: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to load tasks', tasks: [] }, { status: 502 });
  }
}


