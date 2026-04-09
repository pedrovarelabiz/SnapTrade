import * as paypal from '@paypal/checkout-server-sdk';

/**
 * PayPal client initialization utility
 * Sets up PayPalHttpClient with credentials from environment variables
 */

// Validate required environment variables
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' or 'live'

if (!PAYPAL_CLIENT_ID) {
  throw new Error('PAYPAL_CLIENT_ID environment variable is required');
}

if (!PAYPAL_CLIENT_SECRET) {
  throw new Error('PAYPAL_CLIENT_SECRET environment variable is required');
}

/**
 * Create PayPal environment based on mode
 * @returns PayPal environment (Sandbox or Live)
 */
function environment(): paypal.core.PayPalEnvironment {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials are not configured');
  }
  if (PAYPAL_MODE === 'live' || PAYPAL_MODE === 'production') {
    return new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
  }
  return new paypal.core.SandboxEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
}

/**
 * PayPal HTTP client instance
 */
export const paypalClient = new paypal.core.PayPalHttpClient(environment());

/**
 * Get the current PayPal mode
 */
export const getPayPalMode = (): string => PAYPAL_MODE;

/**
 * Check if PayPal is in sandbox mode
 */
export const isSandboxMode = (): boolean => PAYPAL_MODE !== 'live' && PAYPAL_MODE !== 'production';
