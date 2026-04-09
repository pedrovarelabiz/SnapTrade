# Listener Architecture

## Overview

This document describes the architecture of the listener system for processing signals and orders.

## Signal Matching Algorithm

The signal matching algorithm employs a **3-tier approach** to match incoming signals with existing orders, ensuring accuracy while handling edge cases like race conditions and timing variations.

### Three-Tier Matching Strategy

1. **Exact Expiration Matching with Tolerance**
   - Primary matching strategy that looks for orders with expiration dates matching the signal
   - Applies a configurable time tolerance window to account for minor timing differences
   - This tier handles the majority of normal signal-to-order matches

2. **Race Condition Detection**
   - Identifies scenarios where signals arrive before order records are fully committed
   - Detects patterns indicating concurrent signal/order creation
   - Provides retry logic and buffering to handle timing conflicts gracefully

3. **Proximity Fallback**
   - Fallback mechanism when exact matching fails
   - Matches signals to orders based on proximity criteria (closest match by time/attributes)
   - Ensures signals are not lost when exact matching is impossible

### Matching Flowchart

```
┌─────────────────────────┐
│  Incoming Signal        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│ Tier 1: Exact Expiration Matching       │
│ - Check for orders with matching exp    │
│ - Apply tolerance window (±N seconds)   │
└───────────┬─────────────────────────────┘
            │
            ├─── Match Found? ──Yes──► Match Complete
            │
            No
            │
            ▼
┌─────────────────────────────────────────┐
│ Tier 2: Race Condition Detection        │
│ - Check for concurrent creation pattern │
│ - Evaluate timing indicators            │
│ - Apply retry logic if needed           │
└───────────┬─────────────────────────────┘
            │
            ├─── Race Detected? ──Yes──► Retry/Buffer Signal
            │
            No
            │
            ▼
┌─────────────────────────────────────────┐
│ Tier 3: Proximity Fallback              │
│ - Find closest order by timestamp       │
│ - Match on secondary attributes         │
│ - Apply proximity threshold             │
└───────────┬─────────────────────────────┘
            │
            ├─── Match Found? ──Yes──► Match Complete
            │
            No
            │
            ▼
┌─────────────────────────┐
│  Log Unmatched Signal   │
│  Trigger Alert          │
└─────────────────────────┘
```

### Benefits of the 3-Tier Approach

- **Accuracy**: Exact expiration matching with tolerance ensures precise signal-to-order correlation
- **Resilience**: Race condition detection prevents data inconsistencies from concurrent operations
- **Completeness**: Proximity fallback ensures maximum signal matching rate
- **Observability**: Clear tier progression enables better debugging and monitoring

## Implementation Details

The 3-tier matching algorithm is implemented in the listener service with configurable parameters for each tier, allowing fine-tuning based on operational requirements.

### Martingale Times Format

The `martingale_times` parameter is an array of time duration strings that defines the progression of expiration times for martingale strategies. Each entry specifies a time offset from the initial signal creation.

**Format**: `["5m", "10m", "15m", "30m", "1h"]`

The system uses these values to calculate exact expiration timestamps for orders. When a signal is created, the `martingale_times` array determines when each subsequent order in the martingale sequence should expire.

**Supported Time Formats**:
- `Xm` - Minutes (e.g., "5m" = 5 minutes)
- `Xh` - Hours (e.g., "2h" = 2 hours)
- `Xs` - Seconds (e.g., "30s" = 30 seconds)

Example: A signal created at 10:00 AM with `martingale_times: ["5m", "10m", "15m"]` would generate orders with expiration times at 10:05 AM, 10:10 AM, and 10:15 AM respectively.
