import { Resend } from 'resend';
import { logger } from './logger.js';

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  throw new Error('RESEND_API_KEY environment variable is required');
}
const resend = new Resend(apiKey);

const emailFrom = process.env.EMAIL_FROM;
if (!emailFrom) {
  throw new Error('EMAIL_FROM environment variable is required');
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<void> {
  if (!toEmail || !resetUrl) {
    throw new Error('toEmail and resetUrl are required');
  }

  const encodedUrl = encodeURI(resetUrl);
  const escapedDisplay = resetUrl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const { error } = await resend.emails.send({
    from: emailFrom!,
    to: toEmail,
    subject: 'Reset your SnapTrade password',
    text: `Click the link below to reset your password. It expires in 1 hour.\n\n${resetUrl}`,
    html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${encodedUrl}">${escapedDisplay}</a></p>`,
  });

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`);
  }

  logger.info({ to: toEmail }, 'Password reset email sent successfully');
}
