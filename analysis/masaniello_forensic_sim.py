"""SnapTrade Masaniello Forensic Simulator.

Comprehensive backtesting of Masaniello strategy across all signal channels
with parameter optimization and risk analysis.
"""

import json
import math
import csv
from collections import defaultdict
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

# --- Constants ---
PAYOUT_RATE = 0.88
BASE_AMOUNT = 1.0  # $1 base
GALE_MULTIPLIER = 2.2  # Default gale multiplier


# --- Masaniello Core (mirrors TypeScript implementation) ---

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
class MasanielloState:
    base_amount: float
    payout_rate: float
    trades_per_day: int
    expected_wins: int
    target_profit_pct: float
    max_bet: float
    day_trades: int = 0
    day_wins: int = 0
    target_profit: float = 0.0

    def __post_init__(self):
        if self.target_profit == 0.0:
            self.target_profit = self.base_amount * self.trades_per_day * self.target_profit_pct


def masaniello_get_stake(state: MasanielloState) -> float:
    remaining = state.trades_per_day - state.day_trades
    needed = state.expected_wins - state.day_wins

    if remaining <= 0 or needed <= 0 or needed > remaining:
        return state.base_amount

    p_win = comb(remaining - 1, needed - 1) / comb(remaining, needed)

    if p_win <= 0 or not math.isfinite(p_win):
        return state.base_amount

    stake = (state.target_profit * p_win) / state.payout_rate
    clamped = max(state.base_amount, min(stake, state.max_bet))
    return round(clamped * 100) / 100


def masaniello_record_trade(state: MasanielloState, is_win: bool, actual_stake: float) -> MasanielloState:
    return MasanielloState(
        base_amount=state.base_amount,
        payout_rate=state.payout_rate,
        trades_per_day=state.trades_per_day,
        expected_wins=state.expected_wins,
        target_profit_pct=state.target_profit_pct,
        max_bet=state.max_bet,
        day_trades=state.day_trades + 1,
        day_wins=state.day_wins + (1 if is_win else 0),
        target_profit=max(0, state.target_profit - actual_stake * state.payout_rate) if is_win else state.target_profit,
    )


def masaniello_reset_day(state: MasanielloState) -> MasanielloState:
    return MasanielloState(
        base_amount=state.base_amount,
        payout_rate=state.payout_rate,
        trades_per_day=state.trades_per_day,
        expected_wins=state.expected_wins,
        target_profit_pct=state.target_profit_pct,
        max_bet=state.max_bet,
        day_trades=0,
        day_wins=0,
        target_profit=state.base_amount * state.trades_per_day * state.target_profit_pct,
    )


# --- Signal Data Processing ---

@dataclass
class Signal:
    date: str
    time: str
    asset: str
    direction: str
    gale_level: int
    is_win: bool
    channel: str


def load_channel_signals(filepath: str, channel: str) -> list[Signal]:
    with open(filepath, 'r') as f:
        data = json.load(f)

    signals = []
    for s in data:
        if s.get('status') != 'resolved':
            continue

        result = s.get('result', '')
        is_win = result == 'win'
        gl = s.get('galeLevel', s.get('gale_level', 0)) or 0

        entry_time = s.get('entryTimeUtc', s.get('entry_time_utc', ''))
        if not entry_time:
            continue

        try:
            dt = datetime.fromisoformat(entry_time.replace('Z', '+00:00'))
            date_str = dt.strftime('%Y-%m-%d')
            time_str = dt.strftime('%H:%M')
        except (ValueError, AttributeError):
            continue

        signals.append(Signal(
            date=date_str,
            time=time_str,
            asset=s.get('asset', ''),
            direction=s.get('direction', ''),
            gale_level=gl,
            is_win=is_win,
            channel=channel,
        ))

    signals.sort(key=lambda x: (x.date, x.time))
    return signals


# --- Simulation Engine ---

