# CircleSfera Predictions API Documentation

## Overview
The Predictions API provides access to CircleSfera's alert pattern analysis and prediction system. This system helps identify recurring patterns in alerts and predict potential future issues.

## Authentication
All endpoints require an API key provided in the `x-api-key` header:
```http
X-API-Key: your-api-key-here
```

## Rate Limits
- Standard endpoints: 100 requests per minute
- Dashboard endpoints: 30 requests per minute

## Endpoints

### Get Predictions
```http
GET /api/predictions
```

Retrieves predicted alerts based on identified patterns.

#### Query Parameters
- `timeframe` (optional): Time window for predictions
  - Valid values: `6h`, `12h`, `24h`, `3d`, `7d`
  - Default: `24h`

#### Response
```json
{
  "timestamp": 1645432800000,
  "timeframe": "24h",
  "predictions": [
    {
      "id": "pattern-http_error_rate-300000",
      "pattern": {
        "types": ["http_error_rate"],
        "severity": "warning",
        "frequency": 0.5
      },
      "prediction": {
        "expectedAt": 1645436400000,
        "confidence": 0.85,
        "dueIn": 3600000,
        "dueInHuman": "1h"
      },
      "history": {
        "occurrences": 10,
        "lastSeen": 1645432800000
      }
    }
  ]
}
```

### Get Analytics Dashboard
```http
GET /api/analytics/dashboard
```

Retrieves comprehensive analytics dashboard with visualizations.

#### Query Parameters
- `timeframe` (optional): Time window for analysis
  - Valid values: `6h`, `12h`, `24h`, `3d`, `7d`
  - Default: `24h`

#### Response
```json
{
  "timestamp": 1645432800000,
  "timeframe": "24h",
  "analytics": {
    "summary": {
      "totalAlerts": 150,
      "trend": "increasing",
      "hasSeasonality": true,
      "strongPatterns": 3
    },
    "timeSeries": {
      "trend": "increasing",
      "seasonality": {
        "daily": true,
        "weekly": false,
        "monthly": false
      },
      "forecasts": [...]
    },
    "distribution": {
      "byHour": {...},
      "byDay": {...},
      "byType": {...},
      "bySeverity": {...}
    },
    "patterns": [...],
    "visualizations": {
      "timeSeriesChart": {...},
      "distributionCharts": {...},
      "patternConfidenceChart": {...}
    }
  }
}
```

### Get Prediction Accuracy
```http
GET /api/predictions/accuracy
```

Retrieves accuracy metrics for the prediction system.

#### Response
```json
{
  "timestamp": 1645432800000,
  "metrics": {
    "totalPredictions": 100,
    "verifiedPredictions": 80,
    "averageAccuracy": 0.85,
    "highConfidenceAccuracy": 0.92,
    "byPattern": [
      {
        "patternId": "pattern-http_error_rate",
        "predictions": 50,
        "accuracy": 0.88,
        "trend": "improving"
      }
    ],
    "recentTrend": {
      "trend": "improving",
      "confidence": 0.75
    }
  }
}
```

### Generate Test Data (Development Only)
```http
POST /dev/generate-test-data
```

Generates synthetic alert data for testing the prediction system.

#### Request Body
```json
{
  "days": 30,
  "patterns": [
    {
      "type": "http_error_rate",
      "frequency": 24,
      "severity": "warning",
      "jitter": 30
    }
  ]
}
```

#### Response
```json
{
  "generated": 720,
  "timespan": "30 days",
  "patterns": ["http_error_rate"]
}
```

## Error Responses

All endpoints use standard HTTP status codes and return errors in the following format:

```json
{
  "error": "Error message here"
}
```

Common status codes:
- `400`: Invalid request parameters
- `401`: Missing or invalid API key
- `403`: Endpoint not available (dev endpoints in production)
- `429`: Rate limit exceeded
- `500`: Internal server error

## Real-time Analytics

### Client Library

The CircleSfera Analytics Client provides a robust way to connect to real-time analytics with built-in error handling, automatic reconnection, and rate limit management.

