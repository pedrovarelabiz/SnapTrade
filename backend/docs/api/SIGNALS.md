# Signal API Documentation

## Overview

The Signal API provides endpoints for managing binary options trading signals. Signals represent trading opportunities with specific entry times, assets, and directions.

## Base URL

All signal endpoints are prefixed with `/api/signals`

---

## Endpoints

### GET /api/signals

Retrieves a paginated list of signals with optional filtering.

#### Authentication

Optional - public endpoint but returns additional data for authenticated users.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number (min: 1) |
| `limit` | number | No | 20 | Results per page (min: 1, max: 100) |
| `asset` | string | No | - | Filter by asset symbol (e.g., "EURUSD") |
| `status` | string | No | - | Filter by status: "pending", "active", "expired", "resolved" |
| `from` | string | No | - | Filter signals from this date (ISO 8601) |
| `to` | string | No | - | Filter signals to this date (ISO 8601) |
| `channel` | string | No | - | Filter by channel slug |

#### Response Format

```json
{
  "signals": [
    {
      "id": "clx123abc",
      "asset": "EURUSD",
      "direction": "CALL",
      "entryTimeUtc": "2026-03-23T14:30:00.000Z",
      "expirationMinutes": 5,
      "expirationTime": "2026-03-23T14:35:00.000Z",
      "martingale_times": ["14:30", "14:35", "14:40"],
      "status": "active",
      "visibility": "free",
      "result": null,
      "galeLevel": null,
      "formatVersion": 1,
      "createdAt": "2026-03-23T14:25:00.000Z",
      "channel": {
        "name": "Premium Signals",
        "slug": "premium-signals"
      }
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

#### curl Example

```bash
curl "https://api.example.com/api/signals?page=1&limit=10&asset=EURUSD&status=active"
```

---

### GET /api/signals/:id

Retrieves a single signal by ID.

#### Authentication

Optional - public endpoint but returns additional data for authenticated users.

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Signal ID (CUID format) |

#### Response Format

```json
{
  "id": "clx123abc",
  "telegramMsgId": 12345,
  "channelId": "clx456def",
  "asset": "EURUSD",
  "direction": "PUT",
  "entryTimeUtc": "2026-03-23T14:30:00.000Z",
  "expirationMinutes": 5,
  "expirationTime": "2026-03-23T14:35:00.000Z",
  "formatVersion": 1,
  "martingale_times": ["14:30", "14:35", "14:40"],
  "status": "resolved",
  "visibility": "premium",
  "result": "win",
  "galeLevel": 1,
  "resultMsgId": 12346,
  "resolvedAt": "2026-03-23T14:35:30.000Z",
  "rawText": "📊 EURUSD\n⬇️ PUT\n⏰ 14:30",
  "createdAt": "2026-03-23T14:25:00.000Z",
  "channel": {
    "name": "Premium Signals",
    "slug": "premium-signals",
    "maxGaleLevel": 2
  }
}
```

#### Response Codes

- `200 OK` - Signal found and returned
- `404 Not Found` - Signal does not exist
- `500 Internal Server Error` - Server error

#### curl Example

```bash
curl "https://api.example.com/api/signals/clx123abc"
```

---

### GET /api/signals/stream

Server-Sent Events (SSE) stream for real-time signal updates.

#### Authentication

**Required** - Bearer token or query parameter `token`

#### Headers

```
Authorization: Bearer <token>
```

Or use query parameter:
```
?token=<extension_token>
```

#### Event Types

The stream emits the following event types:

##### `signal:new`
Emitted when a new signal is created.

```json
{
  "id": "clx123abc",
  "asset": "EURUSD",
  "direction": "CALL",
  "entryTimeUtc": "2026-03-23T14:30:00.000Z",
  "visibility": "free",
  "status": "pending",
  "channel": {
    "name": "Premium Signals",
    "slug": "premium-signals"
  }
}
```

##### `signal:active`
Emitted when a signal becomes active.

```json
{
  "id": "clx123abc",
  "asset": "EURUSD",
  "direction": "CALL",
  "entryTimeUtc": "2026-03-23T14:30:00.000Z",
  "visibility": "free",
  "channel": {
    "name": "Premium Signals",
    "slug": "premium-signals"
  }
}
```

##### `signal:result`
Emitted when a signal is resolved with a result.

```json
{
  "id": "clx123abc",
  "asset": "EURUSD",
  "direction": "CALL",
  "result": "win",
  "galeLevel": 0,
  "channel": {
    "name": "Premium Signals",
    "slug": "premium-signals"
  }
}
```

#### curl Example

```bash
curl -N "https://api.example.com/api/signals/stream" \
  -H "Authorization: Bearer <your_token>"
