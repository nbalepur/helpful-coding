import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('user_id');
    const phase = searchParams.get('phase');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    if (!phase || (phase !== 'pre-test' && phase !== 'post-test')) {
      return NextResponse.json(
        { error: 'phase must be "pre-test" or "post-test"' },
        { status: 400 }
      );
    }

    // API routes run server-side, so use internal backend URL directly
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    const backendUrl = `${backendBaseUrl}/api/skill-check/completion-status?user_id=${encodeURIComponent(userId)}&phase=${encodeURIComponent(phase)}`;
    const response = await fetch(backendUrl);

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error checking skill check completion status:', error);
    return NextResponse.json(
      { error: 'Failed to check completion status' },
      { status: 500 }
    );
  }
}

