import { StatsI'll start with the full audit, then implement the Signal Result Tracking system.

---

## Full Status Audit

### Pages/Routes

| Route | Page | Status |
|---|---|---|
| `/` | Index (Landing) | ✅ Fully implemented — hero, features, how-it-works, yesterday results, testimonials, pricing preview, CTA |
| `/pricing` | Pricing | ✅ Fully implemented — monthly/yearly toggle, FAQ accordion, payment methods |
| `/login` | Login | ✅ Fully implemented — form, demo quick-login, error handling |
| `/register` | Register | ✅ Fully implemented — form, validation, terms checkbox |
| `/verify-email` | VerifyEmail | ✅ Stub — shows "already verified" for demo |
| `/forgot-password` | ForgotPassword | ✅ Fully implemented — form + success state |
| `/reset-password` | ResetPassword | ✅ Fully implemented — form + success state |
| `/dashboard` | Dashboard | ✅ Fully implemented — welcome banner, today stats, streak, weekly chart, live signal feed, filters, sound toggle, scroll-to-top, what's-new modal |
| `/analytics` | Analytics | ✅ Fully implemented — stats cards, 4 charts, asset table, date range filter, locked overlays for free |
| `/reports` | Reports | ✅ Fully implemented — summary chart, report list/detail, date range, CSV export, locked for free |
| `/subscription` | Subscription | ✅ Fully implemented — current plan card, payment history, cancel modal |
| `/settings` | Settings | ✅ Fully implemented — 4 tabs (profile, notifications, display, extension), extension locked for free |
| `/admin` | AdminOverview | ✅ Fully implemented — overview cards, revenue chart, activity feed |
| `/admin/users` | AdminUsers | ✅ Fully implemented — user table with search/filter/role change |
| `/admin/config` | AdminConfig | ✅ Fully implemented — platform config form + signal manager |
| `/admin/revenue` | AdminRevenue | ✅ Fully implemented — revenue stats panel |
| `*` | NotFound | ✅ Fully implemented |

### Components

| Component | Status | Notes |
|---|---|---|
| **Layout** |||
| PublicLayout | ✅ Full | Header, footer, mobile menu |
| DashboardLayout | ✅ Full | Sidebar + mobile nav wrapper |
| AppSidebar | ✅ Full | Collapsible, tooltips, admin section |
| MobileNav | ✅ Full | All tabs + admin + account popup |
| AuthGuard | ✅ Full | Branded loading, role check |
| **Signals** |||
| SignalCard | ✅ Full | Direction, status, countdown, martingale, OTC badge. **No P&L display, no result type** |
| SignalFeed | ✅ Full | Sorting, locked cards for free |
| SignalDetailModal | ✅ Full | Full signal info, copy-to-clipboard |
| SignalFilters | ✅ Full | Status + direction filters |
| SignalCounterBadge | ✅ Full | Free signal usage tracker |
| LockedSignalCard | ✅ Full | Blurred + upgrade CTA |
| InstantBadge | ✅ Full | Countdown for instant signals |
| NewSignalToast | ✅ Full | Toast notification |
| ScrollToTopButton | ✅ Full | Unseen signal counter |
| **Dashboard** |||
| WelcomeBanner | ✅ Full | Greeting, market status, CTA |
| TodayStats | ✅ Full | 6 stat cards. **No P&L stat** |
| StreakVisualization | ✅ Full | Last 20 results bar |
| WeeklyMiniChart | ✅ Full | 7-day win/loss bars |
| LiveIndicator | ✅ Full | Connection status |
| SoundToggle | ✅ Full | Persisted preference |
| MarketStatus | ✅ Full | UTC time, session indicators |
| QuickActions | ✅ Full | Nav shortcuts + export |
| ConnectionBanner | ✅ Full | Disconnection warning |
| **Analytics** |||
| StatsCards | ✅ Full | 7 KPI cards. **No P&L cards** |
| WinRateChart | ✅ Full | Line chart |
| AssetPerformanceChart | ✅ Full | Horizontal bar chart |
| AssetPerformanceTable | ✅ Full | Leaderboard table |
| HourlyDistribution | ✅ Full | Bar chart by hour |
| PnlCurve | ✅ Full | Area chart — **shows win count, not monetary P&L** |
| LockedChartOverlay | ✅ Full | Blur + upgrade CTA |
| **Reports** |||
| ReportList | ✅ Full | Grid of report cards |
| ReportCard | ✅ Full | Summary stats. **No P&L, no gale breakdown** |
| ReportDetail | ✅ Full | Expanded view. **No P&L, no gale breakdown** |
| ReportsSummaryChart | ✅ Full | Win rate trend bars |
| **Subscription** |||
| CurrentPlanCard | ✅ Full | |
| PaymentHistory | ✅ Full | |
| CancelModal | ✅ Full | |
| **Admin** |||
| AdminOverviewCards | ✅ Full | |
| RevenueStatsPanel | ✅ Full | |
| UserTable | ✅ Full | |
| PlatformConfigForm | ✅ Full | |
| SignalManager | ✅ Full | |
| RecentActivityFeed | ✅ Full | |
| **Shared** |||
| All shared components | ✅ Full | Logo, PremiumBadge, StatusBadge, CountdownTimer, UpgradeCTA, DateRangeFilter, WhatsNewModal, RoleSwitcher, EmptyState, skeletons |
| **Landing** |||
| All landing components | ✅ Full | YesterdayResults, ResultCard, BlurredResultRow, ResultsSummaryBar, ResultsTicker, HowItWorks |
| **Extension** |||
| ExtensionSettings | ✅ Full | 7 config sections |

### Services

| Service | Functions | Mock Quality |
|---|---|---|
| authService | login, register, logout, getMe, switchRole, verifyEmail, forgotPassword, resetPassword | ✅ Good — localStorage persistence |
| signalService | getSignals, subscribeToSignals, updateSignalResult | ✅ Good — real signal data, live generation. **No result tracking fields** |
| statsService | getOverview, getByAsset, getByHour, getPnlCurve, getWinRateHistory | ⚠️ **PnL data is win-count based, not monetary** |
| reportService | getReports, getReportByDate | ⚠️ **No gale breakdown, no P&L** |
| subscriptionService | getPlans, getMySubscription, getPaymentHistory, cancelSubscription | ✅ Good |
| adminService | getUsers, updateUser, getPlatformConfig, updatePlatformConfig, getRevenueStats | ✅ Good |
| extensionService | getExtensionConfig, updateExtensionConfig, generateToken | ✅ Good |

### What works end-to-end
- Full auth flow, signal feed with live generation, filtering, sorting, detail modal
- Analytics with all charts (locked for free), Reports with date filtering and CSV export
- Subscription management, Settings with all 4 tabs, Admin dashboard with all 4 sub-pages
- Landing page, mobile responsive navigation

### What's visually broken or incomplete
- Nothing visually broken
- **P&L completely absent** — no monetary tracking anywhere
- **Result type (direct victory vs gale win) not tracked or displayed**
- **PnL curve shows cumulative win count, not dollar amounts**

### What's missing from the plan
- Signal result tracking (resultType, resultGaleLevel, resultTimestamp)
- P&L calculation engine, result message parser/matcher
- P&L display on signal cards, P&L KPIs in analytics, gale breakdown in reports

### Current route config
All 17 routes in App.tsx with AuthGuard and role protection.

### Current sidebar/nav items
Sidebar: Signals, Analytics, Reports, Subscription, Settings + Admin (Overview, Users, Config, Revenue)
Mobile: Signals, Analytics, Reports, Settings, Admin (if admin), Account

---

Now implementing the full Signal Result Tracking system.

<dyad-write path="src/types/index.ts" description="Adding ResultType, TradeExecution, PnlBreakdown types and result tracking fields to Signal, gale breakdown to DailyReport, P&L to StatsOverview">
export type UserRole = 'free' | 'premium' | 'admin';
export type SignalStatus = 'pending' | 'active' | 'win' | 'loss' | 'skipped' | 'expired';
export type SignalDirection = 'CALL' | 'PUT';
export type SignalType = 'scheduled' | 'instant';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'trial';
export type PaymentMethod = 'btc' | 'eth' | 'usdt' | 'paypal';
export type PaymentStatus = 'completed' | 'pending' | 'failed' | 'refunded';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1';
export type ResultType = 'direct_victory' | 'victory_at_gale' | 'loss';

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

export interface TradeExecution {
  level: number;
  amount: number;
  result: 'win' | 'loss';
}

export interface PnlBreakdown {
  baseAmount: number;
  tradesExecuted: TradeExecution[];
  totalInvested: number;
  totalReturn: number;
  netPnl: number;
  payoutRate: number;
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

  // Result tracking
  resultType?: ResultType;
  resultGaleLevel?: number;
  resultTimestamp?: string;
  resultRawText?: string;

  // P&L calculation
  pnl?: PnlBreakdown;
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

  // P&L and gale breakdown
  dailyPnl?: number;
  directWins?: number;
  gale1Wins?: number;
  gale2Wins?: number;
  fullLosses?: number;
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
  totalPnl?: number;
  avgPnlPerSignal?: number;
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