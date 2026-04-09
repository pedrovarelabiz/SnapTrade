import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockResendSend, mockInfo } = vi.hoisted(() => {
  // Set required env vars before emailService.ts module-level guards execute.
  // These must live inside vi.hoisted — it is the only block Vitest guarantees
  // runs before any import (including the module under test).
  process.env.RESEND_API_KEY = 'test-resend-api-key';
  process.env.EMAIL_FROM = 'noreply@test.example.com';
  return {
    mockResendSend: vi.fn(),
    mockInfo: vi.fn(),
  };
});

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return {
      emails: {
        send: mockResendSend,
      },
    };
  }),
}));

vi.mock('../logger.js', () => ({
  logger: { info: mockInfo },
}));

import { sendPasswordResetEmail } from '../emailService.js';

describe('emailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResendSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });
  });

  it('throws when toEmail is missing', async () => {
    await expect(sendPasswordResetEmail('', 'https://example.com/reset')).rejects.toThrow(
      'toEmail and resetUrl are required',
    );
  });

  it('throws when resetUrl is missing', async () => {
    await expect(sendPasswordResetEmail('user@example.com', '')).rejects.toThrow(
      'toEmail and resetUrl are required',
    );
  });

  it('throws when both toEmail and resetUrl are missing', async () => {
    await expect(sendPasswordResetEmail('', '')).rejects.toThrow(
      'toEmail and resetUrl are required',
    );
  });

  it('calls resend.emails.send with the correct recipient', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://example.com/reset/abc');
    expect(mockResendSend).toHaveBeenCalledOnce();
    const call = mockResendSend.mock.calls[0][0];
    expect(call.to).toBe('user@example.com');
  });

  it('calls resend.emails.send with the correct subject', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://example.com/reset/abc');
    const call = mockResendSend.mock.calls[0][0];
    expect(call.subject).toBe('Reset your SnapTrade password');
  });

  it('includes the resetUrl in both text and html body', async () => {
    const resetUrl = 'https://example.com/reset/xyz123';
    await sendPasswordResetEmail('user@example.com', resetUrl);
    const call = mockResendSend.mock.calls[0][0];
    expect(call.text).toContain(resetUrl);
    expect(call.html).toContain(resetUrl);
  });

  it('logs success after sending', async () => {
    await sendPasswordResetEmail('user@example.com', 'https://example.com/reset/abc');
    expect(mockInfo).toHaveBeenCalledOnce();
    expect(mockInfo).toHaveBeenCalledWith(
      { to: 'user@example.com' },
      'Password reset email sent successfully',
    );
  });

  it('encodes a malicious resetUrl so no unescaped <script> tag appears in HTML', async () => {
    const maliciousUrl = '"><script>alert(1)</script>';
    await sendPasswordResetEmail('user@example.com', maliciousUrl);
    const call = mockResendSend.mock.calls[0][0];
    expect(call.html).not.toMatch(/<script>/i);
    expect(call.html).toContain('&lt;script&gt;');
    expect(call.html).toContain('&quot;');
  });

  it('throws when Resend returns an error object', async () => {
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'API rate limit exceeded' } });
    await expect(
      sendPasswordResetEmail('user@example.com', 'https://example.com/reset/abc'),
    ).rejects.toThrow('Resend delivery failed: API rate limit exceeded');
  });
});
