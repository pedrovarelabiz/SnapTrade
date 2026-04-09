#!/usr/bin/env python3
"""Realistic P&L simulation - with and without gale"""
import json
from collections import defaultdict

PAYOUT=0.88
INITIAL=1000

# For gale simulation, typical martingale multipliers
# Gale 1: bet enough to recover loss + make original profit
# If base=S, gale1 = (S + S) / PAYOUT = 2S/0.88 ≈ 2.27S
# Gale 2: recover all losses + profit = (S + 2.27S + S*0.88) / 0.88 ≈ 4.72S
GALE_MULT = [1.0, 2.27, 5.15]  # Approximate recovery multipliers

for fname, ch in [('seed_signals.json','tyl_vip'), ('db_import_tyl_trading.json','tyl_trading'), ('db_import_sinais_mil.json','sinais_mil'), ('db_import_blacklist.json','blacklist')]:
    d=json.load(open(fname))
    gl_key='gale_level' if 'gale_level' in d[0] else 'galeLevel'

    # Sort by date
    d.sort(key=lambda x: x.get('entry_time_utc','') or x.get('entryTimeUtc','') or x.get('created_at',''))

    # === NO GALE SIMULATION ===
    bank_ng=INITIAL
    base_stake=INITIAL*0.02  # 2% of initial
    ng_trades=0; ng_wins=0; ng_peak=INITIAL; ng_maxdd=0

    for s in d:
        if not s.get('result'):continue
        gl=s.get(gl_key,0) or 0
        res=s['result'].lower()

        # Without gale: trade every signal once
        # gale_level=0, win → we win
        # gale_level>0 → means first entry lost, so without gale we lose
        # gale_level=2, loss → we also lose

        stake=min(base_stake, bank_ng*0.05)
        if stake<=0 or bank_ng<=0:break

        if gl==0 and res=='win':
            bank_ng+=stake*PAYOUT; ng_wins+=1
        else:
            bank_ng-=stake
        ng_trades+=1
        if bank_ng>ng_peak:ng_peak=bank_ng
        dd=(ng_peak-bank_ng)/ng_peak*100
        if dd>ng_maxdd:ng_maxdd=dd

    ng_wr=round(ng_wins/ng_trades*100,1) if ng_trades else 0
    ng_roi=round((bank_ng-INITIAL)/INITIAL*100,1)

    # === WITH GALE SIMULATION (flat stake) ===
    bank_g=INITIAL
    g_trades=0; g_wins=0; g_peak=INITIAL; g_maxdd=0

    # Group signals by "chain" - each gale_level=0 starts a new chain
    chains=[]
    current_chain=[]
    for s in d:
        if not s.get('result'):continue
        gl=s.get(gl_key,0) or 0
        if gl==0:
            if current_chain:chains.append(current_chain)
            current_chain=[s]
        else:
            current_chain.append(s)
    if current_chain:chains.append(current_chain)

    for chain in chains:
        stake=min(base_stake, bank_g*0.05)
        if stake<=0 or bank_g<=0:break

        chain_cost=0; chain_win=False
        for s in chain:
            gl=s.get(gl_key,0) or 0
            res=s['result'].lower()
            gm=GALE_MULT[min(gl,2)]
            this_stake=stake*gm

            if res=='win':
                bank_g+=this_stake*PAYOUT-chain_cost  # Recover losses + profit
                chain_win=True; g_wins+=1
                break
            else:
                chain_cost+=this_stake
                bank_g-=this_stake

        if not chain_win:
            pass  # Already deducted

        g_trades+=1
        if bank_g>g_peak:g_peak=bank_g
        dd=(g_peak-bank_g)/g_peak*100
        if dd>g_maxdd:g_maxdd=dd

    g_wr=round(g_wins/g_trades*100,1) if g_trades else 0
    g_roi=round((bank_g-INITIAL)/INITIAL*100,1)

    print(f"=== {ch} ===")
    print(f"  NO GALE:   WR={ng_wr}%  ROI={ng_roi}%  MaxDD={round(ng_maxdd,1)}%  Final=${round(bank_ng,2)}  Trades={ng_trades}")
    print(f"  WITH GALE: WR={g_wr}%  ROI={g_roi}%  MaxDD={round(g_maxdd,1)}%  Final=${round(bank_g,2)}  Chains={g_trades}")
    print()