@dataclass
class SimConfig:
    name: str
    trades_per_day: int
    expected_wins: int
    max_bet_multiplier: float
    base_amount: float = 1.0
    payout_rate: float = PAYOUT_RATE
    target_profit_pct: float = 0.5
    max_daily_trades: int = 30
    max_consecutive_losses: int = 3
    use_gale: bool = True
    gale_multiplier: float = GALE_MULTIPLIER


@dataclass
class DailyResult:
    date: str
    trades: int
    wins: int
    losses: int
    pnl: float
    max_drawdown_intraday: float
    max_stake: float
    paused: bool = False
    pause_reason: str = ''


@dataclass
class SimResult:
    config: SimConfig
    channel: str
    daily_results: list[DailyResult]
    total_pnl: float = 0.0
    total_trades: int = 0
    total_wins: int = 0
    total_losses: int = 0
    max_drawdown: float = 0.0
    max_consecutive_losses: int = 0
    sharpe_ratio: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    avg_daily_pnl: float = 0.0
    worst_day: float = 0.0
    best_day: float = 0.0
    profitable_days_pct: float = 0.0


def simulate_masaniello(signals: list[Signal], config: SimConfig) -> SimResult:
    """Run Masaniello simulation on a sequence of signals."""
    # Group signals by day
    days = defaultdict(list)
    for s in signals:
        days[s.date].append(s)

    daily_results = []
    equity_curve = []
    cumulative_pnl = 0.0
    peak_equity = 0.0
    max_drawdown = 0.0
    total_wins = 0
    total_losses = 0
    total_gross_win = 0.0
    total_gross_loss = 0.0
    consecutive_losses = 0
    max_consec_losses = 0
    daily_pnls = []

    sorted_dates = sorted(days.keys())

    for date in sorted_dates:
        day_signals = days[date]
        state = MasanielloState(
            base_amount=config.base_amount,
            payout_rate=config.payout_rate,
            trades_per_day=config.trades_per_day,
            expected_wins=config.expected_wins,
            target_profit_pct=config.target_profit_pct,
            max_bet=config.base_amount * config.max_bet_multiplier,
        )

        day_pnl = 0.0
        day_trades = 0
        day_wins = 0
        day_losses = 0
        day_max_stake = 0.0
        day_peak = 0.0
        day_drawdown = 0.0
        paused = False
        pause_reason = ''
        consec_losses_day = 0

        for sig in day_signals:
            if paused:
                break
            if day_trades >= config.max_daily_trades:
                paused = True
                pause_reason = 'max_daily_trades'
                break

            # Calculate Masaniello stake
            stake = masaniello_get_stake(state)
            day_max_stake = max(day_max_stake, stake)

            # Simulate trade execution with gale levels
            trade_pnl = 0.0
            trade_is_win = False

            if sig.gale_level == 0 and sig.is_win:
                # Direct win
                trade_pnl = stake * config.payout_rate
                trade_is_win = True
            elif sig.gale_level == 1 and sig.is_win and config.use_gale:
                # Lost direct, won gale 1
                gale1_stake = stake * config.gale_multiplier
                trade_pnl = -stake + gale1_stake * config.payout_rate
                trade_is_win = True
            elif sig.gale_level == 2 and sig.is_win and config.use_gale:
                # Lost direct, lost gale1, won gale2
                gale1_stake = stake * config.gale_multiplier
                gale2_stake = gale1_stake * config.gale_multiplier
                trade_pnl = -stake - gale1_stake + gale2_stake * config.payout_rate
                trade_is_win = True
            elif sig.gale_level == 1 and not sig.is_win:
                # Lost direct and gale1
                if config.use_gale:
                    gale1_stake = stake * config.gale_multiplier
                    trade_pnl = -stake - gale1_stake
                else:
                    trade_pnl = -stake
                trade_is_win = False
            elif sig.gale_level == 2 and not sig.is_win:
                # Lost all gale levels
                if config.use_gale:
                    gale1_stake = stake * config.gale_multiplier
                    gale2_stake = gale1_stake * config.gale_multiplier
                    trade_pnl = -stake - gale1_stake - gale2_stake
                else:
                    trade_pnl = -stake
                trade_is_win = False
            elif sig.gale_level == 0 and not sig.is_win:
                # Direct loss (shouldn't happen with current data structure)
                trade_pnl = -stake
                trade_is_win = False
            else:
                # Fallback
                if sig.is_win:
                    trade_pnl = stake * config.payout_rate
                    trade_is_win = True
                else:
                    trade_pnl = -stake
                    trade_is_win = False

            day_pnl += trade_pnl
            day_trades += 1

            if trade_is_win:
                day_wins += 1
                total_wins += 1
                total_gross_win += trade_pnl
                consecutive_losses = 0
                consec_losses_day = 0
            else:
                day_losses += 1
                total_losses += 1
                total_gross_loss += abs(trade_pnl)
                consecutive_losses += 1
                consec_losses_day += 1
                max_consec_losses = max(max_consec_losses, consecutive_losses)

            # Check consecutive losses pause
            if consec_losses_day >= config.max_consecutive_losses:
                paused = True
                pause_reason = 'max_consecutive_losses'

            # Update Masaniello state
            state = masaniello_record_trade(state, trade_is_win, stake)

            # Track intraday drawdown
            if day_pnl > day_peak:
                day_peak = day_pnl
            dd = day_peak - day_pnl
            if dd > day_drawdown:
                day_drawdown = dd

        cumulative_pnl += day_pnl
        daily_pnls.append(day_pnl)

        # Track max drawdown
        if cumulative_pnl > peak_equity:
            peak_equity = cumulative_pnl
        dd = peak_equity - cumulative_pnl
        if dd > max_drawdown:
            max_drawdown = dd

        daily_results.append(DailyResult(
            date=date,
            trades=day_trades,
            wins=day_wins,
            losses=day_losses,
            pnl=round(day_pnl, 2),
            max_drawdown_intraday=round(day_drawdown, 2),
            max_stake=round(day_max_stake, 2),
            paused=paused,
            pause_reason=pause_reason,
        ))

    # Calculate statistics
    total_trades = total_wins + total_losses
    win_rate = (total_wins / total_trades * 100) if total_trades > 0 else 0
    profit_factor = (total_gross_win / total_gross_loss) if total_gross_loss > 0 else float('inf')
    avg_daily_pnl = sum(daily_pnls) / len(daily_pnls) if daily_pnls else 0
    worst_day = min(daily_pnls) if daily_pnls else 0
    best_day = max(daily_pnls) if daily_pnls else 0
    profitable_days = sum(1 for p in daily_pnls if p > 0)
    profitable_days_pct = (profitable_days / len(daily_pnls) * 100) if daily_pnls else 0

    # Sharpe ratio (daily)
    if len(daily_pnls) > 1:
        mean_daily = sum(daily_pnls) / len(daily_pnls)
        variance = sum((p - mean_daily) ** 2 for p in daily_pnls) / (len(daily_pnls) - 1)
        std_daily = math.sqrt(variance) if variance > 0 else 0
        sharpe_ratio = (mean_daily / std_daily * math.sqrt(252)) if std_daily > 0 else 0
    else:
        sharpe_ratio = 0

    return SimResult(
        config=config,
        channel='',
        daily_results=daily_results,
        total_pnl=round(cumulative_pnl, 2),
        total_trades=total_trades,
        total_wins=total_wins,
        total_losses=total_losses,
        max_drawdown=round(max_drawdown, 2),
        max_consecutive_losses=max_consec_losses,
        sharpe_ratio=round(sharpe_ratio, 2),
        win_rate=round(win_rate, 1),
        profit_factor=round(profit_factor, 2),
        avg_daily_pnl=round(avg_daily_pnl, 2),
        worst_day=round(worst_day, 2),
        best_day=round(best_day, 2),
        profitable_days_pct=round(profitable_days_pct, 1),
    )


