# Changelog

All notable changes to the SnapTrade Listener service will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-03-24

### Fixed
- **Enhanced D3 Fix**: Implemented exact expiration time matching with calculate_expiration_time(). 3-tier algorithm now prioritizes exact matches, preventing race conditions with concurrent signals.

  **Technical Details:**
  - Modified functions: `find_matching_signal()`, `calculate_expiration_time()`
  - New return value format: includes match tier (exact/proximity/fallback) and confidence score
  - Test coverage additions: edge cases for concurrent signals, expiration time matching, and fallback scenarios
  - Reference: Issue D3

## [2.1.0] - 2026-03-23

### Fixed
- **D3 Race Condition**: Fixed race condition where 2+ signals on same asset within 30min could have ambiguous result attribution
  - Implemented 3-tier matching system: exact expiration + asset match, proximity + asset match, proximity fallback
  - Added comprehensive Sentry breadcrumbs and error tracking for match failures
  - Performance validated at <5ms per match operation
  - 100% backward compatible with existing signal processing
  - Full monitoring and metrics configured for production tracking

### Added
- Enhanced signal matching with exact expiration timestamp matching as primary strategy
- Proximity-based fallback matching for signals without exact timestamp alignment
- Detailed logging and Sentry integration for debugging match attribution
- Integration tests covering edge cases and race conditions
- Performance benchmarks and monitoring

### Changed
- Signal result attribution now uses multi-tier matching strategy
- Improved error handling and observability for signal processing workflow
