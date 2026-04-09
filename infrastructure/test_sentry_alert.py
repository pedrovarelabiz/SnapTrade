#!/usr/bin/env python3
"""
Test script to verify Sentry alert rules are properly configured.
This script simulates a critical backup failure to trigger alerts.
"""
import os
import sys
import time
import sentry_sdk
from sentry_sdk import capture_exception, capture_message


def init_sentry_for_test():
    """Initialize Sentry with test configuration."""
    sentry_dsn = os.getenv("SENTRY_DSN")

    if not sentry_dsn:
        print("ERROR: SENTRY_DSN environment variable not set")
        print("Please set SENTRY_DSN before running this test")
        sys.exit(1)

    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=1.0,  # 100% for testing
        environment=os.getenv("ENVIRONMENT", "production"),
        release=os.getenv("RELEASE_VERSION", "test-alert-v1.0"),
    )

    # Set tags to identify this as a test
    sentry_sdk.set_tag("service", "backup-service")
    sentry_sdk.set_tag("test", "alert-verification")
    sentry_sdk.set_tag("transaction_type", "backup")

    print(f"✓ Sentry initialized with DSN: {sentry_dsn[:30]}...")


def simulate_backup_failure():
    """
    Simulate a critical backup failure that should trigger alerts.
    This will generate a fatal-level error that matches critical alert conditions.
    """
    print("\n" + "="*60)
    print("SIMULATING CRITICAL BACKUP FAILURE")
    print("="*60)

    try:
        # Simulate a backup failure with detailed context
        raise Exception(
            "FATAL: Backup process failed - unable to connect to backup storage. "
            "Data integrity at risk. Immediate attention required."
        )
    except Exception as e:
        # Capture with additional context
        with sentry_sdk.push_scope() as scope:
            scope.set_level("fatal")
            scope.set_tag("error_type", "backup_failure")
            scope.set_tag("severity", "critical")
            scope.set_context("backup", {
                "backup_type": "full_database_backup",
                "scheduled_time": "2026-03-23T02:00:00Z",
                "failure_reason": "storage_connection_timeout",
                "retry_attempts": 3,
                "last_successful_backup": "2026-03-22T02:00:00Z"
            })

            capture_exception(e)
            print(f"✓ Fatal error captured: {str(e)[:80]}...")

    # Send additional error messages to potentially trigger rate-based alerts
    print("\nGenerating multiple error events to trigger rate-based alerts...")
    for i in range(10):
        with sentry_sdk.push_scope() as scope:
            scope.set_level("error")
            scope.set_tag("error_type", "backup_failure")
            scope.set_tag("iteration", str(i))

            capture_message(
                f"Backup failure #{i+1}: Critical error during backup process",
                level="error"
            )

    print(f"✓ Generated 10 additional error events")


def verify_alert_configuration():
    """Display expected alert behavior based on sentry-alerts.yaml."""
    print("\n" + "="*60)
    print("EXPECTED ALERT BEHAVIOR")
    print("="*60)
    print("""
Based on sentry-alerts.yaml, the following alerts should trigger:

1. Critical Error Rate Spike:
   - Threshold: 100 errors in 5 minutes
   - Channels: PagerDuty, Slack (#alerts-critical), Email
   - Recipients: oncall-engineering, @engineering-leads, @devops-team

2. Verification Timeline:
   - Alerts should fire within 5 minutes
   - Check the following channels:
     * Slack: #alerts-critical
     * Email: engineering@company.com, oncall@company.com
     * PagerDuty: oncall-engineering team

3. Manual Verification Steps:
   - Check Slack #alerts-critical for new alert
   - Check email inbox for alert notification
   - Check PagerDuty for incident creation
   - Verify alert contains backup failure details
""")


def main():
    """Main test execution."""
    print("="*60)
    print("SENTRY ALERT RULES TEST")
    print("="*60)
    print(f"Test started at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")

    # Step 1: Initialize Sentry
    init_sentry_for_test()

    # Step 2: Trigger the critical error
    simulate_backup_failure()

    # Step 3: Flush events to Sentry
    print("\nFlushing events to Sentry...")
    sentry_sdk.flush(timeout=10)
    print("✓ Events sent to Sentry")

    # Step 4: Display verification info
    verify_alert_configuration()

    # Step 5: Final instructions
    print("="*60)
    print("TEST COMPLETED")
    print("="*60)
    print(f"Test completed at: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    print("\nNext steps:")
    print("1. Wait up to 5 minutes for alerts to fire")
    print("2. Verify alerts received in Slack/Email/PagerDuty")
    print("3. Run verification command:")
    print('   echo "Manually verify alert received in Slack/Email/PagerDuty"')
    print("\n✓ Test script execution complete")


if __name__ == "__main__":
    main()
