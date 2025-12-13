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
    
    const res = await fetch(`${backendBaseUrl}/api/task-files-db?${queryParams.toString()}`);
    if (!res.ok) {
      throw new Error(`Backend error ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying task files:', error);
    return NextResponse.json({ files: [] }, { status: 200 });
  }
}
