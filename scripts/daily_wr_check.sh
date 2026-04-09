#!/bin/bash
echo "=== WR REPORT $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
sudo -u postgres psql snaptrade_db -c "
SELECT c.slug,
    COUNT(*) as n,
    ROUND(SUM(CASE WHEN s.result='win' AND s.gale_level=0 THEN 1.0 ELSE 0 END)/NULLIF(COUNT(s.result),0)*100,1) as wr_g0,
    ROUND(SUM(CASE WHEN s.result='win' THEN 1.0 ELSE 0 END)/NULLIF(COUNT(s.result),0)*100,1) as wr_total,
    ROUND(AVG(EXTRACT(EPOCH FROM (s.entry_time_utc - s.created_at))/60),1) as avg_gap_min,
    MAX(s.created_at)::date as last_signal
FROM signals s JOIN channels c ON s.channel_id=c.id
WHERE s.result IS NOT NULL
GROUP BY c.slug ORDER BY n DESC;"
echo "---"
