# Expiration Time Field Specification

## Overview
The `expiration_time` field represents when a trading signal expires and is no longer valid for execution.

## Data Type
- **Type**: DateTime
- **Format**: ISO 8601 string (e.g., `2026-03-23T14:30:00Z`)
- **Timezone**: UTC

## Calculation
The expiration time is calculated as:
```
expiration_time = signal_time + martingale_minutes
```

Where:
- `signal_time`: The timestamp when the signal was generated (DateTime)
- `martingale_minutes`: The duration in minutes for which the signal remains valid (Integer)

## Storage Location
- **Model**: Signal
- **Field Name**: `expiration_time`
- **Database Column**: `expiration_time` (DateTime)

## Example Values

### Example 1: Short-term signal
```json
{
  "signal_time": "2026-03-23T10:00:00Z",
  "martingale_minutes": 5,
  "expiration_time": "2026-03-23T10:05:00Z"
}
```

### Example 2: Medium-term signal
```json
{
  "signal_time": "2026-03-23T14:30:00Z",
  "martingale_minutes": 15,
  "expiration_time": "2026-03-23T14:45:00Z"
}
```

### Example 3: Long-term signal
```json
{
  "signal_time": "2026-03-23T09:00:00Z",
  "martingale_minutes": 60,
  "expiration_time": "2026-03-23T10:00:00Z"
}
```

## Usage Notes
- Signals should not be executed after their expiration_time
- The expiration_time is calculated and stored when the signal is created
- All times are stored and transmitted in UTC format
- ISO 8601 string format ensures compatibility across systems
