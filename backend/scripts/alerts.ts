import https from 'https';

const ALERT_BOT_TOKEN = process.env.ALERT_BOT_TOKEN;
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

interface SendBackupAlertOptions {
  status: 'success' | 'failure';
  message: string;
  error?: Error | string;
}

/**
 * Sends a Telegram alert message via Bot API
 * @param status - 'success' or 'failure'
 * @param message - The alert message
 * @param error - Optional error object or string
 */
export async function sendBackupAlert(
  status: SendBackupAlertOptions['status'],
  message: string,
  error?: Error | string
): Promise<void> {
  if (!ALERT_BOT_TOKEN || !ALERT_CHAT_ID) {
    console.warn('Telegram alert credentials not configured. Skipping alert.');
    return;
  }

  const statusEmoji = status === 'success' ? '✅' : '❌';
  const statusText = status === 'success' ? 'SUCCESS' : 'FAILURE';

  let fullMessage = `${statusEmoji} *${statusText}*\n\n${message}`;

  if (error) {
    const errorText = error instanceof Error ? error.message : String(error);
    fullMessage += `\n\n*Error:*\n\`${errorText}\``;
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await sendTelegramMessage(fullMessage);
      console.log(`Telegram alert sent successfully (attempt ${attempt})`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`Failed to send Telegram alert (attempt ${attempt}/${MAX_RETRIES}):`, lastError.message);

      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(`Failed to send Telegram alert after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Sends a message to Telegram via Bot API
 */
function sendTelegramMessage(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: ALERT_CHAT_ID,
      text: text,
      parse_mode: 'Markdown',
    });

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${ALERT_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Telegram API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Utility delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
