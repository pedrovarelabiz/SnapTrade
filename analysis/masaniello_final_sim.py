"""SnapTrade Masaniello Final Simulation — No-Gale Focus + Gale Optimization.

Key finding from forensic analysis: Gale destroys returns across ALL channels.
This simulation focuses on optimal Masaniello configurations.
"""

import json
import math
import csv
from collections import defaultdict
from datetime import datetime
from dataclasses import dataclass


PAYOUT_RATE = 0.88
BASE_AMOUNT = 1.0


def comb(n: int, k: int) -> float:
    if k < 0 or k > n:
        return 0.0
    if k == 0 or k == n:
        return 1.0
    result = 1.0
    for i in range(min(k, n - k)):
        result = (result * (n - i)) / (i + 1)
    return result


@dataclass
class MState:
    base: float
    payout: float
    tpd: int
    ew: int
    tpp: float
    max_bet: float
    day_trades: int = 0
    day_wins: int = 0
    target: float = 0.0

    def __post_init__(self):
        if self.target == 0.0:
            self.target = self.base * self.tpd * self.tpp


def get_stake(s: MState) -> float:
    rem = s.tpd - s.day_trades
    need = s.ew - s.day_wins
    if rem <= 0 or need <= 0 or need > rem:
        return s.base
    pw = comb(rem - 1, need - 1) / comb(rem, need)
    if pw <= 0 or not math.isfinite(pw):
        return s.base
    stake = (s.target * pw) / s.payout
    return round(max(s.base, min(stake, s.max_bet)) * 100) / 100


def record(s: MState, win: bool, stake: float) -> MState:
    return MState(
        base=s.base, payout=s.payout, tpd=s.tpd, ew=s.ew,
        tpp=s.tpp, max_bet=s.max_bet,
        day_trades=s.day_trades + 1,
        day_wins=s.day_wins + (1 if win else 0),
        target=max(0, s.target - stake * s.payout) if win else s.target,
    )


@dataclass
class Signal:
    date: str
    time: str
    asset: str
    direction: str
    gale_level: int
    is_win: bool
    channel: str


def load_signals(filepath: str, channel: str) -> list[Signal]:
    with open(filepath) as f:
        data = json.load(f)
    signals = []
    for s in data:
        if s.get('status') != 'resolved':
            continue
        entry = s.get('entryTimeUtc', s.get('entry_time_utc', ''))
        if not entry:
            continue
        try:
            dt = datetime.fromisoformat(entry.replace('Z', '+00:00'))
        except ValueError:
            continue
        gl = s.get('galeLevel', s.get('gale_level', 0)) or 0
        signals.append(Signal(
            date=dt.strftime('%Y-%m-%d'), time=dt.strftime('%H:%M'),
            asset=s.get('asset', ''), direction=s.get('direction', ''),
            gale_level=gl, is_win=s.get('result') == 'win', channel=channel,
        ))
    signals.sort(key=lambda x: (x.date, x.time))
    return signals


