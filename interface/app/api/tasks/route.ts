import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(_request: NextRequest) {
  try {
    const tasksPath = join(process.cwd(), '..', 'data', 'dummy_tasks.json');
    const tasksData = JSON.parse(readFileSync(tasksPath, 'utf-8'));

    const toId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const tasks = (tasksData.tasks || []).map((t: any) => {
      let videoDemo: string | undefined = t.videoDemo;
      if (t.name === 'Tic Tac Toe' && t.videoDemo === 'demo.mp4') {
        videoDemo = '/api/video/tictactoe_solution/demo.mp4';
      }

      return {
        id: toId(t.name),
        name: t.name,
        description: t.description || '',
        requirements: Array.isArray(t.requirements) ? t.requirements : [],
        videoDemo,
        tags: Array.isArray(t.tags) ? t.tags : [],
        difficulty: t.difficulty || 'Beginner',
        appType: t.appType || 'Widget',
        estimatedTime: t.estimatedTime || '30 min',
        preview: t.preview || '📦',
        status: t.status || 'not-started',
        saved: Boolean(t.saved),
      };
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error loading tasks:', error);
    return NextResponse.json({ tasks: [] }, { status: 200 });
  }
}