# --- Parameter Optimization ---

CHANNEL_CONFIGS = {
    'tyl_vip': {
        'file': 'seed_signals.json',
        'current': SimConfig('TYL VIP (current)', 25, 22, 5.0),
    },
    'tyl_trading': {
        'file': 'db_import_tyl_trading.json',
        'current': SimConfig('TYL TRADING (current)', 20, 17, 5.0),
    },
    'sinais_mil': {
        'file': 'db_import_sinais_mil.json',
        'current': SimConfig('SINAIS MIL (current)', 15, 12, 5.0),
    },
    'blacklist': {
        'file': 'db_import_blacklist.json',
        'current': SimConfig('BLACKLIST (current)', 10, 9, 5.0),
    },
}

# Parameter grid for optimization
PARAM_GRID = {
    'trades_per_day': [10, 15, 20, 25, 30],
    'expected_wins_ratio': [0.70, 0.75, 0.80, 0.85, 0.88, 0.90],
    'max_bet_multiplier': [3.0, 5.0, 7.0, 10.0],
    'target_profit_pct': [0.3, 0.5, 0.7, 1.0],
    'gale_multiplier': [1.5, 2.0, 2.2, 2.5, 3.0],
}


def run_channel_analysis(channel_key: str, channel_info: dict) -> dict:
    """Run comprehensive analysis for a single channel."""
    print(f"\n{'='*60}")
    print(f"  CHANNEL: {channel_key.upper()}")
    print(f"{'='*60}")

    signals = load_channel_signals(channel_info['file'], channel_key)
    print(f"  Loaded {len(signals)} resolved signals")

    # 1. Run current config
    current_config = channel_info['current']
    current_result = simulate_masaniello(signals, current_config)
    current_result.channel = channel_key

    print(f"\n  --- Current Config: {current_config.name} ---")
    print(f"  Trades/Day: {current_config.trades_per_day}, Expected Wins: {current_config.expected_wins}")
    print(f"  Max Bet Mult: {current_config.max_bet_multiplier}x")
    print(f"  Total P&L: ${current_result.total_pnl:.2f}")
    print(f"  Total Trades: {current_result.total_trades}")
    print(f"  Win Rate: {current_result.win_rate}%")
    print(f"  Max Drawdown: ${current_result.max_drawdown:.2f}")
    print(f"  Sharpe Ratio: {current_result.sharpe_ratio}")
    print(f"  Profit Factor: {current_result.profit_factor}")
    print(f"  Avg Daily P&L: ${current_result.avg_daily_pnl:.2f}")
    print(f"  Best Day: ${current_result.best_day:.2f}")
    print(f"  Worst Day: ${current_result.worst_day:.2f}")
    print(f"  Profitable Days: {current_result.profitable_days_pct}%")
    print(f"  Max Consec Losses: {current_result.max_consecutive_losses}")

    # 2. Parameter optimization
    print(f"\n  --- Parameter Optimization ---")
    best_results = []

    for tpd in PARAM_GRID['trades_per_day']:
        for ew_ratio in PARAM_GRID['expected_wins_ratio']:
            ew = round(tpd * ew_ratio)
            if ew >= tpd or ew < 1:
                continue
            for mbm in PARAM_GRID['max_bet_multiplier']:
                for tpp in PARAM_GRID['target_profit_pct']:
                    for gm in PARAM_GRID['gale_multiplier']:
                        config = SimConfig(
                            name=f"T{tpd}_W{ew}_M{mbm}_P{tpp}_G{gm}",
                            trades_per_day=tpd,
                            expected_wins=ew,
                            max_bet_multiplier=mbm,
                            target_profit_pct=tpp,
                            gale_multiplier=gm,
                        )
                        result = simulate_masaniello(signals, config)
                        result.channel = channel_key

                        # Score: weighted combination of P&L, Sharpe, and drawdown
                        if result.total_pnl > 0 and result.max_drawdown > 0:
                            score = (
                                result.total_pnl * 0.3
                                + result.sharpe_ratio * 100 * 0.3
                                + result.profit_factor * 50 * 0.2
                                - result.max_drawdown * 0.2
                            )
                        else:
                            score = result.total_pnl

                        best_results.append((score, config, result))

    best_results.sort(key=lambda x: x[0], reverse=True)
    top_5 = best_results[:5]

    print(f"  Tested {len(best_results)} parameter combinations")
    print(f"\n  TOP 5 CONFIGURATIONS:")
    for i, (score, cfg, res) in enumerate(top_5, 1):
        print(f"\n  #{i} Score: {score:.1f}")
        print(f"     Config: TPD={cfg.trades_per_day}, EW={cfg.expected_wins}, "
              f"MBM={cfg.max_bet_multiplier}x, TPP={cfg.target_profit_pct}, GM={cfg.gale_multiplier}x")
        print(f"     P&L: ${res.total_pnl:.2f} | Sharpe: {res.sharpe_ratio} | "
              f"PF: {res.profit_factor} | DD: ${res.max_drawdown:.2f}")
        print(f"     WR: {res.win_rate}% | Prof Days: {res.profitable_days_pct}% | "
              f"Avg Daily: ${res.avg_daily_pnl:.2f}")

    # 3. No-gale analysis
    no_gale_config = SimConfig(
        name=f"{channel_key} no-gale",
        trades_per_day=current_config.trades_per_day,
        expected_wins=current_config.expected_wins,
        max_bet_multiplier=current_config.max_bet_multiplier,
        use_gale=False,
    )
    no_gale_result = simulate_masaniello(signals, no_gale_config)
    print(f"\n  --- No-Gale Comparison ---")
    print(f"  With Gale: ${current_result.total_pnl:.2f} | Without: ${no_gale_result.total_pnl:.2f}")
    print(f"  Gale Impact: ${current_result.total_pnl - no_gale_result.total_pnl:.2f}")

    return {
        'signals': signals,
        'current_result': current_result,
        'best_configs': top_5,
        'no_gale_result': no_gale_result,
    }


