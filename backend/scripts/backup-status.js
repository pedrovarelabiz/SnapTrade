"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBackupStatus = updateBackupStatus;
exports.getLastBackupStatus = getLastBackupStatus;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const backup_config_1 = require("./backup-config");
const STATUS_FILE_PATH = path.join(backup_config_1.LOCAL_BACKUP_DIR, 'status', 'last-backup-status.json');
/**
 * Updates the backup status by writing to the JSON file
 */
async function updateBackupStatus(status) {
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
    }
    catch (error) {
        throw new Error(`Failed to update backup status: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Retrieves the last backup status from the JSON file
 */
async function getLastBackupStatus() {
    try {
        if (!fs.existsSync(STATUS_FILE_PATH)) {
            return null;
        }
        const data = fs.readFileSync(STATUS_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        throw new Error(`Failed to read backup status: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=backup-status.js.map