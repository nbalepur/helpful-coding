import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    const files: any[] = [];
    
    if (taskId === 'tic-tac-toe') {
      // Load task definition from dummy_tasks.json
      const tasksPath = join(process.cwd(), '..', 'data', 'dummy_tasks.json');
      const tasksData = JSON.parse(readFileSync(tasksPath, 'utf-8'));
      const task = tasksData.tasks.find((t: any) => t.name === 'Tic Tac Toe');
      
      if (task && task.files) {
        const basePath = join(process.cwd(), '..', 'data', 'code_files', 'tictactoe_solution');
        
        for (const fileConfig of task.files) {
          try {
            // If content is a file path, read the file
            if (fileConfig.content.startsWith('data/')) {
              const filePath = join(process.cwd(), '..', fileConfig.content);
              const content = readFileSync(filePath, 'utf-8');
              
              files.push({
                id: fileConfig.name,
                name: fileConfig.name,
                type: 'file',
                content: content,
                language: fileConfig.language
              });
            } else {
              // If content is inline, use it directly
              files.push({
                id: fileConfig.name,
                name: fileConfig.name,
                type: 'file',
                content: fileConfig.content,
                language: fileConfig.language
              });
            }
          } catch (error) {
            console.error(`Error reading file ${fileConfig.name}:`, error);
          }
        }
      }
    }
    
    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error loading task files:', error);
    return NextResponse.json({ error: 'Failed to load task files' }, { status: 500 });
  }
}
