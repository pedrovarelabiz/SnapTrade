/**
 * Backup Configuration Settings
 *
 * This file contains all configuration settings for the backup system
 * including S3 storage, encryption, retention, and database connection details.
 */
export declare const S3_BUCKET_NAME: string;
export declare const AWS_REGION: string;
export declare const RETENTION_DAYS = 30;
export declare const BACKUP_SCHEDULE: string;
export declare const ENCRYPTION_ENABLED: boolean;
export declare const ENCRYPTION_ALGORITHM = "AES256";
export declare const ENCRYPTION_KEY_ID: string;
export declare const LOCAL_BACKUP_DIR: string;
export declare const DB_CONFIG: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
};
export declare const BACKUP_CONFIG: {
    s3: {
        bucket: string;
        region: string;
    };
    retention: {
        days: number;
    };
    schedule: string;
    encryption: {
        enabled: boolean;
        algorithm: string;
        keyId: string;
    };
    local: {
        directory: string;
    };
    database: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        ssl: boolean;
    };
};
export default BACKUP_CONFIG;
//# sourceMappingURL=backup-config.d.ts.map