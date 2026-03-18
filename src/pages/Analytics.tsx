import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatsCards } from '@/components/analytics/StatsCards';
import { WinRateChart } from '@/components/analytics/WinRateChart';
import { AssetPerformanceChart } from '@/components/analytics/AssetPerformance';
import { HourlyDistribution } from '@/components/analytics/HourlyDistribution';
import { PnlCurve } from '@/components/analytics/PnlCurve';
import { LockedChartOverlay } from '@/components/analytics/LockedChartOverlay';
import { DateRangeFilter, DateRange } from '@/components/shared/DateRangeFilter';
import { StatsSkeletonGrid } from '@/components/shared/StatsSkeletonGrid';
import { ChartSkeleton } from '@/components/shared/ChartSkeleton';
import { useStatsOverview, useAssetPerformance, useHourlyData, usePnlCurve, useWinRateHistory } from '@/hooks/useStats';
import { useAuth } from '@/hooks/useAuth';

function getDaysI'll implement all fixes and enhancements in order. Let me work through each one systematically.

**FIX 1** — Tailwind dynamic class safety across all components
**FIX 2** — Sidebar collapse state lifted to shared context
**FIX 3** — Subscription added to mobile nav
**FIX 4** — Pricing yearly toggle redesigned
**FIX 5** — Date range filters on Analytics and Reports
**ENHANCEMENT** — Updated signal types, mock data, SignalCard, ExtensionSettings, and related types/services

Let's go:

<dyad-write path="src/types/index.ts" description="Updated Signal interface with signalType, martingaleSchedule, and new ExtensionConfig">
export type UserRole = 'free' | 'premium' | 'admin';
export type SignalStatus = 'pending' | 'active' | 'win' | 'loss' | 'skipped' | 'expired';
export type SignalDirection = 'CALL' | 'PUT';
export type SignalType = 'scheduled' | 'instant';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'trial';
export type PaymentMethod = 'btc' | 'eth' | 'usdt' | 'paypal';
export type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
  isVerified: boolean;
  subscription?: Subscription;
}

export interface MartingaleStep {
  level: number;
  time: string;
}

export interface Signal {
  id: string;
  asset: string;
  direction: SignalDirection;
  signalType: SignalType;
  entryTime: string;
  timeframe: Timeframe;
  martingaleLevel: number;
  martingaleSchedule?: MartingaleStep[];
  status: SignalStatus;
  result?: 'win' | 'loss';
  createdAt: string;
  isPremium: boolean;
  confidence: number;
}

export interface Subscription {
  id: string;
  plan: 'free' | 'premium_monthly' | 'premium_yearly';
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  paymentMethod?: PaymentMethod;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  date: string;
  description: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  yearlyPrice?: number;
  currency: string;
  features: string[];
  signalsPerDay: number | 'unlimited';
  isPopular?: boolean;
}

export interface DailyReport {
  id: string;
  date: string;
  totalSignals: number;
  wins: number;
  losses: number;
  skipped: number;
  winRate: number;
  topAsset: string;
  signals: Signal[];
}

export interface PlatformConfig {
  maxFreeSignals: number;
  signalCooldownSeconds: number;
  enabledAssets: string[];
  maintenanceMode: boolean;
  announcementMessage: string;
  minConfidence: number;
}

export interface ExtensionConfig {
  token: string;
  connected: boolean;
  executionMode: 'manual' | 'semi-auto' | 'auto';
  acceptScheduled: boolean;
  acceptInstant: boolean;
  defaultAmount: number;
  instantDelay: number;
  martingaleStrategy: 'off' | 'simple' | 'dynamic';
  maxMartingaleLevels: 1 | 2;
  fixedMultiplier: 1.5 | 2.0 | 2.5 | 3.0;
  autoExecuteMartingale: boolean;
  maxDailyTrades: number;
  maxConsecutiveLosses: number;
  minBalanceProtection: number;
  maxSingleTradeAmount: number;
  soundAlerts: boolean;
  browserNotifications: boolean;
  showOverlay: boolean;
  enabledPairs: string[];
}

export interface StatsOverview {
  totalSignals: number;
  winRate: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  avgSignalsPerDay: number;
}

export interface AssetPerformance {
  asset: string;
  totalSignals: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface HourlyData {
  hour: number;
  signals: number;
  wins: number;
  winRate: number;
}

export interface PnlPoint {
  date: string;
  pnl: number;
  cumulative: number;
}

export interface WinRatePoint {
  date: string;
  winRate: number;
  signals: number;
}

export interface RevenueStats {
  mrr: number;
  totalRevenue: number;
  totalUsers: number;
  activeSubscriptions: number;
  churnRate: number;
  newSubscriptionsThisMonth: number;
  revenueHistory: { month: string; revenue: number }[];
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsed?: string;
}