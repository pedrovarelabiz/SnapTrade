# Environment Variable Validation Test Results

**Test Date:** 2026-03-22
**Script Tested:** `/opt/snaptrade-unified/backend/scripts/db-backup.ts`
**Test Type:** Missing Environment Variables

## Summary

The backup script has **partial** environment variable validation:
- ✅ **DB_* variables** are validated upfront with clear error messages
- ⚠️ **S3_BACKUP_BUCKET** is not validated upfront (checked later in pre-backup phase)
- ⚠️ **BACKUP_ENCRYPTION_KEY** is not validated upfront (checked during encryption phase)

## Test Scenarios

### 1. Single DB Variable Missing (DB_HOST)
**Command:**
```bash
DB_HOST= npm run backup:run 2>&1 | grep -i "missing\|required\|error"
```

**Result:**
```
Error: Missing required environment variables: DB_HOST
Stack trace: Error: Missing required environment variables: DB_HOST
```

**Status:** ✅ **PASS** - Clear error message, fails gracefully

---

### 2. Multiple DB Variables Missing
**Test:**
```typescript
delete process.env.DB_HOST;
delete process.env.DB_NAME;
delete process.env.DB_PASSWORD;
validateEnvironment();
```

**Result:**
```
Error: Missing required environment variables: DB_HOST, DB_NAME, DB_PASSWORD
```

**Status:** ✅ **PASS** - All missing variables reported together, fails gracefully

---

### 3. S3_BACKUP_BUCKET Missing
**Test:**
```typescript
delete process.env.S3_BACKUP_BUCKET;
validateEnvironment();
```

**Result:**
```
✓ Environment variables validated successfully
(validation passes, but would fail later in runPreBackupChecks())
```

**Code Reference:** Line 135-137 in db-backup.ts:
```typescript
if (!s3BucketName) {
  throw new Error('S3_BACKUP_BUCKET environment variable is not set');
}
```

**Status:** ⚠️ **PARTIAL** - Error message is clear, but validation happens later in the process

---

### 4. BACKUP_ENCRYPTION_KEY Missing
**Test:**
```typescript
delete process.env.BACKUP_ENCRYPTION_KEY;
validateEnvironment();
```

**Result:**
```
✓ Environment variables validated successfully
(validation passes, but would fail later during encryption)
```

**Code Reference:** Line 294-296 in db-backup.ts:
```typescript
if (!encryptionKey) {
  throw new Error('BACKUP_ENCRYPTION_KEY environment variable is not set');
}
```

**Status:** ⚠️ **PARTIAL** - Error message is clear, but validation happens after backup is created

---

## Partial Backup Cleanup

**Test:** Check if failed backups leave partial files behind

**Result:** ✅ **PASS** - No partial backup files found after failed runs

**Code Analysis:**
- Line 303: Unencrypted backup deleted immediately after encryption
- Line 318-320: Partial encrypted files cleaned up if encryption fails
- Line 380: Local encrypted files deleted after successful S3 upload (unless KEEP_LOCAL_BACKUP_COPY=true)

---

## Findings & Recommendations

### Current Behavior
1. **DB_* variables** (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) are validated in `validateEnvironment()` function
2. **S3_BACKUP_BUCKET** is validated in `runPreBackupChecks()` function
3. **BACKUP_ENCRYPTION_KEY** is validated in `executeBackup()` during encryption phase

### Issues Identified
1. **Incomplete upfront validation**: S3_BACKUP_BUCKET and BACKUP_ENCRYPTION_KEY are documented as "required" but not validated in `validateEnvironment()`
2. **Late failure scenario**: If BACKUP_ENCRYPTION_KEY is missing, the script will:
   - Create backup directory
   - Connect to database
   - Run pg_dump (time-consuming)
   - Create unencrypted backup file
   - **THEN FAIL** during encryption

   This wastes time and resources.

### Recommendation
Update `validateEnvironment()` to check **ALL** required environment variables:

```typescript
function validateEnvironment(): void {
  const requiredVars = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'S3_BACKUP_BUCKET',        // ADD THIS
    'BACKUP_ENCRYPTION_KEY'    // ADD THIS
  ];

  const missingVars: string[] = [];

  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  console.log('✓ Environment variables validated successfully');
}
```

This ensures:
- ✅ All required variables validated before any operations
- ✅ Single clear error message listing all missing variables
- ✅ Fail fast - before wasting time on database operations
- ✅ Consistent with documentation (all "required" vars are actually validated)

---

## Verification Commands

```bash
# Test with single variable missing
DB_HOST= npm run backup:run 2>&1 | grep -i "missing\|required"

# Test with multiple variables missing
DB_HOST= DB_NAME= DB_PASSWORD= npm run backup:run 2>&1 | grep -i "missing"

# Check for partial backup files
ls -lah /tmp/snaptrade-backups/*.dump* 2>&1

# Run comprehensive test suite
npx tsx test-env-validation-comprehensive.ts
```
