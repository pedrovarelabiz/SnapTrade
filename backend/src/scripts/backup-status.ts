import * as fs from 'fs';
import * as path from 'path';
import { LOCAL_BACKUP_DIR } from './backup-config';

const STATUS_FILE_PATH = path.join(LOCAL_BACKUP_DIR, 'status', 'last-backup-status.json');

export interface BackupStatus {
  timestamp: string;
  success: boolean;
  fileSize?: number;
  s3Url?: string;
  duration?: number;
  errorMessage?: string;
}

/**
 * Updates the backup status by writing to the JSON file
 */
export async function updateBackupStatus(status: BackupStatus): Promise<void> {
  try {
    // Ensure the directory exists
    const dir = path.dirname(STATUS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the status to the file
    const statusData = {
      ...status,
      timestamp: status.timestamp || new Date().toISOString(),
    };

    fs.writeFileSync(STATUS_FILE_PATH, JSON.stringify(statusData, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to update backup status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieves the last backup status from the JSON file
 */
export async function getLastBackupStatus(): Promise<BackupStatus | null> {
  try {
    if (!fs.existsSync(STATUS_FILE_PATH)) {
      return null;
    }

    const data = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
    return JSON.parse(data) as BackupStatus;
  } catch (error) {
    throw new Error(`Failed to read backup status: ${error instanceof Error ? error.message : String(error)}`);
  }
}
