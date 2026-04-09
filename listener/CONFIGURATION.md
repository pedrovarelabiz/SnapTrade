# Listener Configuration

This document describes all environment variables used to configure the listener service.

## Environment Variables

### EXACT_MATCH_TOLERANCE_SECONDS

**Description**: Time window in seconds for matching exact trade events between WebSocket messages and API responses.

**Default**: `5`

**Range**: `1-10`

**Production Recommended**: `5`

**Usage**: Determines how close in time two trade events must occur to be considered an exact match. Lower values require stricter timing precision, while higher values allow more flexibility but may increase false positives.

### PROXIMITY_MATCH_WINDOW_MINUTES

**Description**: Time window in minutes for proximity-based matching of trade events when exact matches are not found.

**Default**: `30`

**Range**: `10-60`

**Production Recommended**: `30`

**Usage**: Defines the broader time window used to find potentially related trades when exact matching fails. This fallback mechanism helps identify trades that may have slight timing discrepancies.

### MAX_RECONNECT_DELAY_SECONDS

**Description**: Maximum delay in seconds between WebSocket reconnection attempts using exponential backoff.

**Default**: `300` (5 minutes)

**Production Recommended**: `300`

**Usage**: Caps the reconnection delay to prevent indefinitely long wait times. The actual delay increases exponentially from the initial delay up to this maximum value.

### INITIAL_RECONNECT_DELAY_SECONDS

**Description**: Initial delay in seconds before the first WebSocket reconnection attempt.

**Default**: `1`

**Production Recommended**: `1`

**Usage**: Sets the starting point for the exponential backoff strategy. Subsequent reconnection attempts will increase the delay exponentially until reaching MAX_RECONNECT_DELAY_SECONDS.

### HEALTHCHECK_PORT

**Description**: Port number on which the HTTP health check endpoint listens.

**Default**: `8080`

**Production Recommended**: `8080`

**Usage**: The health check server listens on this port and responds to HTTP requests at `/health` and `/healthz` endpoints. Used by container orchestration systems to verify service availability.

## Production Configuration Example

```bash
# Matching configuration
EXACT_MATCH_TOLERANCE_SECONDS=5
PROXIMITY_MATCH_WINDOW_MINUTES=30

# Reconnection strategy
INITIAL_RECONNECT_DELAY_SECONDS=1
MAX_RECONNECT_DELAY_SECONDS=300

# Health monitoring
HEALTHCHECK_PORT=8080
```

## Configuration Guidelines

1. **Exact Match Tolerance**: Use the default value of 5 seconds for most production environments. Only adjust if you observe systematic timing differences in your infrastructure.

2. **Proximity Window**: The 30-minute default provides a good balance between catching delayed trades and avoiding false matches. Increase for systems with known latency issues.

3. **Reconnection Delays**: The default exponential backoff from 1 to 300 seconds is suitable for most scenarios, providing quick recovery from transient issues while preventing server overload during prolonged outages.

4. **Health Check Port**: Ensure the configured port is accessible to your monitoring and orchestration systems.
