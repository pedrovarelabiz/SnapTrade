/**
 * Indicator Validator v4 — Uses setup-detector's aggregated state.
 */

import type { Signal, IndicatorValidationConfig } from '../../types';
import { getAggregatedSetup } from './setup-detector';

export interface ValidationResult {
  allow: boolean;
  reason: string;
  confidence: number;
}

export function validateSignalWithSetups(
  signal: Signal,
  config: IndicatorValidationConfig,
  symbol: string,
): ValidationResult {
  if (!config.enabled || !config.validateSignals) {
    return { allow: true, reason: 'Validation disabled', confidence: 100 };
  }

  const setup = getAggregatedSetup(symbol, config.minConfidence);

  // No active setups
  if (!setup.direction || setup.activeSetups.length === 0) {
    const allow = config.noSetupAction === 'allow';
    return { allow, reason: allow ? 'No setup active (fail-open)' : 'No setup active (blocked)', confidence: 0 };
  }

  // Check if setup direction matches signal
  if (setup.direction !== signal.direction) {
    return { allow: false, reason: `Setup ${setup.direction} contradicts signal ${signal.direction} (${setup.confidence}%)`, confidence: setup.confidence };
  }

  // Check confidence threshold
  if (setup.confidence < config.minConfidence) {
    return { allow: false, reason: `Confidence ${setup.confidence}% < ${config.minConfidence}%`, confidence: setup.confidence };
  }

  return { allow: true, reason: `${setup.confidence}% confidence, ${setup.activeSetups.length} setups agree`, confidence: setup.confidence };
}
