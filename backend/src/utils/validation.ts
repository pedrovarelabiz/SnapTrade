/**
 * Validation utilities
 */

/**
 * Validates expiration time format and ensures it's in the future relative to signal time
 * and within reasonable bounds (1-60 minutes from signal time)
 *
 * @param expirationTime - The expiration timestamp (ISO string or Date)
 * @param signalTime - The signal timestamp (ISO string or Date)
 * @returns Object with isValid flag and optional error message
 */
export function validateExpiration(
  expirationTime: string | Date,
  signalTime: string | Date
): { isValid: boolean; error?: string } {
  try {
    const expiration = new Date(expirationTime);
    const signal = new Date(signalTime);

    // Check if dates are valid
    if (isNaN(expiration.getTime())) {
      return { isValid: false, error: 'Invalid expiration time format' };
    }
    if (isNaN(signal.getTime())) {
      return { isValid: false, error: 'Invalid signal time format' };
    }

    // Check if expiration is in the future relative to signal time
    if (expiration <= signal) {
      return { isValid: false, error: 'Expiration time must be after signal time' };
    }

    // Calculate difference in minutes
    const diffMs = expiration.getTime() - signal.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    // Check bounds (1-60 minutes)
    if (diffMinutes < 1) {
      return { isValid: false, error: 'Expiration must be at least 1 minute after signal time' };
    }
    if (diffMinutes > 60) {
      return { isValid: false, error: 'Expiration must be within 60 minutes of signal time' };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Error validating expiration time' };
  }
}

/**
 * Simple boolean check for expiration validity
 *
 * @param expirationTime - The expiration timestamp (ISO string or Date)
 * @param signalTime - The signal timestamp (ISO string or Date)
 * @returns true if valid, false otherwise
 */
export function isValidExpiration(
  expirationTime: string | Date,
  signalTime: string | Date
): boolean {
  return validateExpiration(expirationTime, signalTime).isValid;
}