def simulate(signals: list[Signal], tpd: int, ew: int, mbm: float,
             tpp: float = 0.5, use_gale: bool = False, gm: float = 2.2,
             max_daily: int = 50, max_consec: int = 5) -> dict:
    """Simulate Masaniello on signals. Returns stats dict."""
    days = defaultdict(list)
    for s in signals:
        days[s.date].append(s)

    cum_pnl = 0.0
    peak = 0.0
    max_dd = 0.0
    total_w = 0
    total_l = 0
    gross_w = 0.0
    gross_l = 0.0
    consec_l = 0
    max_consec_l = 0
    daily_pnls = []

    for date in sorted(days.keys()):
        st = MState(BASE_AMOUNT, PAYOUT_RATE, tpd, ew, tpp, BASE_AMOUNT * mbm)
        dpnl = 0.0
        dt = 0
        dw = 0
        dl = 0
        cl = 0

        for sig in days[date]:
            if dt >= max_daily or cl >= max_consec:
                break

            stake = get_stake(st)

            if not use_gale:
                # No gale: treat each signal as direct outcome
                # If signal is win at any gale level, it's a direct win here
                # If signal is loss, it's a direct loss
                if sig.is_win:
                    pnl = stake * PAYOUT_RATE
                    win = True
                else:
                    pnl = -stake
                    win = False
            else:
                # With gale
                if sig.gale_level == 0 and sig.is_win:
                    pnl = stake * PAYOUT_RATE
                    win = True
                elif sig.gale_level == 1 and sig.is_win:
                    g1 = stake * gm
                    pnl = -stake + g1 * PAYOUT_RATE
                    win = True
                elif sig.gale_level == 2 and sig.is_win:
                    g1 = stake * gm
                    g2 = g1 * gm
                    pnl = -stake - g1 + g2 * PAYOUT_RATE
                    win = True
                elif sig.gale_level == 1 and not sig.is_win:
                    g1 = stake * gm
                    pnl = -stake - g1
                    win = False
                elif sig.gale_level == 2 and not sig.is_win:
                    g1 = stake * gm
                    g2 = g1 * gm
                    pnl = -stake - g1 - g2
                    win = False
                else:
                    pnl = stake * PAYOUT_RATE if sig.is_win else -stake
                    win = sig.is_win

            dpnl += pnl
            dt += 1
            if win:
                dw += 1
                total_w += 1
                gross_w += max(0, pnl)
                consec_l = 0
                cl = 0
            else:
                dl += 1
                total_l += 1
                gross_l += abs(pnl)
                consec_l += 1
                cl += 1
                max_consec_l = max(max_consec_l, consec_l)

            st = record(st, win, stake)

        cum_pnl += dpnl
        daily_pnls.append(dpnl)
        if cum_pnl > peak:
            peak = cum_pnl
        dd = peak - cum_pnl
        if dd > max_dd:
            max_dd = dd

    tot = total_w + total_l
    wr = (total_w / tot * 100) if tot > 0 else 0
    pf = (gross_w / gross_l) if gross_l > 0 else float('inf')

    if len(daily_pnls) > 1:
        mean = sum(daily_pnls) / len(daily_pnls)
        var = sum((p - mean) ** 2 for p in daily_pnls) / (len(daily_pnls) - 1)
        std = math.sqrt(var) if var > 0 else 0
        sharpe = (mean / std * math.sqrt(252)) if std > 0 else 0
    else:
        sharpe = 0
        mean = 0

    prof_days = sum(1 for p in daily_pnls if p > 0)
    prof_pct = (prof_days / len(daily_pnls) * 100) if daily_pnls else 0

    return {
        'pnl': round(cum_pnl, 2),
        'trades': tot,
        'wins': total_w,
        'losses': total_l,
        'wr': round(wr, 1),
        'sharpe': round(sharpe, 2),
        'pf': round(pf, 2),
        'dd': round(max_dd, 2),
        'avg_daily': round(mean, 2),
        'worst': round(min(daily_pnls), 2) if daily_pnls else 0,
        'best': round(max(daily_pnls), 2) if daily_pnls else 0,
        'prof_pct': round(prof_pct, 1),
        'max_consec_l': max_consec_l,
        'days': len(daily_pnls),
        'daily_pnls': daily_pnls,
    }


