import { Plan, Payment, Subscription } from '@/types';

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    features: ['3 signals per day', 'Basic signal info', 'Community access', 'Email support'],
    signalsPerDay: 3,
  },
  {
    id: 'premium_monthly',
    name: 'Premium Monthly',
    price: 49,
    currency: 'USD',
    features: [
      'Unlimited signals',
      'Real-time SSE feed',
      'Full analytics suite',
      'Daily reports',
      'Chrome extension',
      'Priority support',
      'Martingale signals',
      'Custom alerts',
    ],
    signalsPerDay: 'unlimited',
    isPopular: true,
  },
  {
    id: 'premium_yearly',
    name: 'Premium Yearly',
    price: 399,
    yearlyPrice: 399,
    currency: 'USD',
    features: [
      'Everything in Premium Monthly',
      'Save 32% vs monthly',
      'Early access to new features',
      'Dedicated account manager',
      '1-on-1 strategy session',
    ],
    signalsPerDay: 'unlimited',
  },
];

const mockPayments: Payment[] = [
  { id: 'p1', amount: 49, currency: 'USD', method: 'btc', status: 'completed', date: '2024-11-01T10:00:00Z', description: 'Premium Monthly - November 2024' },
  { id: 'p2', amount: 49, currency: 'USD', method: 'btc', status: 'completed', date: '2024-10-01T10:00:00Z', description: 'Premium Monthly - October 2024' },
  { id: 'p3', amount: 49, currency: 'USD', method: 'paypal', status: 'completed', date: '2024-09-01T10:00:00Z', description: 'Premium Monthly - September 2024' },
  { id: 'p4', amount: 49, currency: 'USD', method: 'paypal', status: 'completed', date: '2024-08-01T10:00:00Z', description: 'Premium Monthly - August 2024' },
  { id: 'p5', amount: 49, currency: 'USD', method: 'eth', status: 'refunded', date: '2024-07-01T10:00:00Z', description: 'Premium Monthly - July 2024 (Refunded)' },
];

export const subscriptionService = {
  async getPlans(): Promise<Plan[]> {
    await new Promise(r => setTimeout(r, 300));
    return plans;
  },

  async getMySubscription(): Promise<Subscription> {
    await new Promise(r => setTimeout(r, 300));
    return {
      id: 'sub2',
      plan: 'premium_monthly',
      status: 'active',
      startDate: '2024-11-01T00:00:00Z',
      endDate: '2024-12-01T00:00:00Z',
      autoRenew: true,
      paymentMethod: 'btc',
    };
  },

  async getPaymentHistory(): Promise<Payment[]> {
    await new Promise(r => setTimeout(r, 300));
    return mockPayments;
  },

  async cancelSubscription(_reason: string): Promise<boolean> {
    await new Promise(r => setTimeout(r, 500));
    return true;
  },
};
