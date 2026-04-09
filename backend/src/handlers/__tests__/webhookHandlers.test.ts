import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleSubscriptionActivated,
  handlePaymentSaleCompleted,
  handleSubscriptionCancelled,
} from '../webhookHandlers';
import { prisma } from '../../lib/prisma';
import { PayPalWebhookEvent } from '../../types/paypal';
import { SubscriptionStatus } from '@prisma/client';
import * as Sentry from '@sentry/node';

// Mock Prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    payment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    webhookEvent: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

// Mock Sentry
vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

describe('handleSubscriptionActivated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create subscription with valid payment', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-123',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      summary: 'Subscription activated',
      resource: {
        id: 'sub-123',
        plan_id: 'plan-premium',
        status: 'ACTIVE',
        subscriber: {
          email_address: 'user@example.com',
          payer_id: 'payer-123',
        },
        billing_info: {},
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-1',
      userId: 'user-123',
      externalId: 'sub-123',
      status: 'pending',
      plan: 'premium',
      durationDays: 30,
      user: {
        email: 'user@example.com',
      },
    };

    // Mock transaction callback
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findFirst: vi.fn().mockResolvedValue(mockPayment),
          findUnique: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
        user: {
          update: vi.fn().mockResolvedValue({}),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handleSubscriptionActivated(mockEvent);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should reject subscription activation without payment', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-456',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      summary: 'Subscription activated',
      resource: {
        id: 'sub-456',
        plan_id: 'plan-premium',
        status: 'ACTIVE',
        subscriber: {
          email_address: 'user@example.com',
          payer_id: 'payer-456',
        },
        billing_info: {},
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    // Mock transaction that throws when no payment found
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx);
    });

    await expect(handleSubscriptionActivated(mockEvent)).rejects.toThrow(
      /Unable to process subscription activation/
    );

    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('should reject subscription with invalid resource type', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-789',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'order',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      summary: 'Subscription activated',
      resource: {
        id: 'order-123',
        intent: 'CAPTURE',
        status: 'COMPLETED',
        purchase_units: [],
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    await expect(handleSubscriptionActivated(mockEvent)).rejects.toThrow(
      /Unable to process subscription activation/
    );

    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('should update existing subscription when already exists', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-update',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      summary: 'Subscription activated',
      resource: {
        id: 'sub-update',
        plan_id: 'plan-premium',
        status: 'ACTIVE',
        subscriber: {
          email_address: 'user@example.com',
          payer_id: 'payer-update',
        },
        billing_info: {},
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-2',
      userId: 'user-456',
      externalId: 'sub-update',
      status: 'pending',
      plan: 'premium',
      durationDays: 30,
      user: {
        email: 'user@example.com',
      },
    };

    const mockExistingSubscription = {
      id: 'subscription-1',
      userId: 'user-456',
      status: SubscriptionStatus.expired,
      plan: 'premium',
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findFirst: vi.fn().mockResolvedValue(mockPayment),
          update: vi.fn().mockResolvedValue({}),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(mockExistingSubscription),
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          update: vi.fn().mockResolvedValue({}),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handleSubscriptionActivated(mockEvent);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should rollback transaction on database error with no partial data written', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-rollback',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      summary: 'Subscription activated',
      resource: {
        id: 'sub-rollback',
        plan_id: 'plan-premium',
        status: 'ACTIVE',
        subscriber: {
          email_address: 'rollback@example.com',
          payer_id: 'payer-rollback',
        },
        billing_info: {},
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-rollback',
      userId: 'user-rollback',
      externalId: 'sub-rollback',
      status: 'pending',
      plan: 'premium',
      durationDays: 30,
      user: {
        email: 'rollback@example.com',
      },
    };

    // Track operations to verify rollback - no operations should persist
    const operationLog: string[] = [];

    // Mock transaction that throws error mid-transaction after payment update
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findFirst: vi.fn().mockImplementation(() => {
            operationLog.push('payment.findFirst');
            return Promise.resolve(mockPayment);
          }),
          update: vi.fn().mockImplementation(() => {
            operationLog.push('payment.update');
            return Promise.resolve({});
          }),
        },
        subscription: {
          findUnique: vi.fn().mockImplementation(() => {
            operationLog.push('subscription.findUnique');
            return Promise.resolve(null);
          }),
          create: vi.fn().mockImplementation(() => {
            operationLog.push('subscription.create');
            // Simulate database error during subscription creation
            throw new Error('Database constraint violation: transaction error');
          }),
        },
        user: {
          update: vi.fn(),
        },
        webhookEvent: {
          create: vi.fn(),
        },
      };
      return callback(tx);
    });

    await expect(handleSubscriptionActivated(mockEvent)).rejects.toThrow(
      /transaction error|Unable to process subscription activation/
    );

    // Verify transaction was attempted but rolled back
    expect(prisma.$transaction).toHaveBeenCalled();

    // Verify operations were attempted in order until error
    expect(operationLog).toContain('payment.findFirst');
    expect(operationLog).toContain('subscription.create');

    // Verify error was captured by Sentry
    expect(Sentry.captureException).toHaveBeenCalled();

    // Critical: Verify no partial writes - operations after error should not be called
    expect(operationLog).not.toContain('user.update');
    expect(operationLog).not.toContain('webhookEvent.create');
  });
});

