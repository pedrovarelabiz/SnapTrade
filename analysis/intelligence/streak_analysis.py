#!/usr/bin/env python3
"""Streak and drawdown analysis per channel"""
import json
from collections import defaultdict

data=json.load(open('intelligence/all_signals_unified.json'))
has_res=[s for s in data if s['result'] and s['result'].lower() in ('win','loss')]

for ch in ['tyl_vip','tyl_trading','sinais_mil','blacklist','private_team','cole_carter']:
    sigs=[s for s in has_res if s['channel']==ch]
    sigs.sort(key=lambda x:x['date'])
    if not sigs:continue

    # Compute real result (without gale = gale0 win only)
    real_results=[]
    for s in sigs:
        gl=s.get('gale_level',0) or 0
        r=s['result'].lower()
        if gl==0 and r=='win':
            real_results.append('W')
        elif gl==0 and r=='loss':
            # This is a signal that lost at gale0 but was recovered by gale1+
            # In no-gale mode this is a loss
            real_results.append('L')
        elif gl>0:
            # Skip gale recovery trades for no-gale analysis
            continue
        else:
            real_results.append('L' if r=='loss' else 'W')

    # Streaks
    max_wstreak=0;max_lstreak=0;cur=0;cur_type=''
    streaks_w=[];streaks_l=[]
    for r in real_results:
        if r==cur_type:
            cur+=1
        else:
            if cur_type=='W' and cur>0:streaks_w.append(cur)
            if cur_type=='L' and cur>0:streaks_l.append(cur)
            cur=1;cur_type=r
    if cur_type=='W':streaks_w.append(cur)
    if cur_type=='L':streaks_l.append(cur)

    max_ws=max(streaks_w) if streaks_w else 0
    max_ls=max(streaks_l) if streaks_l else 0
    avg_ws=round(sum(streaks_w)/len(streaks_w),1) if streaks_w else 0
    avg_ls=round(sum(streaks_l)/len(streaks_l),1) if streaks_l else 0

    wins=real_results.count('W')
    total=len(real_results)
    wr=round(wins/total*100,1) if total else 0

    print(f"{ch:15s} | N={total:5d} | RealWR={wr:5.1f}% | MaxWin={max_ws:3d} | MaxLoss={max_ls:3d} | AvgWin={avg_ws:.1f} | AvgLoss={avg_ls:.1f}")

# Monthly consistency for sinais_mil (best channel)
print("\n=== SINAIS MIL MONTHLY CONSISTENCY ===")
sm=[s for s in has_res if s['channel']=='sinais_mil']
sm.sort(key=lambda x:x['date'])
monthly=defaultdict(lambda:{'w':0,'l':0})
for s in sm:
    d=s['date'][:7]  # YYYY-MM
    gl=s.get('gale_level',0) or 0
    r=s['result'].lower()
    if gl==0 and r=='win':monthly[d]['w']+=1
    elif r=='loss' or (gl>0):
        if gl==0:monthly[d]['l']+=1  # only count gale0 losses for no-gale
for m in sorted(monthly.keys()):
    v=monthly[m];t=v['w']+v['l'];wr=round(v['w']/t*100,1) if t else 0
    bar='█'*int(wr/2)
    print(f"  {m}: {t:4d} signals  WR={wr:5.1f}%  {bar}")
