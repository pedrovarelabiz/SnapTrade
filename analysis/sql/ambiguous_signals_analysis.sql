-- Analyze historical ambiguous signal cases
-- Find signals where 2+ signals existed on the same asset within 5 minutes
-- This helps validate that the D3 fix addresses real-world scenarios

WITH signals_with_buckets AS (
    SELECT
        asset,
        entry_time_utc,
        signal_id,
        direction,
        strategy,
        -- Round to 5-minute buckets
        DATE_TRUNC('minute', entry_time_utc) -
        (EXTRACT(MINUTE FROM entry_time_utc)::int % 5) * INTERVAL '1 minute' AS time_bucket
    FROM signals
    WHERE entry_time_utc IS NOT NULL
)
SELECT
    asset,
    time_bucket,
    COUNT(*) AS signal_count,
    ARRAY_AGG(signal_id ORDER BY entry_time_utc) AS signal_ids,
    ARRAY_AGG(direction ORDER BY entry_time_utc) AS directions,
    ARRAY_AGG(strategy ORDER BY entry_time_utc) AS strategies,
    MIN(entry_time_utc) AS first_signal_time,
    MAX(entry_time_utc) AS last_signal_time,
    EXTRACT(EPOCH FROM (MAX(entry_time_utc) - MIN(entry_time_utc))) AS time_diff_seconds
FROM signals_with_buckets
GROUP BY asset, time_bucket
HAVING COUNT(*) > 1
ORDER BY time_bucket DESC, signal_count DESC, asset;

-- Alternative query using 5-minute rounding
-- SELECT
--     asset,
--     FLOOR(EXTRACT(EPOCH FROM entry_time_utc) / 300) * 300 AS time_bucket_epoch,
--     TO_TIMESTAMP(FLOOR(EXTRACT(EPOCH FROM entry_time_utc) / 300) * 300) AS time_bucket,
--     COUNT(*) AS signal_count,
--     MIN(entry_time_utc) AS first_signal,
--     MAX(entry_time_utc) AS last_signal
-- FROM signals
-- WHERE entry_time_utc IS NOT NULL
-- GROUP BY asset, time_bucket_epoch
-- HAVING COUNT(*) > 1
-- ORDER BY time_bucket_epoch DESC;
