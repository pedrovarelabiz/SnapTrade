import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { encryptFile, decryptFile, generateEncryptionKey } from '../encryption';

describe('Encryption Module', () => {
  const TEST_DIR = '/tmp/encryption-test-' + Date.now();
  let testKey: string;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });

    // Generate a test encryption key
    testKey = generateEncryptionKey();
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('encryptFile and decryptFile roundtrip', () => {
    it('should successfully encrypt and decrypt a text file', async () => {
      const originalContent = 'This is a test file with sensitive data!';
      const inputPath = path.join(TEST_DIR, 'original.txt');
      const encryptedPath = path.join(TEST_DIR, 'encrypted.bin');
      const decryptedPath = path.join(TEST_DIR, 'decrypted.txt');

      // Write original file
      await fs.writeFile(inputPath, originalContent);

      // Encrypt the file
      await encryptFile(inputPath, encryptedPath, testKey);

      // Verify encrypted file exists and is different
      const encryptedData = await fs.readFile(encryptedPath);
      expect(encryptedData.length).toBeGreaterThan(originalContent.length);
      expect(encryptedData.toString()).not.toContain(originalContent);

      // Decrypt the file
      await decryptFile(encryptedPath, decryptedPath, testKey);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath, 'utf-8');
      expect(decryptedContent).toBe(originalContent);
    });

    it('should successfully encrypt and decrypt a binary file', async () => {
      const originalData = crypto.randomBytes(1024);
      const inputPath = path.join(TEST_DIR, 'original.bin');
      const encryptedPath = path.join(TEST_DIR, 'encrypted.bin');
      const decryptedPath = path.join(TEST_DIR, 'decrypted.bin');

      // Write original binary file
      await fs.writeFile(inputPath, originalData);

      // Encrypt and decrypt
      await encryptFile(inputPath, encryptedPath, testKey);
      await decryptFile(encryptedPath, decryptedPath, testKey);

      // Verify binary content matches
      const decryptedData = await fs.readFile(decryptedPath);
      expect(Buffer.compare(decryptedData, originalData)).toBe(0);
    });

    it('should successfully encrypt and decrypt an empty file', async () => {
      const inputPath = path.join(TEST_DIR, 'empty.txt');
      const encryptedPath = path.join(TEST_DIR, 'empty.enc');
      const decryptedPath = path.join(TEST_DIR, 'empty.dec');

      // Create empty file
      await fs.writeFile(inputPath, '');

      // Encrypt and decrypt
      await encryptFile(inputPath, encryptedPath, testKey);
      await decryptFile(encryptedPath, decryptedPath, testKey);

      // Verify result is still empty
      const decryptedContent = await fs.readFile(decryptedPath, 'utf-8');
      expect(decryptedContent).toBe('');
    });

    it('should handle large files correctly', async () => {
      const largeData = crypto.randomBytes(5 * 1024 * 1024); // 5 MB
      const inputPath = path.join(TEST_DIR, 'large.bin');
      const encryptedPath = path.join(TEST_DIR, 'large.enc');
      const decryptedPath = path.join(TEST_DIR, 'large.dec');

      await fs.writeFile(inputPath, largeData);
      await encryptFile(inputPath, encryptedPath, testKey);
      await decryptFile(encryptedPath, decryptedPath, testKey);

      const decryptedData = await fs.readFile(decryptedPath);
      expect(Buffer.compare(decryptedData, largeData)).toBe(0);
    });
  });

  describe('decryption with wrong key', () => {
    it('should fail to decrypt with wrong key', async () => {
      const originalContent = 'Secret message';
      const inputPath = path.join(TEST_DIR, 'secret.txt');
      const encryptedPath = path.join(TEST_DIR, 'secret.enc');
      const decryptedPath = path.join(TEST_DIR, 'secret.dec');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Try to decrypt with a different key
      const wrongKey = generateEncryptionKey();

      await expect(
        decryptFile(encryptedPath, decryptedPath, wrongKey)
      ).rejects.toThrow('Corrupted file: Authentication failed or file has been tampered with');
    });

    it('should fail with key of incorrect length', async () => {
      const inputPath = path.join(TEST_DIR, 'test.txt');
      const encryptedPath = path.join(TEST_DIR, 'test.enc');

      await fs.writeFile(inputPath, 'test content');

      const shortKey = 'tooshort';

      await expect(
        encryptFile(inputPath, encryptedPath, shortKey)
      ).rejects.toThrow('Encryption key must be 32 bytes');
    });

    it('should fail decryption with partially correct key', async () => {
      const originalContent = 'Test data';
      const inputPath = path.join(TEST_DIR, 'test.txt');
      const encryptedPath = path.join(TEST_DIR, 'test.enc');
      const decryptedPath = path.join(TEST_DIR, 'test.dec');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Create a key that differs by only one byte
      const keyBuffer = Buffer.from(testKey, 'hex');
      keyBuffer[0] = keyBuffer[0] ^ 0x01; // Flip one bit
      const almostCorrectKey = keyBuffer.toString('hex');

      await expect(
        decryptFile(encryptedPath, decryptedPath, almostCorrectKey)
      ).rejects.toThrow('Corrupted file: Authentication failed or file has been tampered with');
    });
  });

  describe('corrupted encrypted files', () => {
    it('should reject file that is too small', async () => {
      const corruptedPath = path.join(TEST_DIR, 'corrupted.enc');
      const decryptedPath = path.join(TEST_DIR, 'output.txt');

      // Create a file that's too small (needs at least 32 bytes for IV + auth tag)
      await fs.writeFile(corruptedPath, 'short');

      await expect(
        decryptFile(corruptedPath, decryptedPath, testKey)
      ).rejects.toThrow('Corrupted file: File too small to contain valid encrypted data');
    });

    it('should reject file with corrupted auth tag', async () => {
      const originalContent = 'Test message';
      const inputPath = path.join(TEST_DIR, 'original.txt');
      const encryptedPath = path.join(TEST_DIR, 'encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'decrypted.txt');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Corrupt the auth tag (bytes 16-31)
      const encryptedData = await fs.readFile(encryptedPath);
      encryptedData[20] ^= 0xFF; // Flip all bits in one byte of auth tag
      await fs.writeFile(encryptedPath, encryptedData);

      await expect(
        decryptFile(encryptedPath, decryptedPath, testKey)
      ).rejects.toThrow('Corrupted file: Authentication failed or file has been tampered with');
    });

    it('should reject file with corrupted IV', async () => {
      const originalContent = 'Test message';
      const inputPath = path.join(TEST_DIR, 'original.txt');
      const encryptedPath = path.join(TEST_DIR, 'encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'decrypted.txt');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Corrupt the IV (first 16 bytes)
      const encryptedData = await fs.readFile(encryptedPath);
      encryptedData[5] ^= 0xFF;
      await fs.writeFile(encryptedPath, encryptedData);

      await expect(
        decryptFile(encryptedPath, decryptedPath, testKey)
      ).rejects.toThrow('Corrupted file: Authentication failed or file has been tampered with');
    });

    it('should reject file with corrupted encrypted data', async () => {
      const originalContent = 'Test message with more content';
      const inputPath = path.join(TEST_DIR, 'original.txt');
      const encryptedPath = path.join(TEST_DIR, 'encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'decrypted.txt');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Corrupt the encrypted data (after byte 32)
      const encryptedData = await fs.readFile(encryptedPath);
      if (encryptedData.length > 40) {
        encryptedData[40] ^= 0xFF;
        await fs.writeFile(encryptedPath, encryptedData);

        await expect(
          decryptFile(encryptedPath, decryptedPath, testKey)
        ).rejects.toThrow('Corrupted file: Authentication failed or file has been tampered with');
      }
    });

    it('should reject truncated encrypted file', async () => {
      const originalContent = 'Test message';
      const inputPath = path.join(TEST_DIR, 'original.txt');
      const encryptedPath = path.join(TEST_DIR, 'encrypted.enc');
      const decryptedPath = path.join(TEST_DIR, 'decrypted.txt');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Truncate the file by removing last few bytes
      const encryptedData = await fs.readFile(encryptedPath);
      const truncated = encryptedData.subarray(0, encryptedData.length - 5);
      await fs.writeFile(encryptedPath, truncated);

      await expect(
        decryptFile(encryptedPath, decryptedPath, testKey)
      ).rejects.toThrow();
    });
  });

  describe('IV uniqueness', () => {
    it('should generate unique IVs for multiple encryptions of same file', async () => {
      const originalContent = 'Same content encrypted multiple times';
      const inputPath = path.join(TEST_DIR, 'original.txt');

      await fs.writeFile(inputPath, originalContent);

      // Encrypt the same file multiple times
      const encryptedPaths = [];
      for (let i = 0; i < 5; i++) {
        const encryptedPath = path.join(TEST_DIR, `encrypted${i}.enc`);
        await encryptFile(inputPath, encryptedPath, testKey);
        encryptedPaths.push(encryptedPath);
      }

      // Read all encrypted files and extract their IVs
      const ivs: Buffer[] = [];
      for (const encPath of encryptedPaths) {
        const data = await fs.readFile(encPath);
        const iv = data.subarray(0, 16);
        ivs.push(iv);
      }

      // Verify all IVs are unique
      for (let i = 0; i < ivs.length; i++) {
        for (let j = i + 1; j < ivs.length; j++) {
          expect(Buffer.compare(ivs[i], ivs[j])).not.toBe(0);
        }
      }

      // Verify all encrypted files have different contents due to different IVs
      const encryptedContents = await Promise.all(
        encryptedPaths.map(p => fs.readFile(p))
      );
      for (let i = 0; i < encryptedContents.length; i++) {
        for (let j = i + 1; j < encryptedContents.length; j++) {
          expect(Buffer.compare(encryptedContents[i], encryptedContents[j])).not.toBe(0);
        }
      }

      // Verify all can still be decrypted correctly
      for (let i = 0; i < encryptedPaths.length; i++) {
        const decryptedPath = path.join(TEST_DIR, `decrypted${i}.txt`);
        await decryptFile(encryptedPaths[i], decryptedPath, testKey);
        const decryptedContent = await fs.readFile(decryptedPath, 'utf-8');
        expect(decryptedContent).toBe(originalContent);
      }
    });

    it('should use cryptographically random IVs', async () => {
      const originalContent = 'Test';
      const inputPath = path.join(TEST_DIR, 'test.txt');
      await fs.writeFile(inputPath, originalContent);

      // Generate many IVs and check for patterns
      const ivs: Buffer[] = [];
      for (let i = 0; i < 100; i++) {
        const encryptedPath = path.join(TEST_DIR, `enc${i}.bin`);
        await encryptFile(inputPath, encryptedPath, testKey);
        const data = await fs.readFile(encryptedPath);
        ivs.push(data.subarray(0, 16));
      }

      // Basic randomness check: no two IVs should be the same
      const uniqueIVs = new Set(ivs.map(iv => iv.toString('hex')));
      expect(uniqueIVs.size).toBe(100);

      // Check that IVs don't have obvious patterns (not all zeros, not sequential)
      for (const iv of ivs) {
        const allZeros = iv.every(byte => byte === 0);
        expect(allZeros).toBe(false);
      }
    });
  });

  describe('authentication tag validation', () => {
    it('should include authentication tag in encrypted output', async () => {
      const originalContent = 'Test content';
      const inputPath = path.join(TEST_DIR, 'test.txt');
      const encryptedPath = path.join(TEST_DIR, 'test.enc');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      const encryptedData = await fs.readFile(encryptedPath);

      // Encrypted file should be: 16 bytes IV + 16 bytes auth tag + encrypted data
      // So it should be at least 32 bytes longer than original (plus encrypted content)
      expect(encryptedData.length).toBeGreaterThanOrEqual(32);
    });

    it('should detect any modification to encrypted data via auth tag', async () => {
      const originalContent = 'Important data that should not be modified';
      const inputPath = path.join(TEST_DIR, 'important.txt');
      const encryptedPath = path.join(TEST_DIR, 'important.enc');
      const decryptedPath = path.join(TEST_DIR, 'important.dec');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Try modifying different parts of the encrypted file
      const positions = [0, 10, 20, 35, -1]; // IV, auth tag, and data regions

      for (const pos of positions) {
        const encryptedData = await fs.readFile(encryptedPath);
        const modifyPos = pos === -1 ? encryptedData.length - 1 : pos;
        encryptedData[modifyPos] ^= 0x01; // Flip one bit

        const tamperedPath = path.join(TEST_DIR, `tampered${pos}.enc`);
        await fs.writeFile(tamperedPath, encryptedData);

        // Should fail authentication
        await expect(
          decryptFile(tamperedPath, decryptedPath, testKey)
        ).rejects.toThrow();
      }
    });

    it('should validate auth tag before attempting decryption', async () => {
      const originalContent = 'Secret data';
      const inputPath = path.join(TEST_DIR, 'secret.txt');
      const encryptedPath = path.join(TEST_DIR, 'secret.enc');
      const decryptedPath = path.join(TEST_DIR, 'secret.dec');

      await fs.writeFile(inputPath, originalContent);
      await encryptFile(inputPath, encryptedPath, testKey);

      // Replace auth tag with random bytes
      const encryptedData = await fs.readFile(encryptedPath);
      const randomAuthTag = crypto.randomBytes(16);
      randomAuthTag.copy(encryptedData, 16, 0, 16);
      await fs.writeFile(encryptedPath, encryptedData);

      // Should fail with authentication error, not decryption error
      await expect(
        decryptFile(encryptedPath, decryptedPath, testKey)
      ).rejects.toThrow('Corrupted file: Authentication failed or file has been tampered with');
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate valid 32-byte hex key', () => {
      const key = generateEncryptionKey();

      // Should be 64 hex characters (32 bytes)
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);

      // Should be usable as an encryption key
      const keyBuffer = Buffer.from(key, 'hex');
      expect(keyBuffer.length).toBe(32);
    });

    it('should generate unique keys', () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(generateEncryptionKey());
      }
      expect(keys.size).toBe(100);
    });
  });
});