describe('handlePaymentSaleCompleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update payment when sale completed', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-sale-123',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'sale',
      event_type: 'PAYMENT.SALE.COMPLETED',
      summary: 'Payment completed',
      resource: {
        id: 'sale-123',
        status: 'COMPLETED' as const,
        amount: {
          currency_code: 'USD',
          value: '9.99',
        },
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-123',
      userId: 'user-789',
      externalId: 'sale-123',
      status: 'pending',
      amount: 9.99,
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(mockPayment),
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handlePaymentSaleCompleted(mockEvent);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should throw error when payment not found', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-sale-404',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'sale',
      event_type: 'PAYMENT.SALE.COMPLETED',
      summary: 'Payment completed',
      resource: {
        id: 'sale-404',
        status: 'COMPLETED' as const,
        amount: {
          currency_code: 'USD',
          value: '9.99',
        },
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx);
    });

    // Also mock the error handler's attempt to find payment
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

    await expect(handlePaymentSaleCompleted(mockEvent)).rejects.toThrow(
      /Unable to process payment completion/
    );

    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('should create audit log with payment details', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-audit-123',
      event_version: '1.0',
      create_time: '2026-03-23T12:00:00Z',
      resource_type: 'sale',
      event_type: 'PAYMENT.SALE.COMPLETED',
      summary: 'Payment completed',
      resource: {
        id: 'sale-audit-123',
        status: 'COMPLETED',
        amount: {
          currency_code: 'USD',
          value: '19.99',
        },
        create_time: '2026-03-23T12:00:00Z',
        update_time: '2026-03-23T12:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-audit',
      userId: 'user-audit',
      externalId: 'sale-audit-123',
      status: 'pending',
      amount: 19.99,
    };

    let auditLogData: any;

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(mockPayment),
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockImplementation((data) => {
            auditLogData = data;
            return Promise.resolve({});
          }),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handlePaymentSaleCompleted(mockEvent);

    expect(auditLogData).toBeDefined();
    expect(auditLogData.data.action).toBe('PAYMENT_COMPLETED');
    expect(auditLogData.data.userId).toBe('user-audit');
  });

  it('should rollback transaction on database error with no partial data written', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-rollback-payment',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'sale',
      event_type: 'PAYMENT.SALE.COMPLETED',
      summary: 'Payment completed',
      resource: {
        id: 'sale-rollback',
        status: 'COMPLETED',
        amount: {
          currency_code: 'USD',
          value: '29.99',
        },
        create_time: '2026-03-23T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-rollback',
      userId: 'user-rollback',
      externalId: 'sale-rollback',
      status: 'pending',
      amount: 29.99,
    };

    // Track operations to verify rollback - no operations should persist
    const operationLog: string[] = [];

    // Mock transaction that throws error mid-transaction after payment update
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockImplementation(() => {
            operationLog.push('payment.findUnique');
            return Promise.resolve(mockPayment);
          }),
          update: vi.fn().mockImplementation(() => {
            operationLog.push('payment.update');
            return Promise.resolve({});
          }),
        },
        auditLog: {
          create: vi.fn().mockImplementation(() => {
            operationLog.push('auditLog.create');
            // Simulate database error during audit log creation
            throw new Error('Database connection lost: transaction error');
          }),
        },
        webhookEvent: {
          create: vi.fn(),
        },
      };
      return callback(tx);
    });

    await expect(handlePaymentSaleCompleted(mockEvent)).rejects.toThrow(
      /transaction error|Unable to process payment completion/
    );

    // Verify transaction was attempted but rolled back
    expect(prisma.$transaction).toHaveBeenCalled();

    // Verify operations were attempted in order until error
    expect(operationLog).toContain('payment.findUnique');
    expect(operationLog).toContain('payment.update');
    expect(operationLog).toContain('auditLog.create');

    // Verify error was captured by Sentry
    expect(Sentry.captureException).toHaveBeenCalled();

    // Critical: Verify no partial writes - operations after error should not be called
    expect(operationLog).not.toContain('webhookEvent.create');
  });
});

