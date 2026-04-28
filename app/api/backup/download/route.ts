import { NextResponse } from 'next/server';
import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { join } from 'path';

const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/backups';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('file');
    
    if (!fileName) {
      return new NextResponse('File name is required', { status: 400 });
    }

    const filePath = join(BACKUP_DIR, fileName);
    
    // Verify file exists
    try {
      await stat(filePath);
    } catch (error) {
      return new NextResponse('Backup file not found', { status: 404 });
    }

    // Create a stream from the file
    const fileStream = createReadStream(filePath);
    
    // Set headers for file download
    const response = new NextResponse(fileStream as any);
    response.headers.set('Content-Type', 'application/octet-stream');
    response.headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
    
    return response;
    
  } catch (error) {
    console.error('Download failed:', error);
    return new NextResponse('Download failed', { status: 500 });
  }
}