```javascript
// Import the client
const { AnalyticsClient } = require('circlesfera-client');

// Create a client instance
const client = new AnalyticsClient({
  url: 'https://api.circlesfera.com/analytics',
  apiKey: 'your-api-key',
  retry: {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 10000,
    factor: 2
  },
  autoReconnect: true
});

// Listen for connection events
client.on('connected', () => {
  console.log('Connected to analytics service');
  // Subscribe to updates
  client.subscribe({
    timeframe: '24h',
    interval: 5000
  });
});

// Handle updates
client.on('update', (data) => {
  console.log('Received analytics update:', data);
});

// Handle errors
client.on('error', (error) => {
  console.error('Analytics error:', error);
});

// Handle reconnection events
client.on('reconnecting', ({ attempt, delay }) => {
  console.log(`Reconnecting (attempt ${attempt}) in ${delay}ms`);
});

// Handle rate limits
client.on('rate_limited', ({ delay }) => {
  console.log(`Rate limited, backing off for ${delay}ms`);
});

// Export data
client.exportData({
  format: 'json',
  type: 'full',
  timeframe: '24h'
})
.then(data => console.log('Exported data:', data))
.catch(error => console.error('Export error:', error));

// Connect to the service
client.connect();
```

### WebSocket Connection
```javascript
const socket = io('https://api.circlesfera.com/analytics', {
  auth: {
    token: 'your-api-key'  // Required for authentication
  }
});

// Handle connection errors
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

### Subscribe to Updates
```javascript
socket.emit('subscribe', {
  timeframe: '24h',  // Valid values: 1h, 6h, 12h, 24h, 3d, 7d
  interval: 5000     // Update interval in milliseconds (5000-300000)
});
```

### Receive Updates
```javascript
socket.on('analytics_update', (data) => {
  console.log('Received analytics update:', data);
});
```

### Export Analytics
```javascript
// Request export with options
socket.emit('export', {
  format: 'json', // or 'csv'
  type: 'full',   // or 'summary', 'timeSeries', 'patterns'
  timeframe: '24h'
});

// Receive exported data
socket.on('export_ready', (response) => {
  const { data, format, type, timestamp } = response;
  console.log('Exported analytics:', data);
});
```

Available export types:
- `full`: Complete analytics dataset
- `summary`: Basic metrics and statistics
- `timeSeries`: Time-based data and forecasts
- `patterns`: Detected patterns and confidence levels

### Error Handling
```javascript
socket.on('error', (error) => {
  console.error('Analytics error:', error);
});

socket.on('export_error', (error) => {
  console.error('Export error:', error);
});
```

## WebSocket Rate Limits

The WebSocket API implements the following rate limits:

- Maximum connections per IP: 5
- Maximum events per minute: 600 (10 per second)
- Export operations count towards rate limits
- Rate limits are tracked per IP address
- Exceeding rate limits will result in error events
- Connection limits result in connection rejection

### Rate Limit Errors

```javascript
socket.on('error', (error) => {
  if (error.message.includes('Rate limit exceeded')) {
    // Handle rate limiting
    console.error('Rate limit exceeded, waiting before retry');
  }
});
```

### Best Practices

1. Implement exponential backoff for reconnection attempts
2. Use appropriate update intervals (minimum 5 seconds)
3. Handle rate limit errors gracefully
4. Monitor connection status
5. Batch operations when possible

## Best Practices

1. Always specify timeframes appropriate to your use case
2. Monitor prediction accuracy to adjust pattern detection sensitivity
3. Use high confidence predictions (>0.7) for automated actions
4. Regularly review prediction trends for system health
5. In development, use test data generation to validate pattern detection
6. For real-time monitoring, use WebSocket connections with appropriate intervals

## Changelog

### v1.0.0
- Initial release with basic prediction capabilities
- Pattern detection and analysis
- Accuracy tracking
- Development tools

### v1.1.0
- Added prediction confidence scoring
- Improved pattern matching algorithm
- Added trend analysis
- Development test data generation

### v1.2.0
- Added analytics dashboard with visualizations
- Enhanced time series analysis
- Added distribution insights
- Pattern confidence visualization

### v1.3.0
- Added real-time analytics via WebSocket
- Added analytics data export functionality (JSON/CSV)
- Improved visualization capabilities
- Added configurable update intervals

### v1.3.1
- Added WebSocket authentication for analytics
- Enhanced export options with type filtering
- Improved CSV formatting for different data types
- Added export response metadata

### v1.3.2
- Added WebSocket rate limiting
- Added connection limits per IP address
- Enhanced error handling for rate limits
- Added exponential backoff recommendations

### v1.3.3
- Added AnalyticsClient library for WebSocket connections
- Implemented automatic reconnection with exponential backoff
- Added rate limit handling with dynamic interval adjustment
- Added timeout handling for export operations
