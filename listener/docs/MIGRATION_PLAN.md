# Database Migration Plan: Signal Expiration Time

## Overview
This document outlines the step-by-step migration plan for adding `expiration_time` to the Signal table, enabling the listener to calculate and send expiration times while maintaining backward compatibility with consumers.

## Migration Steps

1. **Add expiration_time column to Signal table (nullable)**
   - Create database migration to add `expiration_time` column as nullable timestamp
   - Apply migration to development environment first
   - Validate schema changes and test backward compatibility
   - Apply to staging and production environments

2. **Deploy listener changes to calculate/send expiration_time**
   - Deploy updated listener code that calculates `expiration_time` based on signal type
   - Ensure fallback logic is in place for consumers that don't receive expiration_time
   - Verify new signals include both `expires_in` and `expiration_time` fields
   - Monitor logs for successful calculation and transmission

3. **Backfill existing signals if possible**
   - Evaluate feasibility of backfilling historical signals
   - If backfilling: create script to calculate expiration_time from existing data
   - Run backfill in batches to minimize database load
   - Verify data integrity after backfill completion
   - If not backfilling: document why and set retention policy

4. **Monitor fallback usage**
   - Track metrics on consumer fallback calculations
   - Monitor error rates and edge cases
   - Gather feedback from consumer teams
   - Identify consumers not yet using expiration_time
   - Set timeline for deprecating expires_in based on adoption

5. **Eventually make field required**
   - Coordinate with all consumer teams for migration readiness
   - Update validation logic to require expiration_time
   - Create migration to set NOT NULL constraint on expiration_time column
   - Remove fallback logic from consumers
   - Deprecate and remove expires_in field

## Rollback Plan
- If issues arise, revert listener deployment (expiration_time becomes null again)
- Database column remains nullable, so no schema rollback needed initially
- Consumers continue using fallback logic seamlessly

## Success Criteria
- All new signals include valid expiration_time
- Zero consumer errors related to missing expiration_time
- Fallback usage drops to <5% within 2 weeks of deployment
- All consumers successfully migrated before making field required