def run_global_analysis(all_signals: list[Signal]) -> dict:
    """Run analysis on combined signals from all channels."""
    print(f"\n{'='*60}")
    print(f"  GLOBAL COMBINED ANALYSIS")
    print(f"{'='*60}")
    print(f"  Total signals across all channels: {len(all_signals)}")

    # Test various configs on combined data
    configs_to_test = [
        SimConfig("Global Conservative", 20, 17, 5.0, target_profit_pct=0.3),
        SimConfig("Global Moderate", 25, 21, 5.0, target_profit_pct=0.5),
        SimConfig("Global Aggressive", 30, 25, 7.0, target_profit_pct=0.7),
        SimConfig("Global Ultra", 30, 26, 10.0, target_profit_pct=1.0),
        SimConfig("Global TYL-Tuned", 25, 22, 5.0, target_profit_pct=0.5),
        SimConfig("Global Low-Risk", 15, 13, 3.0, target_profit_pct=0.3),
    ]

    results = []
    for cfg in configs_to_test:
        res = simulate_masaniello(all_signals, cfg)
        res.channel = 'global'
        results.append((cfg, res))
        print(f"\n  {cfg.name}: P&L=${res.total_pnl:.2f} | Sharpe={res.sharpe_ratio} | "
              f"DD=${res.max_drawdown:.2f} | PF={res.profit_factor} | "
              f"WR={res.win_rate}% | Prof={res.profitable_days_pct}%")

    # Find optimal global config
    print(f"\n  --- Global Parameter Sweep ---")
    best_global = []
    for tpd in [15, 20, 25, 30]:
        for ew_ratio in [0.80, 0.85, 0.88, 0.90]:
            ew = round(tpd * ew_ratio)
            if ew >= tpd:
                continue
            for mbm in [3.0, 5.0, 7.0]:
                for tpp in [0.3, 0.5, 0.7]:
                    for gm in [2.0, 2.2, 2.5]:
                        cfg = SimConfig(f"G_T{tpd}_W{ew}_M{mbm}_P{tpp}_G{gm}",
                                       tpd, ew, mbm, target_profit_pct=tpp, gale_multiplier=gm)
                        res = simulate_masaniello(all_signals, cfg)
                        if res.total_pnl > 0:
                            score = (res.total_pnl * 0.3 + res.sharpe_ratio * 100 * 0.3
                                    + res.profit_factor * 50 * 0.2 - res.max_drawdown * 0.2)
                            best_global.append((score, cfg, res))

    best_global.sort(key=lambda x: x[0], reverse=True)

    print(f"  Tested {len(best_global)} combinations")
    print(f"\n  TOP 5 GLOBAL CONFIGURATIONS:")
    for i, (score, cfg, res) in enumerate(best_global[:5], 1):
        print(f"\n  #{i} Score: {score:.1f}")
        print(f"     Config: TPD={cfg.trades_per_day}, EW={cfg.expected_wins}, "
              f"MBM={cfg.max_bet_multiplier}x, TPP={cfg.target_profit_pct}, GM={cfg.gale_multiplier}x")
        print(f"     P&L: ${res.total_pnl:.2f} | Sharpe: {res.sharpe_ratio} | "
              f"PF: {res.profit_factor} | DD: ${res.max_drawdown:.2f}")
        print(f"     WR: {res.win_rate}% | Prof Days: {res.profitable_days_pct}% | "
              f"Avg Daily: ${res.avg_daily_pnl:.2f}")

    return {
        'preset_results': results,
        'best_global': best_global[:10],
    }


