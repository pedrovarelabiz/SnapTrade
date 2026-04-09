# Telegram Listener

## Signal Matching Algorithm

The listener implements a 3-tier matching approach to accurately route incoming Telegram signals to the correct processing handlers:

1. **Channel-based routing** - Primary tier for channel-specific signals
2. **Pattern matching** - Secondary tier for message content analysis
3. **Fallback handlers** - Tertiary tier for unmatched signals

This architecture resolves D3 duplicate signal issues and significantly improves matching accuracy for high-frequency signal channels. For detailed implementation specifics, see [ARCHITECTURE.md](./ARCHITECTURE.md) and [D3_RACE_CONDITION_FIX.md](./D3_RACE_CONDITION_FIX.md).

## Testing Signal Matching

### Running Unit Tests

Execute the test suite using pytest:

```bash
pytest listener/tests/
```

For verbose output with detailed matching logs:

```bash
pytest -v listener/tests/
```

### Testing Race Condition Scenarios

The test suite includes race condition tests that simulate concurrent signal processing:

```bash
# Run only race condition tests
pytest listener/tests/ -k "race"

# Run with multiple iterations to increase likelihood of catching timing issues
pytest listener/tests/ -k "race" --count=100
```

### Simulating High-Frequency Signal Scenarios

Use the signal analysis tools to test high-frequency signal handling:

```bash
# Enable debug mode for detailed matching logs
export SIGNAL_MATCHING_DEBUG=true

# Run the listener with simulated high-frequency signals
python -m listener.tools.signal_simulator --frequency high --duration 60

# Analyze matching accuracy after simulation
python -m listener.tools.analyze_matching --report
```

## Crash Recovery Configuration

The listener includes robust crash recovery and monitoring capabilities controlled by the following environment variables:

### Alert Configuration

**`ALERT_BOT_TOKEN`** (required when crash alerts enabled)
- Telegram bot token for sending crash alerts
- Obtain from [@BotFather](https://t.me/botfather)
- Example: `ALERT_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

**`ALERT_CHAT_ID`** (required when crash alerts enabled)
- Telegram chat ID where alerts will be sent
- Can be a user ID or group chat ID
- Example: `ALERT_CHAT_ID=-1001234567890`

**`ENABLE_CRASH_ALERTS`** (optional, default: `true`)
- Feature flag to enable/disable crash alert notifications
- Set to `false` to disable alerts while keeping other crash recovery features
- Example: `ENABLE_CRASH_ALERTS=true`

### Reconnection Behavior

**`INITIAL_RECONNECT_DELAY_SECONDS`** (optional, default: `1`)
- Initial delay in seconds before first reconnection attempt
- Uses exponential backoff, doubling after each failed attempt
- Example: `INITIAL_RECONNECT_DELAY_SECONDS=1`

**`MAX_RECONNECT_DELAY_SECONDS`** (optional, default: `60`)
- Maximum delay in seconds between reconnection attempts
- Prevents backoff from growing indefinitely
- Example: `MAX_RECONNECT_DELAY_SECONDS=60`

### Health Monitoring

**`HEALTHCHECK_PORT`** (optional, default: `0`)
- HTTP port for exposing healthcheck endpoint at `/health`
- Set to `0` to disable healthcheck server
- Returns JSON with connection status and metrics
- Example: `HEALTHCHECK_PORT=8080`

### Debugging

**`SIGNAL_MATCHING_DEBUG`** (optional, default: `false`)
- Set to `true` to enable verbose signal matching logs
- Outputs detailed information about the 3-tier matching process
- Use only for debugging; produces high log volume in production
- Example: `SIGNAL_MATCHING_DEBUG=true`

### Example Configuration

```bash
# Minimal setup with crash alerts
ALERT_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
ALERT_CHAT_ID=-1001234567890
ENABLE_CRASH_ALERTS=true

# Custom reconnection timing
INITIAL_RECONNECT_DELAY_SECONDS=2
MAX_RECONNECT_DELAY_SECONDS=120

# Enable healthcheck endpoint
HEALTHCHECK_PORT=8080

# Enable debug logging for signal matching
SIGNAL_MATCHING_DEBUG=true
```

### Disabling Crash Alerts

To run without crash alerts (useful for development):

```bash
ENABLE_CRASH_ALERTS=false
# ALERT_BOT_TOKEN and ALERT_CHAT_ID not required when disabled
```
