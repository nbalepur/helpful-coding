import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    // API routes run server-side, so use internal backend URL directly
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4828';
    const res = await fetch(`${backendUrl}/api/tasks-db`);
    if (!res.ok) {
      throw new Error(`Backend error ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying tasks:', error);
    return NextResponse.json({ tasks: [] }, { status: 200 });
  }
}