def generate_report(channel_results: dict, global_results: dict):
    """Generate final comprehensive report."""
    print(f"\n{'='*60}")
    print(f"  FINAL FORENSIC REPORT")
    print(f"{'='*60}")

    # Channel comparison
    print(f"\n  === CHANNEL COMPARISON ===")
    print(f"  {'Channel':<15} {'Signals':<10} {'P&L':<12} {'WR%':<8} {'Sharpe':<8} {'DD':<10} {'PF':<8} {'Prof%':<8}")
    print(f"  {'-'*79}")

    for ch_key, ch_data in channel_results.items():
        res = ch_data['current_result']
        sigs = len(ch_data['signals'])
        print(f"  {ch_key:<15} {sigs:<10} ${res.total_pnl:<10.2f} {res.win_rate:<8} "
              f"{res.sharpe_ratio:<8} ${res.max_drawdown:<8.2f} {res.profit_factor:<8} {res.profitable_days_pct:<8}")

    # Optimal configs per channel
    print(f"\n  === OPTIMAL CONFIGURATIONS PER CHANNEL ===")
    for ch_key, ch_data in channel_results.items():
        best = ch_data['best_configs'][0] if ch_data['best_configs'] else None
        if best:
            score, cfg, res = best
            curr = ch_data['current_result']
            improvement = res.total_pnl - curr.total_pnl
            print(f"\n  {ch_key.upper()}:")
            print(f"    Current:  TPD={curr.config.trades_per_day}, EW={curr.config.expected_wins} -> P&L=${curr.total_pnl:.2f}")
            print(f"    Optimal:  TPD={cfg.trades_per_day}, EW={cfg.expected_wins}, "
                  f"MBM={cfg.max_bet_multiplier}x, TPP={cfg.target_profit_pct}, GM={cfg.gale_multiplier}x")
            print(f"    Optimal P&L: ${res.total_pnl:.2f} (improvement: +${improvement:.2f})")

    # Global recommendation
    print(f"\n  === GLOBAL RECOMMENDATION ===")
    if global_results['best_global']:
        _, cfg, res = global_results['best_global'][0]
        print(f"  Best Global Config:")
        print(f"    Trades/Day: {cfg.trades_per_day}")
        print(f"    Expected Wins: {cfg.expected_wins} ({cfg.expected_wins/cfg.trades_per_day*100:.0f}%)")
        print(f"    Max Bet Multiplier: {cfg.max_bet_multiplier}x")
        print(f"    Target Profit %: {cfg.target_profit_pct}")
        print(f"    Gale Multiplier: {cfg.gale_multiplier}x")
        print(f"    Expected P&L: ${res.total_pnl:.2f}")
        print(f"    Sharpe Ratio: {res.sharpe_ratio}")
        print(f"    Max Drawdown: ${res.max_drawdown:.2f}")
        print(f"    Profit Factor: {res.profit_factor}")
        print(f"    Profitable Days: {res.profitable_days_pct}%")

    # Risk assessment
    print(f"\n  === RISK ASSESSMENT ===")
    for ch_key, ch_data in channel_results.items():
        res = ch_data['current_result']
        risk_level = 'LOW' if res.max_drawdown < 20 else ('MEDIUM' if res.max_drawdown < 50 else 'HIGH')
        print(f"  {ch_key}: Risk={risk_level} | Max DD=${res.max_drawdown:.2f} | "
              f"Max Consec Losses={res.max_consecutive_losses} | Worst Day=${res.worst_day:.2f}")


