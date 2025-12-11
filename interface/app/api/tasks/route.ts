import { NextRequest, NextResponse } from 'next/server';
import { ENV } from '@/app/config/env';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    const raw = ENV.BACKEND_URL;
    console.log('raw', raw);
    const res = await fetch(`${raw}/api/tasks-db`);
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


