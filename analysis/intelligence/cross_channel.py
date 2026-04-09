#!/usr/bin/env python3
import json
from collections import defaultdict
from datetime import datetime, timedelta

data=json.load(open('intelligence/all_signals_unified.json'))
has_res=[s for s in data if s['result'] and s['result'].lower() in ('win','loss')]

# Create time-asset windows (15-min windows) to find overlaps
windows=defaultdict(list)
for s in has_res:
    d=s['date']
    if not d or len(d)<16:continue
    try:
        dt=datetime.fromisoformat(d.replace('Z','+00:00').split('+')[0])
        # Round to 15-min window
        w=dt.replace(minute=(dt.minute//15)*15,second=0,microsecond=0)
        key=f"{w.isoformat()}_{s['asset']}"
        windows[key].append(s)
    except:pass

# Find windows with 2+ channels
multi={}
for k,sigs in windows.items():
    channels=set(s['channel'] for s in sigs)
    if len(channels)>=2:
        multi[k]={'channels':list(channels),'n_channels':len(channels),'signals':len(sigs),'asset':sigs[0]['asset'],'directions':list(set(s['direction'] for s in sigs)),'results':list(set(s['result'].lower() for s in sigs))}

print(f"Total 15-min windows: {len(windows)}")
print(f"Windows with 2+ channels: {len(multi)}")

# Analyze confluence results
if multi:
    agree=0;disagree=0;agree_win=0;agree_loss=0
    for k,v in multi.items():
        dirs=v['directions']
        if len(dirs)==1:  # All agree on direction
            agree+=1
            results=[s['result'].lower() for s in windows[k]]
            w=sum(1 for r in results if r=='win')
            l=sum(1 for r in results if r=='loss')
            if w>l:agree_win+=1
            else:agree_loss+=1
        else:
            disagree+=1
    print(f"\nAll channels agree: {agree} (WR: {round(agree_win/(agree_win+agree_loss)*100,1) if (agree_win+agree_loss) else 0}%)")
    print(f"Channels disagree: {disagree}")

# Channel pair overlap analysis
from itertools import combinations
pair_stats=defaultdict(lambda:{'agree':0,'disagree':0,'agree_win':0,'agree_loss':0})
for k,sigs in windows.items():
    channels=list(set(s['channel'] for s in sigs))
    if len(channels)<2:continue
    for c1,c2 in combinations(sorted(channels),2):
        s1=[s for s in sigs if s['channel']==c1]
        s2=[s for s in sigs if s['channel']==c2]
        d1=set(s['direction'] for s in s1)
        d2=set(s['direction'] for s in s2)
        if d1&d2:  # agree
            pair_stats[(c1,c2)]['agree']+=1
            res=[s['result'].lower() for s in s1+s2]
            if res.count('win')>res.count('loss'):
                pair_stats[(c1,c2)]['agree_win']+=1
            else:
                pair_stats[(c1,c2)]['agree_loss']+=1
        else:
            pair_stats[(c1,c2)]['disagree']+=1

print("\n=== CHANNEL PAIR OVERLAPS ===")
for (c1,c2),v in sorted(pair_stats.items(),key=lambda x:-x[1]['agree']):
    t=v['agree_win']+v['agree_loss']
    wr=round(v['agree_win']/t*100,1) if t else 0
    print(f"  {c1:15s} x {c2:15s}: {v['agree']} agree ({wr}% WR), {v['disagree']} disagree")

json.dump({'multi_channel_windows':len(multi),'total_windows':len(windows),'pair_stats':{f"{k[0]}_{k[1]}":v for k,v in pair_stats.items()}},open('intelligence/cross_channel.json','w'),indent=2)
