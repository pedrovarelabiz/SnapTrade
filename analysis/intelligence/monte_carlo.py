#!/usr/bin/env python3
"""Monte Carlo risk analysis for best strategies"""
import json, random, math

PAYOUT=0.88
INITIAL=1000
N_SIMS=2000
N_TRADES=500  # trades per simulation

def simulate_mc(wr, payout, initial, n_trades, stake_pct=0.02):
    bank=initial; peak=initial; max_dd=0
    for _ in range(n_trades):
        stake=bank*stake_pct
        if stake<=0:return 0, 100  # Bust
        if random.random()<wr:
            bank+=stake*payout
        else:
            bank-=stake
        if bank>peak:peak=bank
        dd=(peak-bank)/peak*100 if peak>0 else 100
        if dd>max_dd:max_dd=dd
        if bank<=0:return 0, 100
    return bank, max_dd

scenarios = {
    'sinais_mil_2pct': {'wr': 0.825, 'stake': 0.02, 'label': 'Sinais Mil 2% stake'},
    'sinais_mil_3pct': {'wr': 0.825, 'stake': 0.03, 'label': 'Sinais Mil 3% stake'},
    'sinais_mil_5pct': {'wr': 0.825, 'stake': 0.05, 'label': 'Sinais Mil 5% stake'},
    'blacklist_2pct': {'wr': 0.701, 'stake': 0.02, 'label': 'Blacklist 2% stake'},
    'blacklist_3pct': {'wr': 0.701, 'stake': 0.03, 'label': 'Blacklist 3% stake'},
    'tyl_vip_nogale_2pct': {'wr': 0.495, 'stake': 0.02, 'label': 'TYL VIP no-gale 2% (losing)'},
    'breakeven_ref': {'wr': 0.532, 'stake': 0.02, 'label': 'Breakeven reference 53.2%'},
    'combined_best': {'wr': 0.80, 'stake': 0.02, 'label': 'Combined best channels ~80%'},
}

random.seed(42)
results = {}
print(f"Monte Carlo: {N_SIMS} simulations x {N_TRADES} trades each\n")

for key, sc in scenarios.items():
    finals = []; dds = []; busts = 0
    for _ in range(N_SIMS):
        final, dd = simulate_mc(sc['wr'], PAYOUT, INITIAL, N_TRADES, sc['stake'])
        finals.append(final)
        dds.append(dd)
        if final <= 0: busts += 1

    finals.sort()
    median = finals[len(finals)//2]
    p5 = finals[int(len(finals)*0.05)]
    p95 = finals[int(len(finals)*0.95)]
    avg_dd = sum(dds)/len(dds)
    max_dd_worst = max(dds)
    bust_rate = busts/N_SIMS*100
    avg_final = sum(finals)/len(finals)

    results[key] = {
        'label': sc['label'], 'wr': sc['wr'], 'stake': sc['stake'],
        'median_final': round(median,2), 'avg_final': round(avg_final,2),
        'p5': round(p5,2), 'p95': round(p95,2),
        'avg_max_dd': round(avg_dd,1), 'worst_dd': round(max_dd_worst,1),
        'bust_rate': round(bust_rate,1),
        'roi_median': round((median-INITIAL)/INITIAL*100,1)
    }

    print(f"{sc['label']:40s} | Median=${median:>10.0f} | P5=${p5:>8.0f} | P95=${p95:>12.0f} | AvgDD={avg_dd:5.1f}% | Bust={bust_rate:.1f}%")

json.dump(results, open('intelligence/monte_carlo_results.json','w'), indent=2)
