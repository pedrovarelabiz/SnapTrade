# Metrics Specification

This document defines the key metrics to track for option attribution and matching performance.

## Metrics

### 1. exact_match_success_rate
**Type:** Rate
**Description:** The percentage of option attributions that succeeded using exact symbol matching (without requiring fallback to proximity matching).
**Calculation:** `(exact_match_successes / total_attribution_attempts) * 100`

### 2. fallback_to_proximity_rate
**Type:** Rate
**Description:** The percentage of option attributions that required fallback to proximity-based matching after exact matching failed.
**Calculation:** `(proximity_fallback_successes / total_attribution_attempts) * 100`

### 3. attribution_ambiguity_count
**Type:** Count
**Description:** The number of cases where multiple candidate options were found during attribution, indicating ambiguous matching scenarios.
**Notes:** Tracks instances where the matcher found more than one potential match for a given option.

### 4. no_match_found_rate
**Type:** Rate
**Description:** The percentage of option attribution attempts that failed to find any matching candidate option.
**Calculation:** `(no_match_found / total_attribution_attempts) * 100`

### 5. avg_expiration_time_delta
**Type:** Average (Time Delta)
**Description:** The average time difference between the option's expiration date and the current date for successfully matched options.
**Calculation:** `sum(expiration_date - match_date) / successful_matches`
**Unit:** Days or seconds (to be determined by implementation)

## Usage

These metrics should be collected and reported to provide visibility into:
- Matching accuracy and reliability
- Frequency of edge cases and ambiguous scenarios
- Performance of the matching algorithm over time