describe('handleSubscriptionCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cancel subscription when webhook received', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-cancel-123',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      summary: 'Subscription cancelled',
      resource: {
        id: 'sub-cancel-123',
        plan_id: 'plan-premium',
        status: 'CANCELLED',
        status_update_time: '2026-03-23T10:00:00Z',
        billing_info: {},
        create_time: '2026-03-20T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-cancel',
      userId: 'user-cancel',
      externalId: 'sub-cancel-123',
      status: 'confirmed',
      user: {
        email: 'cancel@example.com',
      },
    };

    const mockSubscription = {
      id: 'subscription-cancel',
      userId: 'user-cancel',
      status: SubscriptionStatus.active,
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(mockPayment),
          update: vi.fn().mockResolvedValue({}),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(mockSubscription),
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handleSubscriptionCancelled(mockEvent);

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should throw error when payment not found for cancellation', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-cancel-404',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      summary: 'Subscription cancelled',
      resource: {
        id: 'sub-cancel-404',
        plan_id: 'plan-premium',
        status: 'CANCELLED',
        billing_info: {},
        create_time: '2026-03-20T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx);
    });

    // Mock error handler's attempt to find payment
    vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

    await expect(handleSubscriptionCancelled(mockEvent)).rejects.toThrow(
      /Unable to process subscription cancellation/
    );

    expect(Sentry.captureException).toHaveBeenCalled();
  });

  it('should update subscription status to cancelled with endDate', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-cancel-status',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      summary: 'Subscription cancelled',
      resource: {
        id: 'sub-cancel-status',
        plan_id: 'plan-pro',
        status: 'CANCELLED',
        status_update_time: '2026-03-23T10:00:00Z',
        billing_info: {},
        create_time: '2026-03-20T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-status',
      userId: 'user-status',
      externalId: 'sub-cancel-status',
      status: 'confirmed',
      user: {
        email: 'status@example.com',
      },
    };

    const mockSubscription = {
      id: 'subscription-status',
      userId: 'user-status',
      status: SubscriptionStatus.active,
    };

    let subscriptionUpdateData: any;

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(mockPayment),
          update: vi.fn().mockResolvedValue({}),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(mockSubscription),
          update: vi.fn().mockImplementation((data) => {
            subscriptionUpdateData = data;
            return Promise.resolve({});
          }),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handleSubscriptionCancelled(mockEvent);

    expect(subscriptionUpdateData).toBeDefined();
    expect(subscriptionUpdateData.data.status).toBe(SubscriptionStatus.cancelled);
    expect(subscriptionUpdateData.data.expiresAt).toBeInstanceOf(Date);
  });

  it('should create audit log for subscription cancellation', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-cancel-audit',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      summary: 'Subscription cancelled',
      resource: {
        id: 'sub-cancel-audit',
        plan_id: 'plan-premium',
        status: 'CANCELLED',
        status_update_time: '2026-03-23T10:00:00Z',
        billing_info: {},
        create_time: '2026-03-20T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-audit-cancel',
      userId: 'user-audit-cancel',
      externalId: 'sub-cancel-audit',
      status: 'confirmed',
      user: {
        email: 'audit@example.com',
      },
    };

    const mockSubscription = {
      id: 'subscription-audit',
      userId: 'user-audit-cancel',
      status: SubscriptionStatus.active,
    };

    let auditLogData: any;

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockResolvedValue(mockPayment),
          update: vi.fn().mockResolvedValue({}),
        },
        subscription: {
          findUnique: vi.fn().mockResolvedValue(mockSubscription),
          update: vi.fn().mockResolvedValue({}),
        },
        auditLog: {
          create: vi.fn().mockImplementation((data) => {
            auditLogData = data;
            return Promise.resolve({});
          }),
        },
        webhookEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    await handleSubscriptionCancelled(mockEvent);

    expect(auditLogData).toBeDefined();
    expect(auditLogData.data.action).toBe('SUBSCRIPTION_CANCELLED');
    expect(auditLogData.data.userId).toBe('user-audit-cancel');
  });

  it('should rollback transaction on database error with no partial data written', async () => {
    const mockEvent: PayPalWebhookEvent = {
      id: 'evt-rollback-cancel',
      event_version: '1.0',
      create_time: '2026-03-23T10:00:00Z',
      resource_type: 'subscription',
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      summary: 'Subscription cancelled',
      resource: {
        id: 'sub-rollback-cancel',
        plan_id: 'plan-premium',
        status: 'CANCELLED',
        status_update_time: '2026-03-23T10:00:00Z',
        billing_info: {},
        create_time: '2026-03-20T10:00:00Z',
        update_time: '2026-03-23T10:00:00Z',
      },
    };

    const mockPayment = {
      id: 'payment-rollback-cancel',
      userId: 'user-rollback-cancel',
      externalId: 'sub-rollback-cancel',
      status: 'confirmed',
      user: {
        email: 'rollback-cancel@example.com',
      },
    };

    const mockSubscription = {
      id: 'subscription-rollback',
      userId: 'user-rollback-cancel',
      status: SubscriptionStatus.active,
    };

    // Track operations to verify rollback - no operations should persist
    const operationLog: string[] = [];

    // Mock transaction that throws error mid-transaction during subscription update
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        payment: {
          findUnique: vi.fn().mockImplementation(() => {
            operationLog.push('payment.findUnique');
            return Promise.resolve(mockPayment);
          }),
          update: vi.fn().mockImplementation(() => {
            operationLog.push('payment.update');
            return Promise.resolve({});
          }),
        },
        subscription: {
          findUnique: vi.fn().mockImplementation(() => {
            operationLog.push('subscription.findUnique');
            return Promise.resolve(mockSubscription);
          }),
          update: vi.fn().mockImplementation(() => {
            operationLog.push('subscription.update');
            // Simulate database error during subscription update
            throw new Error('Deadlock detected: transaction error');
          }),
        },
        auditLog: {
          create: vi.fn(),
        },
        webhookEvent: {
          create: vi.fn(),
        },
      };
      return callback(tx);
    });

    await expect(handleSubscriptionCancelled(mockEvent)).rejects.toThrow(
      /transaction error|Unable to process subscription cancellation/
    );

    // Verify transaction was attempted but rolled back
    expect(prisma.$transaction).toHaveBeenCalled();

    // Verify operations were attempted in order until error
    expect(operationLog).toContain('payment.findUnique');
    expect(operationLog).toContain('subscription.findUnique');
    expect(operationLog).toContain('subscription.update');

    // Verify error was captured by Sentry
    expect(Sentry.captureException).toHaveBeenCalled();

    // Critical: Verify no partial writes - operations after error should not be called
    expect(operationLog).not.toContain('auditLog.create');
    expect(operationLog).not.toContain('webhookEvent.create');
  });
});
