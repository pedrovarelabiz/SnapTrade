import crypto from 'crypto';
import fs from 'fs/promises';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encrypts a file using AES-256-GCM encryption
 * @param inputPath - Path to the file to encrypt
 * @param outputPath - Path where encrypted file will be saved
 * @param encryptionKey - 32-byte encryption key (can be string or Buffer)
 * @throws Error if encryption fails or file cannot be read/written
 */
export async function encryptFile(
  inputPath: string,
  outputPath: string,
  encryptionKey: string | Buffer
): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting encryption: ${inputPath} -> ${outputPath}`);

  try {
    // Ensure key is the correct length
    const key = Buffer.isBuffer(encryptionKey)
      ? encryptionKey
      : Buffer.from(encryptionKey, 'hex');

    if (key.length !== KEY_LENGTH) {
      throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
    }

    // Generate a random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Read the input file
    const data = await fs.readFile(inputPath);
    const inputSize = data.length;
    console.log(`[${new Date().toISOString()}] Read input file: ${inputSize} bytes`);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the data
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    const output = Buffer.concat([iv, authTag, encrypted]);
    const outputSize = output.length;

    // Write to output file with restrictive permissions (owner read/write only)
    await fs.writeFile(outputPath, output, { mode: 0o600 });

    // Validate encrypted file was created successfully
    const stats = await fs.stat(outputPath);
    if (stats.size !== outputSize) {
      throw new Error(`File size mismatch: expected ${outputSize}, got ${stats.size}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Encryption completed successfully`);
    console.log(`[${new Date().toISOString()}] Size: ${inputSize} bytes -> ${outputSize} bytes (${((outputSize / inputSize - 1) * 100).toFixed(1)}% overhead), Duration: ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Encryption failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      throw new Error(`Failed to encrypt file: ${error.message}`);
    }
    throw new Error('Failed to encrypt file: Unknown error');
  }
}

/**
 * Decrypts a file that was encrypted using encryptFile
 * @param inputPath - Path to the encrypted file
 * @param outputPath - Path where decrypted file will be saved
 * @param encryptionKey - 32-byte encryption key (can be string or Buffer)
 * @throws Error if decryption fails, authentication fails, or file is corrupted
 */
export async function decryptFile(
  inputPath: string,
  outputPath: string,
  encryptionKey: string | Buffer
): Promise<void> {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting decryption: ${inputPath} -> ${outputPath}`);

  try {
    // Ensure key is the correct length
    const key = Buffer.isBuffer(encryptionKey)
      ? encryptionKey
      : Buffer.from(encryptionKey, 'hex');

    if (key.length !== KEY_LENGTH) {
      throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
    }

    // Read the encrypted file
    const data = await fs.readFile(inputPath);
    const inputSize = data.length;
    console.log(`[${new Date().toISOString()}] Read encrypted file: ${inputSize} bytes`);

    // Check minimum file size
    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Corrupted file: File too small to contain valid encrypted data');
    }

    // Extract IV, auth tag, and encrypted data
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the data
    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (error) {
      throw new Error('Corrupted file: Authentication failed or file has been tampered with');
    }

    const outputSize = decrypted.length;

    // Write to output file with restrictive permissions (owner read/write only)
    await fs.writeFile(outputPath, decrypted, { mode: 0o600 });

    // Validate decrypted file was created successfully
    const stats = await fs.stat(outputPath);
    if (stats.size !== outputSize) {
      throw new Error(`File size mismatch: expected ${outputSize}, got ${stats.size}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] Decryption completed successfully`);
    console.log(`[${new Date().toISOString()}] Size: ${inputSize} bytes -> ${outputSize} bytes, Duration: ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] Decryption failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
    if (error instanceof Error) {
      if (error.message.startsWith('Corrupted file:')) {
        throw error;
      }
      throw new Error(`Failed to decrypt file: ${error.message}`);
    }
    throw new Error('Failed to decrypt file: Unknown error');
  }
}

/**
 * Generates a random 32-byte encryption key suitable for AES-256-GCM
 * @returns Hex-encoded encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
