import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Join the path segments back together
    const videoPath = params.path.join('/');
    
    // Construct the full file path
    const fullPath = join(process.cwd(), '..', 'data', 'code_files', videoPath);
    
    // Check if file exists
    if (!existsSync(fullPath)) {
      return new NextResponse('Video not found', { status: 404 });
    }
    
    // Read the video file
    const videoBuffer = readFileSync(fullPath);
    
    // Determine content type based on file extension
    const ext = videoPath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case 'mp4':
        contentType = 'video/mp4';
        break;
      case 'webm':
        contentType = 'video/webm';
        break;
      case 'ogg':
        contentType = 'video/ogg';
        break;
      case 'avi':
        contentType = 'video/avi';
        break;
      case 'mov':
        contentType = 'video/quicktime';
        break;
    }
    
    // Return the video file with appropriate headers
    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': videoBuffer.length.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error('Error serving video:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
