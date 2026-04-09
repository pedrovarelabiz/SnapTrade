# Changelog

## [Unreleased]

## [v2.1.0] - 2026-03-23
### Fixed
- **D3**: Signal Result Attribution Race Condition - Enhanced find_matching_signal() with 3-tier algorithm using exact expiration time from martingale_times array, asset matching, and direction bonus. Prevents mis-attribution when 2+ signals occur within 30 minutes.
