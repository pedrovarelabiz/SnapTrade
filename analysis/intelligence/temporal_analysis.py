#!/usr/bin/env python3
import json
from collections import defaultdict
from datetime import datetime

data=json.load(open('intelligence/all_signals_unified.json'))
has_res=[s for s in data if s['result'] and s['result'].lower() in ('win','loss')]

# By hour
hour_stats=defaultdict(lambda:{'w':0,'l':0})
dow_stats=defaultdict(lambda:{'w':0,'l':0})

for s in has_res:
    d=s['date']
    if not d or len(d)<13:continue
    try:
        dt=datetime.fromisoformat(d.replace('Z','+00:00').split('+')[0])
        h=dt.hour
        dow=dt.strftime('%A')
        r=s['result'].lower()
        if r=='win':
            hour_stats[h]['w']+=1
            dow_stats[dow]['w']+=1
        else:
            hour_stats[h]['l']+=1
            dow_stats[dow]['l']+=1
    except:pass

print("=== BY HOUR (UTC) ===")
for h in sorted(hour_stats.keys()):
    v=hour_stats[h];t=v['w']+v['l'];wr=round(v['w']/t*100,1) if t else 0
    bar='#'*int(wr/2)
    print(f"  {h:02d}:00  {t:5d} signals  WR={wr:5.1f}%  {bar}")

print("\n=== BY DAY OF WEEK ===")
days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
for d in days:
    v=dow_stats.get(d,{'w':0,'l':0});t=v['w']+v['l'];wr=round(v['w']/t*100,1) if t else 0
    print(f"  {d:10s}  {t:5d} signals  WR={wr:5.1f}%")

# Per channel hourly
print("\n=== BEST HOURS PER CHANNEL ===")
ch_hour=defaultdict(lambda:defaultdict(lambda:{'w':0,'l':0}))
for s in has_res:
    d=s['date']
    if not d or len(d)<13:continue
    try:
        dt=datetime.fromisoformat(d.replace('Z','+00:00').split('+')[0])
        h=dt.hour;r=s['result'].lower();ch=s['channel']
        if r=='win':ch_hour[ch][h]['w']+=1
        else:ch_hour[ch][h]['l']+=1
    except:pass

for ch in sorted(ch_hour.keys()):
    best_h=-1;best_wr=0;best_n=0
    for h,v in ch_hour[ch].items():
        t=v['w']+v['l']
        if t>=20:
            wr=v['w']/t*100
            if wr>best_wr:best_wr=wr;best_h=h;best_n=t
    worst_h=-1;worst_wr=100
    for h,v in ch_hour[ch].items():
        t=v['w']+v['l']
        if t>=20:
            wr=v['w']/t*100
            if wr<worst_wr:worst_wr=wr;worst_h=h;worst_n=t
    print(f"  {ch:15s}  Best: {best_h:02d}:00 ({best_wr:.1f}%, n={best_n})  Worst: {worst_h:02d}:00 ({worst_wr:.1f}%)")

json.dump({'hourly':{str(k):v for k,v in hour_stats.items()},'daily':dict(dow_stats)},open('intelligence/temporal_analysis.json','w'),indent=2)
