#!/usr/bin/env python3
"""Script to run performance benchmark and save results to JSON."""

import json
import time
from datetime import datetime, timezone
from listener import ChannelHandler

def run_benchmark():
    """Run performance benchmark and return results."""
    # Create channel config for testing
    channel_config = {
        "id": "test-channel-id",
        "slug": "test-channel",
        "name": "Test Channel",
        "timezone": "UTC",
        "sourceFormat": "blacklist_inline",
        "maxGaleLevel": 2,
        "telegramId": "123456",
        "telegramName": "test_channel"
    }

    handler = ChannelHandler(channel_config)

    # Create 100 active signals with various assets and times
    base_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
    assets = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "EURJPY"]
    directions = ["CALL", "PUT"]

    for i in range(100):
        signal = {
            "asset": assets[i % len(assets)],
            "direction": directions[i % len(directions)],
            "entryTimeUtc": (base_time.replace(minute=i % 60)).isoformat(),
            "expirationMinutes": 5,
            "martingaleTimes": []
        }
        handler.active_signals.append(signal)

    # Measure execution time for 1000 calls
    test_date = datetime(2024, 1, 1, 10, 30, 0, tzinfo=timezone.utc)
    test_asset = "EURUSD"

    start_time = time.time()
    for _ in range(1000):
        handler.find_matching_signal(test_date, test_asset)
    end_time = time.time()

    # Calculate metrics
    total_time_ms = (end_time - start_time) * 1000
    avg_time_per_call_ms = total_time_ms / 1000

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "num_signals": 100,
        "num_iterations": 1000,
        "total_time_ms": round(total_time_ms, 3),
        "avg_time_per_call_ms": round(avg_time_per_call_ms, 4),
        "test_asset": test_asset,
        "test_date": test_date.isoformat()
    }

if __name__ == "__main__":
    print("Running performance benchmark...")
    results = run_benchmark()

    output_file = "benchmark_results_baseline.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"Benchmark results saved to {output_file}")
    print(f"Average time per call: {results['avg_time_per_call_ms']:.4f}ms")
    print(f"Total time for {results['num_iterations']} calls: {results['total_time_ms']:.3f}ms")
