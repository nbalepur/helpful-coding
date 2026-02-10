import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const backendBaseUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    const res = await fetch(`${backendBaseUrl}/api/execute-function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data || { success: false, error: 'Execution failed' }, { status: res.status });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error proxying execute-function:', error);
    return NextResponse.json({ success: false, error: 'Failed to execute function' }, { status: 500 });
  }
}
