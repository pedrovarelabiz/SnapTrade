#!/bin/bash

# Test script for stale SSE connection cleanup
# This script:
# 1. Starts a test SSE server with timeout cleanup logic
# 2. Runs the stale connection test
# 3. Cleans up the server

set -e

cd "$(dirname "$0")"

echo "========================================"
echo "SSE Stale Connection Cleanup Test"
echo "========================================"
echo ""

# Start the test server in the background
echo "[1/4] Starting test SSE server on port 3002..."
node test-stale-server.mjs > /tmp/sse-test-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "[4/4] Cleaning up..."
  if kill -0 $SERVER_PID 2>/dev/null; then
    echo "Stopping server (PID: $SERVER_PID)..."
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
  echo "Server logs saved to: /tmp/sse-test-server.log"
}

trap cleanup EXIT

# Wait for server to start
echo "[2/4] Waiting for server to start..."
for i in {1..10}; do
  if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "Server is ready!"
    break
  fi
  sleep 1
  if [ $i -eq 10 ]; then
    echo "ERROR: Server failed to start"
    echo "Server logs:"
    cat /tmp/sse-test-server.log
    exit 1
  fi
done

echo ""
echo "[3/4] Running stale connection test..."
echo "This will take approximately 45 seconds..."
echo ""

# Run the test against port 3002
API_URL=http://localhost:3002 node test-stale-connection-cleanup.mjs

TEST_EXIT_CODE=$?

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ TEST PASSED"
else
  echo "❌ TEST FAILED"
  echo ""
  echo "Server logs:"
  tail -50 /tmp/sse-test-server.log
fi

echo ""
echo "Full server logs available at: /tmp/sse-test-server.log"
echo ""

exit $TEST_EXIT_CODE
