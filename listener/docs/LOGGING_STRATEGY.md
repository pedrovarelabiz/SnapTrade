# Logging Strategy for Option Attribution

## Overview
This document defines the logging strategy for debugging option attribution during position change events.

## Log Events

### 1. Exact Match Success
**When to log**: Option attribution succeeds via exact match with expiration_time delta tolerance

**Log Level**: `INFO`

**Required fields**:
- `event`: `"option_attribution_exact_match"`
- `option_symbol`: The matched option symbol
- `expiration_time_delta_seconds`: Time difference between option and trade expiration
- `strike_price`: Strike price of the matched option
- `option_type`: PUT or CALL
- `trade_id`: ID of the trade being attributed
- `confidence_score`: Always 1.0 for exact matches

**Example**:
```json
{
  "event": "option_attribution_exact_match",
  "option_symbol": "AAPL240315C00150000",
  "expiration_time_delta_seconds": 3600,
  "strike_price": 150.0,
  "option_type": "CALL",
  "trade_id": "trade_123",
  "confidence_score": 1.0
}
```

### 2. Fallback to Proximity Matching
**When to log**: Exact match fails and system falls back to proximity-based matching

**Log Level**: `WARNING`

**Required fields**:
- `event`: `"option_attribution_fallback"`
- `fallback_reason`: Why exact match failed (e.g., "expiration_time_delta_exceeded", "no_exact_symbol_match", "missing_option_data")
- `selected_option_symbol`: The option selected via proximity
- `proximity_score`: Numerical score indicating match quality
- `trade_id`: ID of the trade being attributed
- `confidence_score`: Confidence in the attribution (0.0-1.0)

**Example**:
```json
{
  "event": "option_attribution_fallback",
  "fallback_reason": "expiration_time_delta_exceeded",
  "selected_option_symbol": "AAPL240316C00150000",
  "proximity_score": 0.85,
  "trade_id": "trade_123",
  "confidence_score": 0.75
}
```

### 3. Multiple Candidates
**When to log**: Multiple options match the attribution criteria

**Log Level**: `INFO`

**Required fields**:
- `event`: `"option_attribution_multiple_candidates"`
- `trade_id`: ID of the trade being attributed
- `candidate_count`: Number of matching candidates
- `candidates`: Array of candidate details
  - `option_symbol`: Symbol of each candidate
  - `expiration_time_delta_seconds`: Delta for each candidate
  - `strike_price`: Strike price of each candidate
  - `proximity_score`: Score for each candidate
- `selected_option_symbol`: The final selected option
- `selection_criteria`: How the winner was chosen (e.g., "smallest_expiration_delta", "highest_proximity_score")
- `confidence_score`: Final confidence in the attribution

**Example**:
```json
{
  "event": "option_attribution_multiple_candidates",
  "trade_id": "trade_123",
  "candidate_count": 3,
  "candidates": [
    {
      "option_symbol": "AAPL240315C00150000",
      "expiration_time_delta_seconds": 3600,
      "strike_price": 150.0,
      "proximity_score": 0.95
    },
    {
      "option_symbol": "AAPL240316C00150000",
      "expiration_time_delta_seconds": 86400,
      "strike_price": 150.0,
      "proximity_score": 0.85
    },
    {
      "option_symbol": "AAPL240315C00152500",
      "expiration_time_delta_seconds": 3600,
      "strike_price": 152.5,
      "proximity_score": 0.80
    }
  ],
  "selected_option_symbol": "AAPL240315C00150000",
  "selection_criteria": "smallest_expiration_delta",
  "confidence_score": 0.95
}
```

### 4. Attribution Confidence Score
**When to log**: Every attribution attempt (success or failure)

**Log Level**: `INFO` (high confidence >= 0.8), `WARNING` (medium confidence 0.5-0.8), `ERROR` (low confidence < 0.5)

**Required fields**:
- `event`: `"option_attribution_confidence"`
- `trade_id`: ID of the trade being attributed
- `confidence_score`: Float between 0.0 and 1.0
- `confidence_factors`: Breakdown of factors affecting confidence
  - `exact_match`: Boolean indicating if exact match was found
  - `expiration_time_delta_seconds`: Delta from expected expiration
  - `strike_price_match`: Boolean indicating if strike price matched exactly
  - `option_type_match`: Boolean indicating if option type matched
  - `symbol_match`: Boolean indicating if underlying symbol matched
- `final_attribution`: Whether attribution succeeded or failed

**Example**:
```json
{
  "event": "option_attribution_confidence",
  "trade_id": "trade_123",
  "confidence_score": 0.85,
  "confidence_factors": {
    "exact_match": false,
    "expiration_time_delta_seconds": 7200,
    "strike_price_match": true,
    "option_type_match": true,
    "symbol_match": true
  },
  "final_attribution": true
}
```

## Log Format
All logs should be structured JSON for easy parsing and analysis.

## Retention
Logs should be retained for at least 30 days for debugging and audit purposes.

## Monitoring & Alerts
- Alert on high frequency of fallback events (>10% of attributions)
- Alert on low confidence scores (<0.5) indicating potential data quality issues
- Track exact match success rate as a key metric
