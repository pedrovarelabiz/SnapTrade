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
export declare function updateBackupStatus(status: BackupStatus): Promise<void>;
/**
 * Retrieves the last backup status from the JSON file
 */
export declare function getLastBackupStatus(): Promise<BackupStatus | null>;
//# sourceMappingURL=backup-status.d.ts.map