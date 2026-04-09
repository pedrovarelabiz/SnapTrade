import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '@/services/subscriptionService';

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: subscriptionService.getPlans });
}

export function useMySubscription() {
  return useQuery({ queryKey: ['subscription'], queryFn: subscriptionService.getMySubscription });
}

export function usePaymentHistory() {
  return useQuery({ queryKey: ['payments'], queryFn: subscriptionService.getPaymentHistory });
}
