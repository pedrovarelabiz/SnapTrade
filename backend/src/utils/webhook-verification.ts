import * as paypal from '@paypal/checkout-server-sdk';

/**
 * Webhook verification result
 */
export interface WebhookVerificationResult {
  verified: boolean;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Webhook headers required for verification
 */
export interface WebhookHeaders {
  'paypal-transmission-id': string;
  'paypal-transmission-time': string;
  'paypal-transmission-sig': string;
  'paypal-cert-url': string;
  'paypal-auth-algo': string;
}

/**
 * Validates that all required PayPal webhook headers are present
 * @param headers - The headers object from the request
 * @returns Array of validation error messages, empty if valid
 */
export function validateWebhookHeaders(headers: Record<string, string | string[] | undefined>): string[] {
  const errors: string[] = [];

  const requiredHeaders = [
    'PAYPAL-TRANSMISSION-ID',
    'PAYPAL-TRANSMISSION-TIME',
    'PAYPAL-TRANSMISSION-SIG',
    'PAYPAL-CERT-URL',
    'PAYPAL-AUTH-ALGO'
  ];

  for (const header of requiredHeaders) {
    const headerValue = headers[header] || headers[header.toLowerCase()];
    if (!headerValue) {
      errors.push(`Missing required header: ${header}`);
    }
  }

  return errors;
}

/**
 * Validates webhook timestamp to prevent replay attacks
 * @param transmissionTime - The PAYPAL-TRANSMISSION-TIME header value (ISO 8601 format)
 * @param toleranceMs - Maximum age of the webhook in milliseconds (default: 5 minutes)
 * @returns Object with isValid flag and optional error message
 */
export function validateWebhookTimestamp(
  transmissionTime: string,
  toleranceMs: number = 5 * 60 * 1000 // 5 minutes default
): { isValid: boolean; error?: string } {
  try {
    // Parse the transmission time
    const transmissionDate = new Date(transmissionTime);

    // Check if the date is valid
    if (isNaN(transmissionDate.getTime())) {
      return {
        isValid: false,
        error: 'Invalid timestamp format',
      };
    }

    const now = new Date();
    const timeDiff = now.getTime() - transmissionDate.getTime();

    // Check if timestamp is from the future
    if (timeDiff < 0) { // No future timestamps allowed
      return {
        isValid: false,
        error: 'Webhook timestamp is from the future',
      };
    }

    // Check if timestamp is too old
    if (timeDiff > toleranceMs) {
      return {
        isValid: false,
        error: `Webhook timestamp is too old (age: ${Math.floor(timeDiff / 1000)}s, max: ${Math.floor(toleranceMs / 1000)}s)`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to validate timestamp: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Verifies PayPal webhook signature using PayPal SDK
 *
 * @param headers - Webhook headers containing signature information
 * @param body - Raw webhook request body (as string or object)
 * @param webhookId - PayPal webhook ID configured in your PayPal dashboard
 * @returns Promise with verification result and any error details
 */
export async function verifyPayPalWebhookSignature(
  headers: WebhookHeaders,
  body: string | Record<string, unknown>,
  webhookId: string
): Promise<WebhookVerificationResult> {
  try {
    // Validate required parameters
    if (!headers || !webhookId) {
      return {
        verified: false,
        error: {
          code: 'INVALID_PARAMETERS',
          message: 'Missing required parameters: headers and webhookId are required',
        },
      };
    }

    // Validate required headers
    const requiredHeaders = [
      'paypal-transmission-id',
      'paypal-transmission-time',
      'paypal-transmission-sig',
      'paypal-cert-url',
      'paypal-auth-algo',
    ];

    for (const header of requiredHeaders) {
      if (!headers[header as keyof WebhookHeaders]) {
        return {
          verified: false,
          error: {
            code: 'MISSING_HEADER',
            message: `Missing required header: ${header}`,
          },
        };
      }
    }

    // Convert body to string if it's an object
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);

    // Create PayPal environment (use sandbox or live based on your config)
    const environment = process.env.PAYPAL_MODE === 'live'
      ? new paypal.core.LiveEnvironment(
          process.env.PAYPAL_CLIENT_ID!,
          process.env.PAYPAL_CLIENT_SECRET!
        )
      : new paypal.core.SandboxEnvironment(
          process.env.PAYPAL_CLIENT_ID!,
          process.env.PAYPAL_CLIENT_SECRET!
        );

    const client = new paypal.core.PayPalHttpClient(environment);

    // Build verification request
    const verifyRequest = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: typeof body === 'string' ? JSON.parse(bodyString) : body,
    };

    // Make verification API call
    const request = {
      path: '/v1/notifications/verify-webhook-signature',
      verb: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: verifyRequest,
    };

    const response = await client.execute(request);

    // Check verification status
    if (response.statusCode === 200 && response.result) {
      const verificationStatus = (response.result as { verification_status?: string }).verification_status;

      if (verificationStatus === 'SUCCESS') {
        return {
          verified: true,
        };
      } else {
        return {
          verified: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: `Webhook signature verification failed: ${verificationStatus}`,
            details: response.result,
          },
        };
      }
    } else {
      return {
        verified: false,
        error: {
          code: 'UNEXPECTED_RESPONSE',
          message: `Unexpected response from PayPal API: status ${response.statusCode}`,
          details: response.result,
        },
      };
    }
  } catch (error) {
    // Handle specific PayPal API errors
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const paypalError = error as { statusCode: number; message?: string; details?: unknown };
      return {
        verified: false,
        error: {
          code: 'PAYPAL_API_ERROR',
          message: paypalError.message || `PayPal API error: ${paypalError.statusCode}`,
          details: paypalError.details || error,
        },
      };
    }

    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return {
        verified: false,
        error: {
          code: 'INVALID_JSON',
          message: 'Failed to parse webhook body as JSON',
          details: error.message,
        },
      };
    }

    // Handle network and other errors
    return {
      verified: false,
      error: {
        code: 'VERIFICATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error during webhook verification',
        details: error,
      },
    };
  }
}
