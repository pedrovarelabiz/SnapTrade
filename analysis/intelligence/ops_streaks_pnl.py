#!/usr/bin/env python3
"""Streak, drawdown, and P&L analysis from OPERATIONS REPORT"""
import json
from collections import defaultdict

trades = json.load(open('intelligence/ops_report_trades.json'))
daily = json.load(open('intelligence/ops_report_daily.json'))

# 1. STREAK ANALYSIS (all trades chronologically)
results = [t['result'] for t in trades]
max_ws=0;max_ls=0;cur=0;ct=''
wstreaks=[];lstreaks=[]
for r in results:
    if r==ct:cur+=1
    else:
        if ct=='WIN' and cur>0:wstreaks.append(cur)
        if ct=='LOSS' and cur>0:lstreaks.append(cur)
        cur=1;ct=r
if ct=='WIN':wstreaks.append(cur)
if ct=='LOSS':lstreaks.append(cur)

print("=== STREAK ANALYSIS ===")
print(f"Max win streak: {max(wstreaks) if wstreaks else 0}")
print(f"Max loss streak: {max(lstreaks) if lstreaks else 0}")
print(f"Avg win streak: {sum(wstreaks)/len(wstreaks):.1f}" if wstreaks else "")
print(f"Avg loss streak: {sum(lstreaks)/len(lstreaks):.1f}" if lstreaks else "")
# Distribution of loss streaks
from collections import Counter
ls_dist = Counter(lstreaks)
print(f"Loss streak distribution: {dict(sorted(ls_dist.items()))}")

# 2. DAILY P&L (with gale cost model)
# The OPERATIONS REPORT shows results WITH gale
# Each WIN costs between 1x (GL0 win) and ~8.42x (GL2 win) base stake
# Each LOSS costs ~8.42x base stake (lost at all 3 levels)
# Since we don't know which gale level each win was, use expected values:
# From seed_signals: ~49.5% GL0 win, ~25.1% GL1 win, ~12.5% GL2 win, ~12.8% GL2 loss
# For a "WIN" in ops report: P(GL0)=0.567, P(GL1)=0.289, P(GL2)=0.144
# Expected WIN profit = 0.567*(0.88*S) + 0.289*(0.88*2.27S - S) + 0.144*(0.88*5.15S - S - 2.27S)
# Expected LOSS cost = S + 2.27S + 5.15S = 8.42S

PAYOUT = 0.88
# Gale multipliers
G0, G1, G2 = 1.0, 2.27, 5.15
# Win distribution (from seed_signals gale data)
P_G0 = 0.567  # 3958/6968
P_G1 = 0.288  # 2008/6968
P_G2 = 0.144  # 1002/6968

# Expected profit for a WIN (with gale, as reported)
WIN_PROFIT_G0 = PAYOUT * G0  # 0.88
WIN_PROFIT_G1 = PAYOUT * G1 - G0  # 2.0 - 1.0 = 1.0 (recover G0 loss + profit)
WIN_PROFIT_G2 = PAYOUT * G2 - G0 - G1  # 4.53 - 1.0 - 2.27 = 1.26

# Expected profit per WIN signal
E_WIN = P_G0 * WIN_PROFIT_G0 + P_G1 * WIN_PROFIT_G1 + P_G2 * WIN_PROFIT_G2
# Cost per LOSS signal (lost all 3)
E_LOSS = G0 + G1 + G2  # 8.42

print(f"\n=== GALE COST MODEL ===")
print(f"Expected profit per WIN: {E_WIN:.3f}x base stake")
print(f"Cost per LOSS: {E_LOSS:.2f}x base stake")
print(f"At 87.4% WR: EV per signal = 0.874*{E_WIN:.3f} - 0.126*{E_LOSS:.2f} = {0.874*E_WIN - 0.126*E_LOSS:.3f}x")

# 3. SIMULATE P&L WITH OPS REPORT DATA
INITIAL = 1000
STAKE_PCT = 0.02  # 2% base stake

bank = INITIAL
peak = INITIAL
max_dd = 0
equity = [INITIAL]
daily_pnl = []

# Group trades by day
from itertools import groupby
trades_sorted = sorted(trades, key=lambda x: x['date'])
for day, day_trades in groupby(trades_sorted, key=lambda x: x['date']):
    day_list = list(day_trades)
    day_start = bank
    for t in day_list:
        base_stake = bank * STAKE_PCT
        if base_stake <= 0 or bank <= 0:
            break
        if t['result'] == 'WIN':
            # Expected win profit (average across gale levels)
            bank += base_stake * E_WIN
        else:
            # Full gale loss
            bank -= base_stake * E_LOSS
        if bank > peak: peak = bank
        dd = (peak - bank) / peak * 100 if peak > 0 else 0
        if dd > max_dd: max_dd = dd
        equity.append(bank)
    daily_pnl.append({'date': day, 'pnl': bank - day_start, 'pnl_pct': (bank-day_start)/day_start*100 if day_start else 0, 'bank': round(bank,2)})

print(f"\n=== P&L SIMULATION (2% stake, with gale) ===")
print(f"Initial: ${INITIAL}")
print(f"Final: ${bank:,.2f}")
print(f"ROI: {(bank-INITIAL)/INITIAL*100:,.1f}%")
print(f"Max drawdown: {max_dd:.1f}%")
print(f"Total trades: {len(trades)}")

# Worst days
daily_pnl.sort(key=lambda x: x['pnl_pct'])
print(f"\nWORST 10 DAYS:")
for d in daily_pnl[:10]:
    print(f"  {d['date']}  PnL={d['pnl_pct']:+.1f}%  Bank=${d['bank']:,.0f}")

# Best days
daily_pnl.sort(key=lambda x: -x['pnl_pct'])
print(f"\nBEST 5 DAYS:")
for d in daily_pnl[:5]:
    print(f"  {d['date']}  PnL={d['pnl_pct']:+.1f}%  Bank=${d['bank']:,.0f}")

json.dump(daily_pnl, open('intelligence/ops_daily_pnl.json','w'), indent=2)