def main():
    print("=" * 70)
    print("  SNAPTRADE MASANIELLO — DEFINITIVE SIMULATION")
    print("  Focus: No-Gale Masaniello + Gale Impact Analysis")
    print("=" * 70)

    # Load all channels
    channels = {
        'tyl_vip': load_signals('seed_signals.json', 'tyl_vip'),
        'tyl_trading': load_signals('db_import_tyl_trading.json', 'tyl_trading'),
        'sinais_mil': load_signals('db_import_sinais_mil.json', 'sinais_mil'),
        'blacklist': load_signals('db_import_blacklist.json', 'blacklist'),
    }

    # Current configs per channel
    current = {
        'tyl_vip': {'tpd': 25, 'ew': 22, 'mbm': 5.0},
        'tyl_trading': {'tpd': 20, 'ew': 17, 'mbm': 5.0},
        'sinais_mil': {'tpd': 15, 'ew': 12, 'mbm': 5.0},
        'blacklist': {'tpd': 10, 'ew': 9, 'mbm': 5.0},
    }

    # =========================================
    # PART 1: Channel Statistics
    # =========================================
    print(f"\n{'='*70}")
    print("  PART 1: CHANNEL FORENSIC STATISTICS")
    print(f"{'='*70}")

    for ch, sigs in channels.items():
        total = len(sigs)
        wins = sum(1 for s in sigs if s.is_win)
        losses = total - wins

        # Group by date
        days = defaultdict(list)
        for s in sigs:
            days[s.date].append(s)

        # Gale distribution
        g0_w = sum(1 for s in sigs if s.gale_level == 0 and s.is_win)
        g0_l = sum(1 for s in sigs if s.gale_level == 0 and not s.is_win)
        g1_w = sum(1 for s in sigs if s.gale_level == 1 and s.is_win)
        g1_l = sum(1 for s in sigs if s.gale_level == 1 and not s.is_win)
        g2_w = sum(1 for s in sigs if s.gale_level == 2 and s.is_win)
        g2_l = sum(1 for s in sigs if s.gale_level == 2 and not s.is_win)

        # Signals per day stats
        spd = [len(v) for v in days.values()]
        avg_spd = sum(spd) / len(spd) if spd else 0
        max_spd = max(spd) if spd else 0
        min_spd = min(spd) if spd else 0

        # Date range
        dates = sorted(days.keys())
        first_date = dates[0] if dates else 'N/A'
        last_date = dates[-1] if dates else 'N/A'

        print(f"\n  --- {ch.upper()} ---")
        print(f"  Period: {first_date} to {last_date} ({len(dates)} days)")
        print(f"  Signals: {total} | Wins: {wins} | Losses: {losses}")
        print(f"  Win Rate: {wins/total*100:.1f}%")
        print(f"  Signals/Day: avg={avg_spd:.1f}, min={min_spd}, max={max_spd}")
        print(f"  Gale Distribution:")
        print(f"    G0: {g0_w} wins, {g0_l} losses ({g0_w+g0_l} total)")
        print(f"    G1: {g1_w} wins, {g1_l} losses ({g1_w+g1_l} total)")
        print(f"    G2: {g2_w} wins, {g2_l} losses ({g2_w+g2_l} total)")

        # Direct win rate (how often the signal wins without ANY gale)
        direct_wr = g0_w / total * 100 if total > 0 else 0
        print(f"  Direct Win Rate (no gale needed): {direct_wr:.1f}%")

        # Effective win rate considering gale cost
        # A "gale win" still incurs losses on previous levels
        # Gale cost = number of gale levels that lost before the win
        gale_cost_signals = g1_w + g2_w  # These all had at least 1 losing gale entry
        print(f"  Signals needing gale to win: {gale_cost_signals} ({gale_cost_signals/total*100:.1f}%)")

    # =========================================
    # PART 2: No-Gale Masaniello Optimization
    # =========================================
    print(f"\n{'='*70}")
    print("  PART 2: NO-GALE MASANIELLO — PARAMETER OPTIMIZATION")
    print(f"{'='*70}")

    optimal_configs = {}

    for ch, sigs in channels.items():
        print(f"\n  --- {ch.upper()} ---")

        # Current config NO GALE
        c = current[ch]
        curr = simulate(sigs, c['tpd'], c['ew'], c['mbm'], use_gale=False)
        print(f"  Current (no gale): P&L=${curr['pnl']:.2f}, Sharpe={curr['sharpe']}, "
              f"PF={curr['pf']}, DD=${curr['dd']:.2f}, Prof={curr['prof_pct']}%")

        # Sweep parameters
        best = []
        for tpd in [10, 15, 20, 25, 30, 35, 40]:
            for ew_ratio in [0.70, 0.75, 0.80, 0.82, 0.85, 0.87, 0.88, 0.90, 0.92]:
                ew = round(tpd * ew_ratio)
                if ew >= tpd or ew < 5:
                    continue
                for mbm in [3.0, 5.0, 7.0, 10.0, 15.0]:
                    for tpp in [0.3, 0.5, 0.7, 1.0, 1.5]:
                        r = simulate(sigs, tpd, ew, mbm, tpp, use_gale=False)
                        if r['pnl'] > 0 and r['sharpe'] > 0:
                            # Score = balanced metric
                            score = (
                                r['sharpe'] * 200
                                + r['pf'] * 100
                                + r['prof_pct'] * 5
                                - r['dd'] * 0.5
                            )
                            best.append((score, tpd, ew, mbm, tpp, r))

        best.sort(key=lambda x: x[0], reverse=True)

        print(f"  Tested {len(best)} profitable configs")
        print(f"\n  TOP 10 CONFIGS (No Gale):")
        print(f"  {'#':<3} {'TPD':<5} {'EW':<5} {'EW%':<6} {'MBM':<5} {'TPP':<5} "
              f"{'P&L':<10} {'Sharpe':<8} {'PF':<6} {'DD':<8} {'Prof%':<7} {'AvgD':<8}")
        print(f"  {'-'*80}")

        for i, (sc, tpd, ew, mbm, tpp, r) in enumerate(best[:10], 1):
            ew_pct = ew / tpd * 100
            print(f"  {i:<3} {tpd:<5} {ew:<5} {ew_pct:<6.0f} {mbm:<5} {tpp:<5} "
                  f"${r['pnl']:<9.2f} {r['sharpe']:<8} {r['pf']:<6} ${r['dd']:<7.2f} "
                  f"{r['prof_pct']:<7} ${r['avg_daily']:<7.2f}")

        if best:
            optimal_configs[ch] = best[0]

    # =========================================
    # PART 3: Gale Impact Analysis
    # =========================================
    print(f"\n{'='*70}")
    print("  PART 3: GALE IMPACT ANALYSIS")
    print(f"{'='*70}")

    for ch, sigs in channels.items():
        print(f"\n  --- {ch.upper()} ---")

        # Get optimal no-gale config
        if ch in optimal_configs:
            _, tpd, ew, mbm, tpp, _ = optimal_configs[ch]
        else:
            c = current[ch]
            tpd, ew, mbm, tpp = c['tpd'], c['ew'], c['mbm'], 0.5

        no_gale = simulate(sigs, tpd, ew, mbm, tpp, use_gale=False)

        print(f"  Base config: TPD={tpd}, EW={ew}, MBM={mbm}x, TPP={tpp}")
        print(f"  No Gale: P&L=${no_gale['pnl']:.2f}, Sharpe={no_gale['sharpe']}")

        print(f"\n  {'GM':<5} {'P&L':<12} {'Sharpe':<8} {'PF':<8} {'DD':<10} {'Delta':<12}")
        print(f"  {'-'*55}")
        print(f"  {'OFF':<5} ${no_gale['pnl']:<11.2f} {no_gale['sharpe']:<8} "
              f"{no_gale['pf']:<8} ${no_gale['dd']:<9.2f} ${'0.00':<11}")

        for gm in [1.2, 1.5, 1.8, 2.0, 2.2, 2.5, 3.0]:
            r = simulate(sigs, tpd, ew, mbm, tpp, use_gale=True, gm=gm)
            delta = r['pnl'] - no_gale['pnl']
            print(f"  {gm:<5} ${r['pnl']:<11.2f} {r['sharpe']:<8} "
                  f"{r['pf']:<8} ${r['dd']:<9.2f} ${delta:<11.2f}")

    # =========================================
    # PART 4: Combined Global Signal Source
    # =========================================
    print(f"\n{'='*70}")
    print("  PART 4: COMBINED GLOBAL SOURCE — ALL CHANNELS")
    print(f"{'='*70}")

    all_sigs = []
    for sigs in channels.values():
        all_sigs.extend(sigs)
    all_sigs.sort(key=lambda x: (x.date, x.time))
    print(f"  Total combined signals: {len(all_sigs)}")

    # Date range
    all_days = defaultdict(list)
    for s in all_sigs:
        all_days[s.date].append(s)
    dates = sorted(all_days.keys())
    spd = [len(v) for v in all_days.values()]
    print(f"  Period: {dates[0]} to {dates[-1]} ({len(dates)} days)")
    print(f"  Signals/day: avg={sum(spd)/len(spd):.1f}, max={max(spd)}")

    # Test various configs on combined
    print(f"\n  NO-GALE parameter sweep on combined source:")
    best_global = []
    for tpd in [15, 20, 25, 30, 35, 40, 50]:
        for ew_ratio in [0.75, 0.80, 0.82, 0.85, 0.87, 0.88, 0.90]:
            ew = round(tpd * ew_ratio)
            if ew >= tpd or ew < 5:
                continue
            for mbm in [3.0, 5.0, 7.0, 10.0]:
                for tpp in [0.3, 0.5, 0.7, 1.0]:
                    r = simulate(all_sigs, tpd, ew, mbm, tpp, use_gale=False)
                    if r['pnl'] > 0 and r['sharpe'] > 0:
                        score = (r['sharpe'] * 200 + r['pf'] * 100
                                + r['prof_pct'] * 5 - r['dd'] * 0.5)
                        best_global.append((score, tpd, ew, mbm, tpp, r))

    best_global.sort(key=lambda x: x[0], reverse=True)
    print(f"  Found {len(best_global)} profitable configs")

    print(f"\n  TOP 10 GLOBAL CONFIGS (No Gale):")
    print(f"  {'#':<3} {'TPD':<5} {'EW':<5} {'EW%':<6} {'MBM':<5} {'TPP':<5} "
          f"{'P&L':<12} {'Sharpe':<8} {'PF':<6} {'DD':<10} {'Prof%':<7} {'AvgD':<8}")
    print(f"  {'-'*85}")
    for i, (sc, tpd, ew, mbm, tpp, r) in enumerate(best_global[:10], 1):
        ew_pct = ew / tpd * 100
        print(f"  {i:<3} {tpd:<5} {ew:<5} {ew_pct:<6.0f} {mbm:<5} {tpp:<5} "
              f"${r['pnl']:<11.2f} {r['sharpe']:<8} {r['pf']:<6} ${r['dd']:<9.2f} "
              f"{r['prof_pct']:<7} ${r['avg_daily']:<7.2f}")

    # =========================================
    # PART 5: Per-Channel Individual Scheduling
    # =========================================
    print(f"\n{'='*70}")
    print("  PART 5: PER-CHANNEL INDEPENDENT MASANIELLO")
    print("  (Each channel runs its own Masaniello instance)")
    print(f"{'='*70}")

    # Simulate running independent Masaniello per channel, then sum results
    combined_pnl = 0
    combined_dd = 0
    combined_daily = defaultdict(float)

    for ch, sigs in channels.items():
        if ch in optimal_configs:
            _, tpd, ew, mbm, tpp, _ = optimal_configs[ch]
        else:
            c = current[ch]
            tpd, ew, mbm, tpp = c['tpd'], c['ew'], c['mbm'], 0.5

        r = simulate(sigs, tpd, ew, mbm, tpp, use_gale=False)
        combined_pnl += r['pnl']

        print(f"\n  {ch.upper()}: TPD={tpd}, EW={ew}, MBM={mbm}x, TPP={tpp}")
        print(f"    P&L=${r['pnl']:.2f}, Sharpe={r['sharpe']}, PF={r['pf']}, "
              f"DD=${r['dd']:.2f}, Prof={r['prof_pct']}%")

        # Add to combined daily
        days = defaultdict(list)
        for s in sigs:
            days[s.date].append(s)
        for date in sorted(days.keys()):
            day_sigs = days[date]
            dr = simulate(day_sigs, tpd, ew, mbm, tpp, use_gale=False)
            combined_daily[date] += dr['pnl']

    # Calculate combined stats
    daily_vals = [combined_daily[d] for d in sorted(combined_daily.keys())]
    if daily_vals:
        cum = 0
        peak = 0
        max_dd = 0
        for v in daily_vals:
            cum += v
            if cum > peak:
                peak = cum
            dd = peak - cum
            if dd > max_dd:
                max_dd = dd

        mean = sum(daily_vals) / len(daily_vals)
        var = sum((p - mean) ** 2 for p in daily_vals) / (len(daily_vals) - 1)
        std = math.sqrt(var) if var > 0 else 0
        sharpe = (mean / std * math.sqrt(252)) if std > 0 else 0
        prof = sum(1 for p in daily_vals if p > 0) / len(daily_vals) * 100

        print(f"\n  === COMBINED INDEPENDENT CHANNELS ===")
        print(f"  Total P&L: ${combined_pnl:.2f}")
        print(f"  Combined Max DD: ${max_dd:.2f}")
        print(f"  Combined Sharpe: {sharpe:.2f}")
        print(f"  Profitable Days: {prof:.1f}%")
        print(f"  Avg Daily P&L: ${mean:.2f}")
        print(f"  Best Day: ${max(daily_vals):.2f}")
        print(f"  Worst Day: ${min(daily_vals):.2f}")

    # =========================================
    # PART 6: FINAL RECOMMENDATIONS
    # =========================================
    print(f"\n{'='*70}")
    print("  PART 6: FINAL RECOMMENDATIONS")
    print(f"{'='*70}")

    print(f"\n  1. CRITICAL: DISABLE GALE IN EXTENSION")
    print(f"     Gale (martingale) destroys returns across ALL channels.")
    print(f"     With $1 base across all channels:")
    for ch, sigs in channels.items():
        c = current[ch]
        with_g = simulate(sigs, c['tpd'], c['ew'], c['mbm'], 0.5, use_gale=True, gm=2.2)
        no_g = simulate(sigs, c['tpd'], c['ew'], c['mbm'], 0.5, use_gale=False)
        print(f"     {ch}: With Gale=${with_g['pnl']:.2f} | No Gale=${no_g['pnl']:.2f} | "
              f"Gale Cost=${with_g['pnl'] - no_g['pnl']:.2f}")

    print(f"\n  2. OPTIMAL MASANIELLO SETTINGS PER CHANNEL (No Gale):")
    for ch in channels:
        if ch in optimal_configs:
            _, tpd, ew, mbm, tpp, r = optimal_configs[ch]
            c = current[ch]
            print(f"\n     {ch.upper()}:")
            print(f"       Current: TPD={c['tpd']}, EW={c['ew']}, MBM={c['mbm']}x")
            print(f"       Optimal: TPD={tpd}, EW={ew} ({ew/tpd*100:.0f}%), MBM={mbm}x, TPP={tpp}")
            print(f"       Expected P&L: ${r['pnl']:.2f}/period, Sharpe={r['sharpe']}, PF={r['pf']}")

    print(f"\n  3. BEST GLOBAL CONFIG (all channels combined, single Masaniello):")
    if best_global:
        _, tpd, ew, mbm, tpp, r = best_global[0]
        print(f"       TPD={tpd}, EW={ew} ({ew/tpd*100:.0f}%), MBM={mbm}x, TPP={tpp}")
        print(f"       P&L=${r['pnl']:.2f}, Sharpe={r['sharpe']}, PF={r['pf']}, DD=${r['dd']:.2f}")

    print(f"\n  4. RECOMMENDED APPROACH:")
    print(f"     Option A (Best): Run INDEPENDENT Masaniello per channel")
    print(f"       - Each channel has its own optimal parameters")
    print(f"       - Better risk isolation per signal source")
    print(f"       - Combined P&L: ${combined_pnl:.2f}")
    print(f"\n     Option B (Simpler): Single global Masaniello")
    if best_global:
        _, tpd, ew, mbm, tpp, r = best_global[0]
        print(f"       - Config: TPD={tpd}, EW={ew}, MBM={mbm}x, TPP={tpp}")
        print(f"       - Combined P&L: ${r['pnl']:.2f}")

    print(f"\n  5. EXTENSION SETTINGS TO CHANGE:")
    print(f"     - strategy: 'masaniello' (keep)")
    print(f"     - autoExecuteGale: false (CRITICAL)")
    print(f"     - simpleMaxGale: 0")
    if best_global:
        _, tpd, ew, mbm, tpp, _ = best_global[0]
        print(f"     - masanielloTotalTrades: {tpd}")
        print(f"     - masanielloExpectedWins: {ew}")
        print(f"     - masanielloMaxBetMultiplier: {mbm}")

    # Export final equity curves
    print(f"\n  6. EXPORTING EQUITY CURVES...")
    with open('final_equity_curves.csv', 'w', newline='') as f:
        w = csv.writer(f)
        header = ['date', 'combined_pnl', 'combined_cumulative']
        for ch in channels:
            header.extend([f'{ch}_pnl', f'{ch}_cumulative'])
        w.writerow(header)

        ch_cums = {ch: 0.0 for ch in channels}
        combined_cum = 0.0

        for date in sorted(combined_daily.keys()):
            row = [date, round(combined_daily[date], 2)]
            combined_cum += combined_daily[date]
            row.append(round(combined_cum, 2))

            for ch in channels:
                # Find this date's PnL for this channel
                ch_daily = defaultdict(list)
                for s in channels[ch]:
                    ch_daily[s.date].append(s)

                if date in ch_daily:
                    if ch in optimal_configs:
                        _, tpd, ew, mbm, tpp, _ = optimal_configs[ch]
                    else:
                        c = current[ch]
                        tpd, ew, mbm, tpp = c['tpd'], c['ew'], c['mbm'], 0.5
                    dr = simulate(ch_daily[date], tpd, ew, mbm, tpp, use_gale=False)
                    ch_cums[ch] += dr['pnl']
                    row.extend([dr['pnl'], round(ch_cums[ch], 2)])
                else:
                    row.extend([0, round(ch_cums[ch], 2)])

            w.writerow(row)

    print(f"     Saved to final_equity_curves.csv")


if __name__ == '__main__':
    main()
