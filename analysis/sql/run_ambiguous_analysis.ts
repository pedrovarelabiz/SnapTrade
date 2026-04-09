/**
 * Analyze historical ambiguous signal cases from JSON data
 * Finds signals where 2+ signals existed on the same asset within 5 minutes
 */

import * as fs from 'fs';
import * as path from 'path';

interface Signal {
  telegram_msg_id?: number;
  asset: string;
  direction: string;
  entry_time_utc: string;
  expiration_minutes?: number;
  status?: string;
  visibility?: string;
  result?: string;
  gale_level?: number;
  raw_text?: string;
  created_at?: string;
}

interface AmbiguousCase {
  asset: string;
  timeBucket: string;
  signalCount: number;
  directions: string[];
  firstSignalTime: string;
  lastSignalTime: string;
  timeDiffSeconds: number;
}

function roundToFiveMinuteBucket(dateStr: string): string {
  const date = new Date(dateStr);
  const minutes = date.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  date.setMinutes(roundedMinutes, 0, 0);
  return date.toISOString();
}

function analyzeAmbiguousSignals(signals: Signal[]): AmbiguousCase[] {
  // Group signals by asset and 5-minute time buckets
  const buckets = new Map<string, Signal[]>();

  signals.forEach(signal => {
    if (!signal.entry_time_utc) return;

    const timeBucket = roundToFiveMinuteBucket(signal.entry_time_utc);
    const key = `${signal.asset}|${timeBucket}`;

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(signal);
  });

  // Find buckets with 2+ signals (ambiguous cases)
  const ambiguousCases: AmbiguousCase[] = [];

  buckets.forEach((bucketSignals, key) => {
    if (bucketSignals.length > 1) {
      const [asset, timeBucket] = key.split('|');

      const times = bucketSignals
        .map(s => new Date(s.entry_time_utc).getTime())
        .sort((a, b) => a - b);

      const firstTime = new Date(Math.min(...times));
      const lastTime = new Date(Math.max(...times));
      const timeDiffSeconds = (lastTime.getTime() - firstTime.getTime()) / 1000;

      ambiguousCases.push({
        asset,
        timeBucket,
        signalCount: bucketSignals.length,
        directions: bucketSignals.map(s => s.direction),
        firstSignalTime: firstTime.toISOString(),
        lastSignalTime: lastTime.toISOString(),
        timeDiffSeconds
      });
    }
  });

  // Sort by time bucket (desc), signal count (desc), asset
  ambiguousCases.sort((a, b) => {
    if (a.timeBucket !== b.timeBucket) {
      return b.timeBucket.localeCompare(a.timeBucket);
    }
    if (a.signalCount !== b.signalCount) {
      return b.signalCount - a.signalCount;
    }
    return a.asset.localeCompare(b.asset);
  });

  return ambiguousCases;
}

function main() {
  const dataPath = path.join(__dirname, '..', 'seed_signals.json');

  console.log('=== Ambiguous Signals Analysis ===\n');
  console.log(`Loading signals from: ${dataPath}\n`);

  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const signals: Signal[] = JSON.parse(rawData);

  console.log(`Total signals loaded: ${signals.length}\n`);

  const ambiguousCases = analyzeAmbiguousSignals(signals);

  console.log(`\n=== RESULTS ===`);
  console.log(`Found ${ambiguousCases.length} ambiguous cases (2+ signals on same asset within 5-minute windows)\n`);

  if (ambiguousCases.length > 0) {
    console.log('Sample ambiguous cases (first 10):');
    console.log('─'.repeat(120));
    console.log(
      'Asset'.padEnd(20) +
      'Time Bucket'.padEnd(30) +
      'Count'.padEnd(8) +
      'Directions'.padEnd(30) +
      'Time Diff (s)'
    );
    console.log('─'.repeat(120));

    ambiguousCases.slice(0, 10).forEach(c => {
      console.log(
        c.asset.padEnd(20) +
        c.timeBucket.substring(0, 19).padEnd(30) +
        c.signalCount.toString().padEnd(8) +
        c.directions.join(', ').substring(0, 28).padEnd(30) +
        c.timeDiffSeconds.toFixed(0)
      );
    });

    console.log('─'.repeat(120));

    // Statistics
    const totalConflicts = ambiguousCases.reduce((sum, c) => sum + c.signalCount, 0);
    const avgSignalsPerCase = (totalConflicts / ambiguousCases.length).toFixed(2);
    const maxSignalsInCase = Math.max(...ambiguousCases.map(c => c.signalCount));

    console.log(`\nStatistics:`);
    console.log(`  - Total ambiguous cases: ${ambiguousCases.length}`);
    console.log(`  - Total signals involved: ${totalConflicts}`);
    console.log(`  - Average signals per case: ${avgSignalsPerCase}`);
    console.log(`  - Maximum signals in one case: ${maxSignalsInCase}`);

    // Assets most affected
    const assetCounts = new Map<string, number>();
    ambiguousCases.forEach(c => {
      assetCounts.set(c.asset, (assetCounts.get(c.asset) || 0) + 1);
    });

    const topAssets = Array.from(assetCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    console.log(`\nTop 5 assets with ambiguous signals:`);
    topAssets.forEach(([asset, count]) => {
      console.log(`  - ${asset}: ${count} cases`);
    });
  }

  console.log('\n✓ Analysis complete');
  console.log(`\nVerification: Found ${ambiguousCases.length} rows with ambiguous signals`);
}

main();