```

#### Response Codes

- `200 OK` - SSE stream established
- `401 Unauthorized` - Missing or invalid authentication
- `503 Service Unavailable` - Too many connections

---

### GET /api/signals/yesterday-summary

Retrieves a summary of yesterday's signal performance.

#### Authentication

None required - public endpoint

#### Response Format

```json
{
  "date": "2026-03-22",
  "total": 48,
  "wins": 38,
  "losses": 10,
  "winRate": 79.2,
  "byChannel": {
    "premium-signals": {
      "total": 25,
      "wins": 20,
      "losses": 5,
      "winRate": 80.0
    },
    "pro-trader": {
      "total": 23,
      "wins": 18,
      "losses": 5,
      "winRate": 78.3
    }
  }
}
```

#### curl Example

```bash
curl "https://api.example.com/api/signals/yesterday-summary"
```

---

### POST /api/signals

Creates a new signal.

#### Authentication

**Required** - Bearer token

#### Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

#### Request Body

```json
{
  "telegramMsgId": 12345,
  "channelId": "clx456def",
  "asset": "EURUSD",
  "direction": "CALL",
  "entryTimeUtc": "2026-03-23T14:30:00.000Z",
  "expirationMinutes": 5,
  "expirationTime": "2026-03-23T14:35:00.000Z",
  "formatVersion": 1,
  "martingaleTimes": ["14:30", "14:35", "14:40"],
  "rawText": "📊 EURUSD\n⬆️ CALL\n⏰ 14:30"
}
```

#### Request Body Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `telegramMsgId` | number | No | Telegram message ID (for duplicate detection) |
| `channelId` | string | No | Channel ID this signal belongs to |
| `asset` | string | Yes | Asset symbol (e.g., "EURUSD", "BTCUSD") |
| `direction` | string | Yes | Trade direction: "CALL" or "PUT" |
| `entryTimeUtc` | string | Yes | Entry time in UTC (ISO 8601) |
| `expirationMinutes` | number | No | Expiration duration in minutes (default: 5) |
| `expirationTime` | string | No | Expiration time in UTC (ISO 8601) |
| `formatVersion` | number | No | Signal format version (default: 1) |
| `martingaleTimes` | string[] | No | Array of martingale entry times (HH:MM format) |
| `rawText` | string | No | Original raw text of the signal |

#### Response Format

Returns the created signal object (same format as GET /api/signals/:id).

#### Response Codes

- `201 Created` - Signal created successfully
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Missing or invalid authentication
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

#### curl Example

```bash
curl -X POST "https://api.example.com/api/signals" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "EURUSD",
    "direction": "CALL",
    "entryTimeUtc": "2026-03-23T14:30:00.000Z",
    "expirationMinutes": 5,
    "martingaleTimes": ["14:30", "14:35", "14:40"]
  }'
```

---

### PUT/PATCH /api/signals/:id

Updates a signal's status.

#### Authentication

**Required** - Bearer token

#### Headers

```
Authorization: Bearer <token>
Content-Type: application/json
```

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Signal ID (CUID format) |

#### Request Body

```json
{
  "status": "active"
}
```

#### Request Body Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | Yes | New status: "pending", "active", "expired", or "resolved" |

#### Response Format

Returns the updated signal object.

#### Response Codes

- `200 OK` - Signal updated successfully
- `400 Bad Request` - Invalid request body
- `401 Unauthorized` - Missing or invalid authentication
- `404 Not Found` - Signal does not exist
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

#### curl Example

```bash
curl -X PUT "https://api.example.com/api/signals/clx123abc" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

