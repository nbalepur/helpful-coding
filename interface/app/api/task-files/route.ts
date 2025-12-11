import { NextRequest, NextResponse } from 'next/server';
import { ENV } from '@/app/config/env';

export const runtime = 'nodejs';

console.log('ENV', ENV);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const userId = searchParams.get('userId');
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    const raw = ENV.BACKEND_URL || 'http://127.0.0.1:4828';
    let base = raw;
    try {
      const u = new URL(raw);
      if (u.hostname === 'localhost') {
        u.hostname = '127.0.0.1';
      }
      base = u.toString().replace(/\/$/, '');
    } catch {
      base = raw.replace('localhost', '127.0.0.1').replace(/\/$/, '');
    }
    
    // Build query string with taskId and optionally userId
    const queryParams = new URLSearchParams({ taskId });
    if (userId) {
      queryParams.append('userId', userId);
    }
    
    const res = await fetch(`${base}/api/task-files-db?${queryParams.toString()}`);
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
