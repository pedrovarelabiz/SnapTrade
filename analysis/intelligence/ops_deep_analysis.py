#!/usr/bin/env python3
"""Deep analysis of OPERATIONS REPORT data"""
import json
from collections import defaultdict, Counter

trades = json.load(open('intelligence/ops_report_trades.json'))
detailed = [t for t in trades if t['format']=='detailed']
print(f"=== DETAILED TRADES ANALYSIS ({len(detailed)} trades) ===\n")

# 1. WIN RATE BY ASSET (min 20 trades)
asset_stats = defaultdict(lambda: {'w':0,'l':0})
for t in detailed:
    if t['result']=='WIN': asset_stats[t['asset']]['w']+=1
    else: asset_stats[t['asset']]['l']+=1

print("TOP ASSETS (by WR, min 20 trades):")
ranked = []
for a, v in asset_stats.items():
    total = v['w']+v['l']
    if total >= 20:
        wr = v['w']/total*100
        ranked.append((a, wr, total, v['w'], v['l']))
ranked.sort(key=lambda x: -x[1])
for a, wr, n, w, l in ranked[:15]:
    print(f"  {a:20s}  WR={wr:5.1f}%  ({w}W/{l}L, n={n})")
print(f"\nWORST ASSETS:")
for a, wr, n, w, l in ranked[-10:]:
    print(f"  {a:20s}  WR={wr:5.1f}%  ({w}W/{l}L, n={n})")

# 2. WIN RATE BY HOUR
hour_stats = defaultdict(lambda: {'w':0,'l':0})
for t in detailed:
    if t['time'] != 'UNKNOWN':
        h = t['time'][:2]
        if t['result']=='WIN': hour_stats[h]['w']+=1
        else: hour_stats[h]['l']+=1

print(f"\n=== WIN RATE BY HOUR ===")
for h in sorted(hour_stats.keys()):
    v = hour_stats[h]; total = v['w']+v['l']; wr = v['w']/total*100
    bar = '#'*int(wr/2)
    print(f"  {h}:00  {total:5d} trades  WR={wr:5.1f}%  {bar}")

# 3. WIN RATE BY DAY OF WEEK
from datetime import datetime
dow_stats = defaultdict(lambda: {'w':0,'l':0})
for t in trades:
    try:
        dt = datetime.strptime(t['date'][:10], '%Y-%m-%d')
        dow = dt.strftime('%A')
        if t['result']=='WIN': dow_stats[dow]['w']+=1
        else: dow_stats[dow]['l']+=1
    except: pass

print(f"\n=== WIN RATE BY DAY OF WEEK ===")
for d in ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:
    v = dow_stats.get(d, {'w':0,'l':0}); total = v['w']+v['l']
    wr = v['w']/total*100 if total else 0
    print(f"  {d:10s}  {total:5d} trades  WR={wr:5.1f}%")

# 4. MONTHLY CONSISTENCY
month_stats = defaultdict(lambda: {'w':0,'l':0})
for t in trades:
    m = t['date'][:7]
    if t['result']=='WIN': month_stats[m]['w']+=1
    else: month_stats[m]['l']+=1

print(f"\n=== MONTHLY CONSISTENCY ===")
for m in sorted(month_stats.keys()):
    v = month_stats[m]; total = v['w']+v['l']; wr = v['w']/total*100
    bar = '█'*int(wr/2)
    print(f"  {m}  {total:5d} trades  WR={wr:5.1f}%  {bar}")