---

## Signal Schema

### Signal Object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | string | No | Unique signal identifier (CUID) |
| `telegramMsgId` | number | Yes | Telegram message ID for duplicate detection |
| `channelId` | string | Yes | ID of the channel this signal belongs to |
| `asset` | string | No | Trading asset symbol (e.g., "EURUSD", "BTCUSD") |
| `direction` | string | No | Trade direction: "CALL" (up) or "PUT" (down) |
| `entryTimeUtc` | string | No | Entry time in UTC (ISO 8601 datetime) |
| `expirationMinutes` | number | No | Expiration duration in minutes (default: 5) |
| `expirationTime` | string | Yes | Calculated expiration time in UTC (ISO 8601 datetime) |
| `formatVersion` | number | No | Signal format version number |
| `martingale_times` | string[] | No | **Array of time strings (e.g., ['5m', '10m']) representing expiration times for each martingale iteration. Used for exact result attribution.** |
| `status` | enum | No | Signal status: "pending", "active", "expired", or "resolved" |
| `visibility` | enum | No | Signal visibility: "free" or "premium" |
| `result` | enum | Yes | Trade outcome: "win" or "loss" (null until resolved) |
| `galeLevel` | number | Yes | Martingale level at which signal won (0 = first entry, 1 = first gale, etc.) |
| `resultMsgId` | number | Yes | Telegram message ID of the result announcement |
| `resolvedAt` | string | Yes | Timestamp when signal was resolved (ISO 8601) |
| `rawText` | string | Yes | Original raw text of the signal from source |
| `createdAt` | string | No | Timestamp when signal was created (ISO 8601) |
| `channel` | object | Yes | Channel information (when included) |

### Status Enum Values

- `pending` - Signal created but not yet active
- `active` - Signal is active and tradeable
- `expired` - Signal has expired without being traded
- `resolved` - Signal has been resolved with a result (win/loss)

### Visibility Enum Values

- `free` - Signal is available to all users
- `premium` - Signal is only available to premium subscribers

### Trade Outcome Enum Values

- `win` - Signal resulted in a winning trade
- `loss` - Signal resulted in a losing trade

---

## Rate Limits

- **Maximum requests**: 100 requests per minute per IP address
- **Burst allowance**: 20 requests per second

When rate limit is exceeded:
- Server returns `429 Too Many Requests`
- Response includes `Retry-After` header with seconds to wait

---

## Martingale Times Field

The `martingale_times` field is critical for implementing Martingale (Gale) trading strategies:

- **Type**: Array of strings in `HH:MM` format (24-hour time)
- **Purpose**: Specifies multiple entry times for the same signal
- **Usage**: If the first trade at `martingale_times[0]` loses, enter again at `martingale_times[1]`, and so on
- **Example**: `["14:30", "14:35", "14:40"]` means:
  - Primary entry at 14:30
  - First gale (MG1) at 14:35 if first loses
  - Second gale (MG2) at 14:40 if second loses
- **Gale Level**: The `galeLevel` field indicates which martingale entry won (0 = primary, 1 = MG1, 2 = MG2)

### Example Martingale Flow

```json
{
  "asset": "EURUSD",
  "direction": "CALL",
  "entryTimeUtc": "2026-03-23T14:30:00.000Z",
  "martingale_times": ["14:30", "14:35", "14:40"],
  "result": "win",
  "galeLevel": 1
}
```

This indicates:
- Primary trade at 14:30 lost
- First gale at 14:35 won (galeLevel = 1)
- Second gale at 14:40 was not needed

---

## Security Considerations

1. **Authentication**: Use Bearer tokens for protected endpoints
2. **Rate Limiting**: Implement client-side rate limiting to avoid 429 errors
3. **HTTPS Only**: Always use HTTPS in production
4. **Input Validation**: Validate all input data before sending requests
5. **Token Storage**: Store authentication tokens securely

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message description"
}
```

Common error codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid auth)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error
- `503` - Service Unavailable (too many SSE connections)
