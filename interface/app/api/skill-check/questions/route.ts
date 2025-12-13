import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('mode');
    const userId = searchParams.get('user_id');

    if (!mode || (mode !== 'pre-test' && mode !== 'post-test')) {
      return NextResponse.json(
        { error: 'Mode must be "pre-test" or "post-test"' },
        { status: 400 }
      );
    }

    // API routes run server-side, so use internal backend URL directly
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    const backendUrl = `${backendBaseUrl}/api/skill-check/questions?mode=${mode}${
      userId ? `&user_id=${encodeURIComponent(userId)}` : ''
    }`;
    const response = await fetch(backendUrl);

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

