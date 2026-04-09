import { apiGet, apiPost } from './api';
import type { Subscription, Plan, Payment } from '../types';
import * as Sentry from '@sentry/react';

export const subscriptionService = {
  async getPlans(): Promise<Plan[]> {
    try {
      return await apiGet<Plan[]>('/subscriptions/plans');
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'plans_fetch' } });
      // Fallback plans if endpoint not implemented yet
      return [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          currency: 'USD',
          features: ['3 signals/day', 'Basic analytics', 'Email support'],
          signalsPerDay: 3,
        },
        {
          id: 'premium_monthly',
          name: 'Premium Monthly',
          price: 29.99,
          currency: 'USD',
          features: ['Unlimited signals', 'Full analytics', 'Real-time alerts', 'Priority support', 'Extension access'],
          signalsPerDay: 'unlimited',
          isPopular: true,
        },
        {
          id: 'premium_yearly',
          name: 'Premium Yearly',
          price: 19.99,
          yearlyPrice: 239.88,
          currency: 'USD',
          features: ['Unlimited signals', 'Full analytics', 'Real-time alerts', 'Priority support', 'Extension access', '33% savings'],
          signalsPerDay: 'unlimited',
        },
      ];
    }
  },

  async getMySubscription(): Promise<Subscription> {
    try {
      return await apiGet<Subscription>('/subscriptions/my-subscription');
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'activation_expiry' } });
      return {
        id: 'free-default',
        plan: 'free',
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        autoRenew: false,
      };
    }
  },

  async getPaymentHistory(): Promise<Payment[]> {
    try {
      return await apiGet<Payment[]>('/subscriptions/payment-history');
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'payment_history' } });
      return [];
    }
  },

  async cancelSubscription(reason: string): Promise<boolean> {
    try {
      await apiPost('/subscriptions/cancel', { reason });
      return true;
    } catch (error) {
      Sentry.captureException(error, { tags: { subscription_event: 'cancellation' } });
      return false;
    }
  },
};
