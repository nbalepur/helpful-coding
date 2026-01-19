import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode');

    if (!mode || (mode !== 'pre-test' && mode !== 'post-test' && mode !== 'retake')) {
      return NextResponse.json(
        { error: 'Mode must be "pre-test", "post-test", or "retake"' },
        { status: 400 }
      );
    }

    // API routes run server-side, so use internal backend URL directly
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    // Forward all query params (including retake counts) to the backend
    const backendUrl = `${backendBaseUrl}/api/skill-check/questions?${searchParams.toString()}`;
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
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching skill check questions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}

