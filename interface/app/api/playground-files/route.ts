import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Path to blank site files relative to the repository root
    const blankSiteDir = join(process.cwd(), '..', 'data', 'code_files', 'blank_site');
    
    // Read blank site files (excluding instructions.html which is only for display)
    const files = [
      {
        id: 'index.html',
        name: 'index.html',
        type: 'file',
        content: await readFile(join(blankSiteDir, 'index.html'), 'utf-8'),
        language: 'html'
      },
      {
        id: 'styles.css',
        name: 'styles.css',
        type: 'file',
        content: await readFile(join(blankSiteDir, 'styles.css'), 'utf-8'),
        language: 'css'
      },
      {
        id: 'frontend.js',
        name: 'frontend.js',
        type: 'file',
        content: await readFile(join(blankSiteDir, 'frontend.js'), 'utf-8'),
        language: 'javascript'
      }
      // Note: instructions.html is excluded from files - it's only used for display in the task instruction panel
    ];

    // Read instructions.html separately for display purposes (not part of editable files)
    let instructions = '';
    try {
      instructions = await readFile(join(blankSiteDir, 'instructions.html'), 'utf-8');
    } catch (error) {
      console.warn('Failed to read instructions.html:', error);
    }

    // Prevent caching of the response
    const jsonResponse = NextResponse.json({ files, instructions });
    jsonResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    jsonResponse.headers.set('Pragma', 'no-cache');
    jsonResponse.headers.set('Expires', '0');
    return jsonResponse;
  } catch (error) {
    console.error('Error loading playground files:', error);
    return NextResponse.json({ files: [] }, { status: 200 });
  }
}

