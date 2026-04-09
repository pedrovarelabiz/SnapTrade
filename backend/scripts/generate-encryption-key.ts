import crypto from 'crypto';

/**
 * Generate a secure random 32-byte encryption key for backup encryption
 */
function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

const key = generateEncryptionKey();

console.log('\n==============================================');
console.log('BACKUP ENCRYPTION KEY GENERATED');
console.log('==============================================\n');
console.log('Add this key to your .env file:\n');
console.log(`BACKUP_ENCRYPTION_KEY=${key}\n`);
console.log('==============================================');
console.log('WARNING: Store this key securely!');
console.log('- Keep it in a secure password manager');
console.log('- Never commit it to version control');
console.log('- Losing this key means backups cannot be decrypted');
console.log('==============================================\n');