def export_equity_curves(channel_results: dict, global_signals: list[Signal]):
    """Export equity curves to CSV."""
    filepath = '/Users/pedrovarela/Documents/snaptrade-analysis/masaniello_equity_curves.csv'
    with open(filepath, 'w', newline='') as f:
        writer = csv.writer(f)
        header = ['date']
        for ch_key in channel_results:
            header.append(f'{ch_key}_pnl')
            header.append(f'{ch_key}_cumulative')
        writer.writerow(header)

        # Collect all dates
        all_dates = set()
        for ch_data in channel_results.values():
            for dr in ch_data['current_result'].daily_results:
                all_dates.add(dr.date)

        cumulative = {k: 0.0 for k in channel_results}
        for date in sorted(all_dates):
            row = [date]
            for ch_key, ch_data in channel_results.items():
                day_result = next((dr for dr in ch_data['current_result'].daily_results if dr.date == date), None)
                if day_result:
                    cumulative[ch_key] += day_result.pnl
                    row.extend([day_result.pnl, round(cumulative[ch_key], 2)])
                else:
                    row.extend([0, round(cumulative[ch_key], 2)])
            writer.writerow(row)

    print(f"\n  Equity curves exported to {filepath}")


# --- Main ---

def main():
    print("=" * 60)
    print("  SNAPTRADE MASANIELLO FORENSIC SIMULATOR")
    print("  Comprehensive Backtesting & Parameter Optimization")
    print("=" * 60)

    # Analyze each channel
    channel_results = {}
    all_signals = []

    for ch_key, ch_info in CHANNEL_CONFIGS.items():
        ch_result = run_channel_analysis(ch_key, ch_info)
        channel_results[ch_key] = ch_result
        all_signals.extend(ch_result['signals'])

    # Sort combined signals by date+time
    all_signals.sort(key=lambda x: (x.date, x.time))

    # Global analysis
    global_results = run_global_analysis(all_signals)

    # Generate final report
    generate_report(channel_results, global_results)

    # Export equity curves
    export_equity_curves(channel_results, all_signals)

    print(f"\n{'='*60}")
    print(f"  SIMULATION COMPLETE")
    print(f"  Total signals analyzed: {len(all_signals)}")
    print(f"  Channels: {len(channel_results)}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
