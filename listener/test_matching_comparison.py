#!/usr/bin/env python3
"""Compare legacy vs enhanced signal matching on real historical data.

This script loads resolved signals from the database, runs both
find_matching_signal_legacy() and find_matching_signal() on the same data,
and reports any differences to validate the enhanced logic doesn't break
existing scenarios.
"""

import os
import sys
from datetime import datetime, timezone
from collections import defaultdict
from typing import Dict, List, Tuple, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from listener import ChannelHandler

UTC = timezone.utc


class MatchingComparator:
    """Compare legacy and enhanced signal matching algorithms."""

    def __init__(self, database_url: str):
        """Initialize with database connection."""
        self.database_url = database_url
        self.conn = None
        self.differences = []
        self.total_tests = 0
        self.matching_results = 0

    def connect_db(self):
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(self.database_url)
            print(f"✓ Connected to database")
        except Exception as e:
            print(f"✗ Failed to connect to database: {e}")
            sys.exit(1)

    def close_db(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")

    def load_historical_signals(self, limit: int = 500) -> List[Dict]:
        """Load resolved signals with results from database.

        Args:
            limit: Maximum number of signals to load

        Returns:
            List of signal dictionaries with resolved results
        """
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        query = """
            SELECT
                id,
                telegram_msg_id,
                channel_id,
                asset,
                direction,
                entry_time_utc,
                expiration_minutes,
                format_version,
                martingale_times,
                status,
                result,
                gale_level,
                result_msg_id,
                resolved_at,
                created_at
            FROM signals
            WHERE status = 'resolved'
              AND resolved_at IS NOT NULL
              AND result IS NOT NULL
            ORDER BY resolved_at DESC
            LIMIT %s
        """

        cursor.execute(query, (limit,))
        rows = cursor.fetchall()
        cursor.close()

        # Convert to dict format matching active_signals structure
        signals = []
        for row in rows:
            sig = {
                'id': row['id'],
                'telegramMsgId': row['telegram_msg_id'],
                'channelId': row['channel_id'],
                'asset': row['asset'],
                'direction': row['direction'],
                'entryTimeUtc': row['entry_time_utc'].isoformat(),
                'expirationMinutes': row['expiration_minutes'],
                'formatVersion': row['format_version'],
                'martingaleTimes': row['martingale_times'] or [],
                'status': 'pending',  # Simulate as pending for matching
                'result': row['result'],
                'galeLevel': row['gale_level'],
                'resolvedAt': row['resolved_at'],
                'createdAt': row['created_at']
            }
            signals.append(sig)

        print(f"✓ Loaded {len(signals)} resolved signals from database")
        return signals

    def run_comparison(self, signals: List[Dict]):
        """Run both matching algorithms and compare results.

        For each signal, simulate the result message arriving at resolved_at time,
        then run both legacy and enhanced matching to see which signal they select.
        """
        print("\n" + "="*80)
        print("MATCHING COMPARISON REPORT")
        print("="*80 + "\n")

        # Create handler instance for matching functions
        handler = ChannelHandler(
            channel_id="test",
            channel_name="Test Channel",
            parser_func=None,
            api_base_url="http://test"
        )

        # Group signals by time buckets to simulate concurrent scenarios
        time_buckets = defaultdict(list)
        for sig in signals:
            # Round to nearest 5 minutes to group nearby signals
            resolved_time = sig['resolvedAt']
            bucket_key = resolved_time.replace(second=0, microsecond=0)
            bucket_key = bucket_key.replace(minute=(bucket_key.minute // 5) * 5)
            time_buckets[bucket_key].append(sig)

        print(f"Testing {len(signals)} signals grouped into {len(time_buckets)} time buckets\n")

        for bucket_time, bucket_signals in sorted(time_buckets.items()):
            if len(bucket_signals) < 2:
                # Skip buckets with only one signal (no ambiguity to test)
                continue

            # Test each signal in this bucket
            for test_signal in bucket_signals:
                self.test_single_signal(handler, test_signal, bucket_signals)

        self.print_summary()

    def test_single_signal(self, handler: ChannelHandler,
                          test_signal: Dict,
                          active_signals: List[Dict]):
        """Test matching for a single signal.

        Args:
            handler: ChannelHandler instance with matching methods
            test_signal: The signal to test matching for
            active_signals: All signals active at this time
        """
        self.total_tests += 1

        # Set up handler with active signals (excluding the test signal itself to avoid trivial match)
        handler.active_signals = [s for s in active_signals if s['id'] != test_signal['id']]

        # Simulate result arriving at resolved time
        result_date = test_signal['resolvedAt']
        if result_date.tzinfo is None:
            result_date = result_date.replace(tzinfo=UTC)

        # Extract asset and direction for enhanced matching
        asset = test_signal['asset']
        direction = test_signal['direction']

        # Run legacy matching
        legacy_match = handler.find_matching_signal_legacy(result_date)

        # Run enhanced matching
        enhanced_match = handler.find_matching_signal(result_date, asset, direction)

        # Compare results
        legacy_id = legacy_match['id'] if legacy_match else None
        enhanced_id = enhanced_match['id'] if enhanced_match else None

        if legacy_id == enhanced_id:
            self.matching_results += 1
        else:
            # Results differ - record the difference
            diff = {
                'test_signal_id': test_signal['id'],
                'asset': asset,
                'direction': direction,
                'result_time': result_date,
                'active_count': len(handler.active_signals),
                'legacy_match': legacy_id,
                'enhanced_match': enhanced_id
            }
            self.differences.append(diff)

            # Print detailed difference
            if len(self.differences) <= 10:  # Only print first 10 to avoid spam
                self.print_difference(diff, test_signal, legacy_match, enhanced_match)

    def print_difference(self, diff: Dict, test_signal: Dict,
                        legacy_match: Optional[Dict],
                        enhanced_match: Optional[Dict]):
        """Print detailed information about a matching difference."""
        print(f"\n{'─'*80}")
        print(f"DIFFERENCE #{len(self.differences)}")
        print(f"{'─'*80}")
        print(f"Test Signal: {test_signal['id'][:8]}... | {test_signal['asset']} {test_signal['direction']}")
        print(f"Result Time: {diff['result_time']}")
        print(f"Active Signals: {diff['active_count']}")
        print(f"\nLegacy Match:   {diff['legacy_match'][:8] if diff['legacy_match'] else 'NONE'}...")
        if legacy_match:
            print(f"  └─ {legacy_match['asset']} {legacy_match['direction']} @ {legacy_match['entryTimeUtc']}")
        print(f"\nEnhanced Match: {diff['enhanced_match'][:8] if diff['enhanced_match'] else 'NONE'}...")
        if enhanced_match:
            print(f"  └─ {enhanced_match['asset']} {enhanced_match['direction']} @ {enhanced_match['entryTimeUtc']}")

    def print_summary(self):
        """Print comparison summary."""
        print("\n" + "="*80)
        print("SUMMARY")
        print("="*80)
        print(f"Total Tests:       {self.total_tests}")
        print(f"Matching Results:  {self.matching_results} ({self.matching_results/max(self.total_tests,1)*100:.1f}%)")
        print(f"Differences Found: {len(self.differences)} ({len(self.differences)/max(self.total_tests,1)*100:.1f}%)")

        if len(self.differences) == 0:
            print("\n✓ SUCCESS: All matches are identical! Enhanced logic is backward compatible.")
        else:
            print(f"\n⚠ WARNING: Found {len(self.differences)} differences between algorithms.")
            print("  Review the differences above to ensure enhanced logic behaves correctly.")

        print("="*80 + "\n")


def main():
    """Main entry point."""
    print("\n" + "="*80)
    print("SIGNAL MATCHING COMPARISON TEST")
    print("Legacy vs Enhanced Algorithm Validation")
    print("="*80 + "\n")

    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("✗ Error: DATABASE_URL environment variable not set")
        sys.exit(1)

    # Create comparator and run tests
    comparator = MatchingComparator(database_url)

    try:
        comparator.connect_db()
        signals = comparator.load_historical_signals(limit=500)

        if len(signals) == 0:
            print("⚠ No resolved signals found in database. Cannot run comparison.")
            return

        comparator.run_comparison(signals)

    except Exception as e:
        print(f"\n✗ Error during comparison: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        comparator.close_db()


if __name__ == '__main__':
    main()
