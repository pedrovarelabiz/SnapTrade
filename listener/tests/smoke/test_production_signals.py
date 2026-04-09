#!/usr/bin/env python3
"""Smoke test for signal matching on real production data.

This test loads the last 100 real production signals from the database,
runs both the legacy and new matching algorithms, and compares results.
Any discrepancies are logged for manual review.
"""

import os
import sys
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directories to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

from listener import ChannelHandler

UTC = timezone.utc

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ProductionSignalSmokeTest:
    """Smoke test runner for production signal matching."""

    def __init__(self, database_url: str):
        """Initialize with database connection.

        Args:
            database_url: PostgreSQL connection string
        """
        self.database_url = database_url
        self.conn = None
        self.discrepancies = []
        self.total_comparisons = 0
        self.matches = 0

    def connect_db(self):
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(self.database_url)
            logger.info("✓ Connected to database successfully")
        except Exception as e:
            logger.error(f"✗ Failed to connect to database: {e}")
            raise

    def close_db(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            logger.info("✓ Database connection closed")

    def load_last_100_production_signals(self) -> List[Dict]:
        """Load the last 100 real production signals from database.

        Returns:
            List of signal dictionaries from production
        """
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # Query to fetch last 100 production signals
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
            ORDER BY created_at DESC
            LIMIT 100
        """

        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        # Convert database rows to signal format
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

        logger.info(f"✓ Loaded last 100 production signals from database")
        return signals

    def run_smoke_test(self, signals: List[Dict]):
        """Run new matching algorithm on production signals and compare with old.

        Args:
            signals: List of production signals to test
        """
        logger.info("\n" + "="*80)
        logger.info("PRODUCTION SIGNAL MATCHING SMOKE TEST")
        logger.info("="*80 + "\n")

        # Create handler instance for matching functions
        handler = ChannelHandler(
            channel_id="smoke_test",
            channel_name="Smoke Test Channel",
            parser_func=None,
            api_base_url="http://test"
        )

        # Test each signal
        for i, test_signal in enumerate(signals):
            # Use other signals as active signals context
            handler.active_signals = [s for s in signals if s['id'] != test_signal['id']]

            self.compare_matching_algorithms(handler, test_signal, i + 1)

        self.print_summary()

    def compare_matching_algorithms(self, handler: ChannelHandler,
                                    signal: Dict, signal_num: int):
        """Compare old and new matching algorithms for a single signal.

        Args:
            handler: ChannelHandler instance
            signal: Signal to test
            signal_num: Signal number for logging
        """
        self.total_comparisons += 1

        # Get signal details
        result_date = signal['resolvedAt']
        if result_date.tzinfo is None:
            result_date = result_date.replace(tzinfo=UTC)

        asset = signal['asset']
        direction = signal['direction']

        try:
            # Run old (legacy) matching algorithm
            old_match = handler.find_matching_signal_legacy(result_date)

            # Run new (enhanced) matching algorithm
            new_match = handler.find_matching_signal(result_date, asset, direction)

            # Extract match IDs
            old_match_id = old_match['id'] if old_match else None
            new_match_id = new_match['id'] if new_match else None

            # Compare results
            if old_match_id == new_match_id:
                self.matches += 1
            else:
                # Log discrepancy
                discrepancy = {
                    'signal_num': signal_num,
                    'signal_id': signal['id'],
                    'asset': asset,
                    'direction': direction,
                    'result_time': result_date.isoformat(),
                    'old_algorithm_match': old_match_id,
                    'new_algorithm_match': new_match_id
                }
                self.discrepancies.append(discrepancy)

                # Log for manual review
                logger.warning(f"\n{'─'*80}")
                logger.warning(f"DISCREPANCY #{len(self.discrepancies)} - Signal #{signal_num}")
                logger.warning(f"{'─'*80}")
                logger.warning(f"Signal ID: {signal['id']}")
                logger.warning(f"Asset: {asset}, Direction: {direction}")
                logger.warning(f"Result Time: {result_date}")
                logger.warning(f"Old Algorithm Match: {old_match_id}")
                logger.warning(f"New Algorithm Match: {new_match_id}")
                if old_match:
                    logger.warning(f"  Old: {old_match['asset']} {old_match['direction']}")
                if new_match:
                    logger.warning(f"  New: {new_match['asset']} {new_match['direction']}")

        except Exception as e:
            logger.error(f"Error comparing signal #{signal_num}: {e}")
            self.discrepancies.append({
                'signal_num': signal_num,
                'signal_id': signal['id'],
                'error': str(e)
            })

    def print_summary(self):
        """Print test summary with discrepancy report."""
        logger.info("\n" + "="*80)
        logger.info("SMOKE TEST SUMMARY")
        logger.info("="*80)
        logger.info(f"Total Signals Tested:  {self.total_comparisons}")
        logger.info(f"Matching Results:      {self.matches} ({self.matches/max(self.total_comparisons,1)*100:.1f}%)")
        logger.info(f"Discrepancies Found:   {len(self.discrepancies)} ({len(self.discrepancies)/max(self.total_comparisons,1)*100:.1f}%)")

        if len(self.discrepancies) == 0:
            logger.info("\n✓ SUCCESS: All 100 production signals match between old and new algorithms!")
        else:
            logger.warning(f"\n⚠ WARNING: Found {len(self.discrepancies)} discrepancies")
            logger.warning("  Manual review required for the differences logged above")

        logger.info("="*80 + "\n")

        return len(self.discrepancies) == 0


def test_production_signals():
    """Main test function - loads last 100 production signals and compares algorithms."""
    # Get database URL from environment
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        logger.warning("DATABASE_URL environment variable not set - skipping smoke test")
        import pytest
        pytest.skip("DATABASE_URL not configured")

    # Initialize and run smoke test
    smoke_test = ProductionSignalSmokeTest(database_url)

    try:
        smoke_test.connect_db()

        # Load last 100 production signals
        signals = smoke_test.load_last_100_production_signals()

        if len(signals) == 0:
            logger.warning("No production signals found in database")
            return True

        # Run smoke test comparing old vs new matching algorithm
        success = smoke_test.run_smoke_test(signals)

        return success

    finally:
        smoke_test.close_db()


if __name__ == '__main__':
    success = test_production_signals()
    sys.exit(0 if success else 1)
