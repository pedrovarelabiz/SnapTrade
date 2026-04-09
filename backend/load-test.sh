#!/bin/bash
# Simple load testing script using curl
# Usage: ./load-test.sh <url> <total_requests> <concurrent> <output_file>

URL="${1:-http://localhost:3001/api/health}"
TOTAL="${2:-5000}"
CONCURRENT="${3:-50}"
OUTPUT="${4:-load-test-results.txt}"

echo "Load Test Configuration:"
echo "URL: $URL"
echo "Total Requests: $TOTAL"
echo "Concurrent: $CONCURRENT"
echo "Output: $OUTPUT"
echo ""

# Clean up previous results
> "$OUTPUT"

# Function to make a single request and measure time
make_request() {
    local id=$1
    local time=$(curl -s -o /dev/null -w "%{time_total}" "$URL" 2>&1)
    echo "$time" >> "$OUTPUT"
}

export -f make_request
export URL OUTPUT

echo "Starting load test at $(date)..."
START_TIME=$(date +%s)

# Run requests in parallel batches
for ((batch=0; batch<$TOTAL; batch+=$CONCURRENT)); do
    batch_size=$CONCURRENT
    if [ $((batch + CONCURRENT)) -gt $TOTAL ]; then
        batch_size=$((TOTAL - batch))
    fi

    # Launch concurrent requests
    for ((i=0; i<$batch_size; i++)); do
        make_request $((batch + i)) &
    done

    # Wait for this batch to complete
    wait

    # Progress indicator
    completed=$((batch + batch_size))
    printf "\rProgress: %d/%d (%.1f%%)" $completed $TOTAL $(echo "scale=1; $completed * 100 / $TOTAL" | bc)
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "Load test completed at $(date)"
echo "Duration: ${DURATION}s"
echo ""

# Calculate statistics
if [ -f "$OUTPUT" ]; then
    # Sort response times
    sort -n "$OUTPUT" -o "$OUTPUT.sorted"

    TOTAL_REQUESTS=$(wc -l < "$OUTPUT.sorted")
    AVG=$(awk '{sum+=$1} END {print sum/NR}' "$OUTPUT.sorted")
    MIN=$(head -1 "$OUTPUT.sorted")
    MAX=$(tail -1 "$OUTPUT.sorted")

    # Calculate percentiles
    P50_LINE=$(echo "($TOTAL_REQUESTS * 50 / 100)" | bc)
    P95_LINE=$(echo "($TOTAL_REQUESTS * 95 / 100)" | bc)
    P99_LINE=$(echo "($TOTAL_REQUESTS * 99 / 100)" | bc)

    P50=$(sed -n "${P50_LINE}p" "$OUTPUT.sorted")
    P95=$(sed -n "${P95_LINE}p" "$OUTPUT.sorted")
    P99=$(sed -n "${P99_LINE}p" "$OUTPUT.sorted")

    echo "Results:"
    echo "  Total Requests: $TOTAL_REQUESTS"
    echo "  Duration: ${DURATION}s"
    echo "  Requests/sec: $(echo "scale=2; $TOTAL_REQUESTS / $DURATION" | bc)"
    echo ""
    echo "Response Times (seconds):"
    echo "  Min:  $MIN"
    echo "  Avg:  $AVG"
    echo "  P50:  $P50"
    echo "  P95:  $P95"
    echo "  P99:  $P99"
    echo "  Max:  $MAX"

    # Clean up
    rm -f "$OUTPUT.sorted"
fi
