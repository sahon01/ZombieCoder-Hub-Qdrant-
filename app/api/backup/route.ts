import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

const execPromise = promisify(exec);
const BACKUP_DIR = process.env.BACKUP_DIR || '/tmp/backups';

// Ensure backup directory exists
async function ensureBackupDir() {
  if (!existsSync(BACKUP_DIR)) {
    await mkdir(BACKUP_DIR, { recursive: true });
  }
}

// Create database dump
async function createDatabaseDump() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpFile = `${BACKUP_DIR}/db_dump_${timestamp}.sql`;

  // Replace these with your actual database credentials
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'zombie_dance',
  };

  const command = `mysqldump -h ${dbConfig.host} -u ${dbConfig.user} -p${dbConfig.password} ${dbConfig.database} > ${dumpFile}`;

  try {
    await execPromise(command);
    return dumpFile;
  } catch (error) {
    console.error('Database dump failed:', error);
    throw new Error('Failed to create database dump');
  }
}

// Create backup archive
async function createBackupArchive() {
  await ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = `${BACKUP_DIR}/backup_${timestamp}.zombie`;
  const output = createWriteStream(archivePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise<string>((resolve, reject) => {
    output.on('close', () => resolve(archivePath));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // Add database dump
    // Add prompt templates
    // Add vector indexes
    // Add other important files

    archive.finalize();
  });
}

export async function POST() {
  try {
    // Create database dump
    const dumpFile = await createDatabaseDump();

    // Create backup archive
    const backupPath = await createBackupArchive();

    return NextResponse.json({
      success: true,
      message: 'Backup created successfully',
      path: backupPath,
      size: (await stat(backupPath)).size
    });

  } catch (error) {
    console.error('Backup failed:', error);
    return NextResponse.json(
      { success: false, error: 'Backup failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await ensureBackupDir();
    const files = await readdir(BACKUP_DIR);
    const backups = files
      .filter(file => file.endsWith('.zombie'))
      .map(file => ({
        name: file,
        path: join(BACKUP_DIR, file),
        created: new Date(file.split('_')[1].replace('.zombie', '')).toISOString()
      }));

    return NextResponse.json({ backups });
  } catch (error) {
    console.error('Failed to list backups:', error);
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    );
  }
}
