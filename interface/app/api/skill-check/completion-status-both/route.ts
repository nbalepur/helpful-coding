import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    // API routes run server-side, so use internal backend URL directly
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    const backendUrl = `${backendBaseUrl}/api/skill-check/completion-status-both?user_id=${encodeURIComponent(userId)}`;
    const response = await fetch(backendUrl, {
      cache: 'no-store', // Prevent Next.js from caching this request
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    // Prevent caching of the response
    const jsonResponse = NextResponse.json(data);
    jsonResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    jsonResponse.headers.set('Pragma', 'no-cache');
    jsonResponse.headers.set('Expires', '0');
    return jsonResponse;
  } catch (error: any) {
    console.error('Error checking skill check completion status:', error);
    return NextResponse.json(
      { error: 'Failed to check completion status' },
      { status: 500 }
    );
  }
}

